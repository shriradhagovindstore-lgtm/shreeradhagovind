import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Product } from "../models/Product";
import { StockHistory } from "../models/StockHistory";
import { WaitingList } from "../models/WaitingList";
import { requireAuth, requireStaff } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { logAuditEvent } from "../services/audit.service";
import {
  LOW_STOCK_THRESHOLD,
  OUT_OF_STOCK_WINDOW_MS,
  manualAdjustStock,
  getStockClassification,
} from "../services/inventory.service";

const r = Router();
r.use(requireAuth, requireStaff);

/**
 * GET /api/admin/inventory
 * Returns inventory metrics and paginated/filtered product stock list.
 */
r.get("/", async (req, res, next) => {
  try {
    const {
      search,
      status,
      sort = "stock_asc",
      page = "1",
      limit = "50",
    } = req.query as Record<string, string | undefined>;

    const now = Date.now();
    const cutoff24h = new Date(now - OUT_OF_STOCK_WINDOW_MS);

    // Compute storewide inventory metrics
    const [totalProducts, inStockCount, lowStockCount, outOfStockCount, hiddenCount] =
      await Promise.all([
        Product.countDocuments(),
        Product.countDocuments({ stock: { $gt: LOW_STOCK_THRESHOLD } }),
        Product.countDocuments({ stock: { $gte: 1, $lte: LOW_STOCK_THRESHOLD } }),
        Product.countDocuments({ stock: { $lte: 0 } }),
        Product.countDocuments({
          stock: { $lte: 0 },
          $or: [
            { outOfStockSince: { $exists: false } },
            { outOfStockSince: null },
            { outOfStockSince: { $lte: cutoff24h } },
          ],
        }),
      ]);

    // Build filter query for products table
    const filter: any = {};

    if (search && search.trim()) {
      const safeSearch = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
        { hsnCode: { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (status === "in_stock") {
      filter.stock = { $gt: LOW_STOCK_THRESHOLD };
    } else if (status === "low_stock") {
      filter.stock = { $gte: 1, $lte: LOW_STOCK_THRESHOLD };
    } else if (status === "out_of_stock") {
      filter.stock = { $lte: 0 };
    } else if (status === "hidden") {
      filter.stock = { $lte: 0 };
      filter.$or = [
        { outOfStockSince: { $exists: false } },
        { outOfStockSince: null },
        { outOfStockSince: { $lte: cutoff24h } },
      ];
    }

    // Sort options
    let sortQuery: any = { stock: 1 };
    if (sort === "stock_desc") sortQuery = { stock: -1 };
    else if (sort === "name_asc") sortQuery = { name: 1 };
    else if (sort === "updated_desc") sortQuery = { updatedAt: -1 };
    else if (sort === "created_desc") sortQuery = { createdAt: -1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [filteredCount, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).sort(sortQuery).skip(skip).limit(limitNum).lean(),
    ]);

    // Aggregate active waitlist counts for these products
    const productIds = products.map((p) => p._id);
    const waitlistCounts = await WaitingList.aggregate([
      { $match: { productId: { $in: productIds }, status: "waiting" } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]);
    const waitlistMap = new Map<string, number>(
      waitlistCounts.map((w) => [String(w._id), w.count])
    );

    const enrichedProducts = products.map((p) => {
      const currentStock = Number(p.stock ?? 0);
      const stockStatus = getStockClassification(currentStock);
      const outOfStockSince = p.outOfStockSince ? new Date(p.outOfStockSince) : null;
      const isHidden =
        currentStock <= 0 && (!outOfStockSince || outOfStockSince <= cutoff24h);

      return {
        ...p,
        id: String(p._id),
        stockStatus,
        isHiddenFromStorefront: isHidden,
        waitlistCount: waitlistMap.get(String(p._id)) ?? 0,
      };
    });

    res.json({
      metrics: {
        totalProducts,
        inStockCount,
        lowStockCount,
        outOfStockCount,
        hiddenFromStorefrontCount: hiddenCount,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        outOfStockWindowMs: OUT_OF_STOCK_WINDOW_MS,
      },
      pagination: {
        total: filteredCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(filteredCount / limitNum),
      },
      products: enrichedProducts,
    });
  } catch (e) {
    next(e);
  }
});

const adjustSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  action: z.enum(["add", "remove", "set"]),
  quantity: z.number().int().min(0, "Quantity must be a positive integer"),
  reason: z.string().min(1, "Reason is required"),
  note: z.string().optional().default(""),
});

/**
 * POST /api/admin/inventory/adjust
 * Safely adjusts product stock and creates a StockHistory audit entry.
 */
r.post("/adjust", async (req, res, next) => {
  try {
    const data = adjustSchema.parse(req.body);

    if (data.reason.trim().toLowerCase() === "other" && (!data.note || !data.note.trim())) {
      throw new HttpError(400, 'An explanatory note is required when reason is "Other".');
    }

    const actorRole = req.user?.role === "shop_manager" ? "shop_manager" : "admin";
    const result = await manualAdjustStock({
      productId: data.productId,
      action: data.action,
      quantity: data.quantity,
      reason: data.reason,
      note: data.note,
      actorId: req.user?.sub ? new mongoose.Types.ObjectId(req.user.sub) : null,
      actorType: actorRole,
    });

    logAuditEvent({
      actorId: req.user!.sub,
      actorRole,
      actorEmail: req.user?.email,
      action: "stock.adjust",
      targetType: "inventory",
      targetId: String(result.product._id),
      targetIdentifier: result.product.name,
      metadata: {
        action: data.action,
        quantity: data.quantity,
        previousStock: result.previousStock,
        newStock: result.newStock,
        delta: result.delta,
        reason: data.reason,
        note: data.note,
      },
    }).catch(() => {});

    res.json({
      ok: true,
      message: `Stock successfully updated from ${result.previousStock} to ${result.newStock} (delta: ${result.delta >= 0 ? "+" + result.delta : result.delta})`,
      product: result.product,
      historyEntry: result.historyEntry,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/inventory/history
 * Returns paginated stock movement history.
 */
r.get("/history", async (req, res, next) => {
  try {
    const {
      productId,
      movementType,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string | undefined>;

    const filter: any = {};
    if (productId && mongoose.isValidObjectId(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }
    if (movementType && movementType !== "all") {
      filter.movementType = movementType;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [total, entries] = await Promise.all([
      StockHistory.countDocuments(filter),
      StockHistory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("productId", "name image price category")
        .populate("actorId", "name email")
        .lean(),
    ]);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      entries,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/admin/inventory/waitlist
 * Returns active back-in-stock waiting list requests.
 */
r.get("/waitlist", async (req, res, next) => {
  try {
    const { productId, status = "waiting" } = req.query as Record<string, string | undefined>;
    const filter: any = {};
    if (productId && mongoose.isValidObjectId(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }
    if (status && status !== "all") {
      filter.status = status;
    }

    const waitlist = await WaitingList.find(filter)
      .sort({ createdAt: -1 })
      .populate("productId", "name image price stock category")
      .populate("user", "name email phone")
      .lean();

    res.json({ waitlist });
  } catch (e) {
    next(e);
  }
});

export default r;
