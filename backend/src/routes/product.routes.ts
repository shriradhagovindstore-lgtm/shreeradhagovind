import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Product } from "../models/Product";
import { Category } from "../models/Category";
import { WaitingList } from "../models/WaitingList";
import { requireAuth, requireAdmin, requireStaff, optionalAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { manualAdjustStock, OUT_OF_STOCK_WINDOW_MS } from "../services/inventory.service";
import { logAuditEvent } from "../services/audit.service";

const r = Router();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

r.get("/", optionalAuth, async (req, res, next) => {
  try {
    const { category, q, sort } = req.query as Record<string, string | undefined>;
    const isStaff = req.user?.role === "admin" || req.user?.role === "shop_manager";
    const isSuperAdmin = req.user?.role === "admin";

    const filter: any = {};
    if (!isStaff) {
      // 24-hour storefront rule:
      // Active products with stock > 0 are visible.
      // Active products with stock <= 0 are visible ONLY if outOfStockSince is within exactly 24 hours.
      const cutoff = new Date(Date.now() - OUT_OF_STOCK_WINDOW_MS);
      filter.isActive = true;
      filter.$or = [
        { stock: { $gt: 0 } },
        { stock: { $lte: 0 }, outOfStockSince: { $gt: cutoff } },
      ];
    }

    if (category && category !== "all") {
      const parent = await Category.findOne({ name: category });
      if (parent) {
        const children = await Category.find({ parentId: parent._id, isActive: true });
        const names = [parent.name, ...children.map((c) => c.name)];
        filter.category = { $in: names };
      } else {
        filter.category = category;
      }
    }

    if (q && q.trim()) {
      const safeQ = q.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      if (safeQ) filter.name = { $regex: safeQ, $options: "i" };
    }

    const sortMap: Record<string, any> = {
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      rating: { rating: -1 },
    };

    const query = Product.find(filter).sort(sortMap[sort ?? "newest"] ?? { createdAt: -1 });
    if (!isSuperAdmin) {
      query.select("-costPrice");
    }
    const products = await query;
    res.json({ products });
  } catch (e) {
    next(e);
  }
});

r.get("/:idOrSlug", optionalAuth, async (req, res, next) => {
  try {
    const idOrSlug = String(req.params.idOrSlug);
    const looksLikeObjectId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const isStaff = req.user?.role === "admin" || req.user?.role === "shop_manager";
    const isSuperAdmin = req.user?.role === "admin";
    const selectStr = isSuperAdmin ? "" : "-costPrice";

    let p = looksLikeObjectId
      ? await Product.findById(idOrSlug).select(selectStr)
      : await Product.findOne({ slug: idOrSlug }).select(selectStr);

    if (!p && !looksLikeObjectId) {
      const allMatches = await Product.find().select(selectStr);
      p = allMatches.find((product) => slugify(product.name) === idOrSlug) ?? null;
    }

    if (!p) throw new HttpError(404, "Product not found");

    // Customer storefront visibility check (24-hour rule)
    if (!isStaff) {
      const cutoff = new Date(Date.now() - OUT_OF_STOCK_WINDOW_MS);
      const isStockZeroExpired =
        (p.stock ?? 0) <= 0 && (!p.outOfStockSince || new Date(p.outOfStockSince) <= cutoff);

      if (!p.isActive || isStockZeroExpired) {
        throw new HttpError(404, "Product not found");
      }
    }

    res.json({ product: p });
  } catch (e) {
    next(e);
  }
});

// Customer waitlist subscription endpoint for out-of-stock products
r.post("/:id/waitlist", optionalAuth, async (req, res, next) => {
  try {
    const { email, phone } = z
      .object({
        email: z.string().trim().email("Please provide a valid email address"),
        phone: z.string().trim().optional().default(""),
      })
      .parse(req.body);

    const product = await Product.findById(req.params.id);
    if (!product) throw new HttpError(404, "Product not found");

    const normalizedEmail = email.toLowerCase().trim();
    const userId = req.user?.sub ? new mongoose.Types.ObjectId(req.user.sub) : null;

    // Check if customer already has an active waiting request for this product
    const existing = await WaitingList.findOne({
      productId: product._id,
      email: normalizedEmail,
      status: "waiting",
    });

    if (existing) {
      return res.json({
        ok: true,
        alreadyWaiting: true,
        message: "You are already on the waiting list for this item. We will notify you when it becomes available!",
      });
    }

    await WaitingList.create({
      productId: product._id,
      user: userId,
      email: normalizedEmail,
      phone: (phone || "").trim(),
      status: "waiting",
    });

    res.json({
      ok: true,
      alreadyWaiting: false,
      message: "You have been added to the waiting list! We will notify you when this item is back in stock.",
    });
  } catch (e) {
    next(e);
  }
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  price: z.number().min(0),
  mrp: z.number().min(0).optional().default(0),
  costPrice: z.number().min(0).optional().default(0),
  image: z.string().optional().default(""),
  images: z.array(z.string()).optional().default([]),
  slug: z.string().optional().default(""),
  featuredDeal: z.boolean().optional().default(false),
  category: z.string().min(1),
  stock: z.number().min(0).optional().default(100),
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().min(0).optional(),
  details: z.array(z.string()).optional().default([]),
  hsnCode: z.string().optional().default(""),
  gstRate: z.number().min(0).max(28).optional().default(0),
  gstInclusive: z.boolean().optional().default(true),
  isTaxable: z.boolean().optional().default(true),
  metaTitle: z.string().optional().default(""),
  metaDescription: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
  codEligible: z.boolean().optional().default(true),
  additionalImage: z.string().optional().default(""),
  additionalHeading: z.string().optional().default(""),
  additionalContent: z.string().optional().default(""),
  comboComponents: z
    .array(
      z.object({
        name: z.string().min(1, "Component name is required"),
        qty: z.number().min(1).default(1),
        hsnCode: z.string().trim().min(2, "HSN code is required for each combo component"),
        gstRate: z.number().min(0).max(28),
        gstInclusive: z.boolean().optional().default(true),
        costPrice: z.number().min(0).optional().default(0),
        baseValue: z.number().min(0).optional().default(0),
      })
    )
    .optional()
    .default([]),
});

r.post("/", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const p = await Product.create({
      ...data,
      slug: slugify(data.slug || data.name),
      outOfStockSince: (data.stock ?? 100) <= 0 ? new Date() : null,
    });

    const actorRole = req.user?.role === "shop_manager" ? "shop_manager" : "admin";
    logAuditEvent({
      actorId: req.user!.sub,
      actorRole,
      actorEmail: req.user?.email,
      action: "product.create",
      targetType: "product",
      targetId: String(p._id),
      targetIdentifier: p.name,
      metadata: { name: p.name, slug: p.slug, price: p.price, category: p.category, isActive: p.isActive },
    }).catch(() => {});

    res.status(201).json({ product: p });
  } catch (e) {
    next(e);
  }
});

r.patch("/:id", requireAuth, requireStaff, async (req, res, next) => {
  try {
    const data = productSchema.partial().parse(req.body);
    const patch: any = { ...data };
    if (data.name || data.slug) patch.slug = slugify(data.slug || data.name!);

    const existing = await Product.findById(req.params.id);
    if (!existing) throw new HttpError(404, "Not found");

    // Strict Stale-Stock Protection:
    // Normal product metadata updates (PATCH /api/products/:id) must NOT modify product stock.
    // Inventory changes are strictly controlled by the dedicated Inventory adjustment workflow
    // (/api/admin/inventory/adjust) to ensure mandatory reasons, audit logs, and race-free accuracy.
    // If incoming patch contains stock, safely delete it so live inventory is never clobbered.
    if (patch.stock !== undefined) {
      delete patch.stock;
    }

    const p = await Product.findByIdAndUpdate(req.params.id, patch, {
      new: true,
      runValidators: true,
    });
    if (!p) throw new HttpError(404, "Not found");

    const actorRole = req.user?.role === "shop_manager" ? "shop_manager" : "admin";
    let action = "product.update";
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      action = patch.isActive ? "product.publish" : "product.unpublish";
    }

    logAuditEvent({
      actorId: req.user!.sub,
      actorRole,
      actorEmail: req.user?.email,
      action,
      targetType: "product",
      targetId: String(p._id),
      targetIdentifier: p.name,
      metadata: {
        name: p.name,
        slug: p.slug,
        price: p.price,
        category: p.category,
        isActive: p.isActive,
        changedFields: Object.keys(patch),
      },
    }).catch(() => {});

    res.json({ product: p });
  } catch (e) {
    next(e);
  }
});

r.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    await Product.findByIdAndDelete(req.params.id);

    logAuditEvent({
      actorId: req.user!.sub,
      actorRole: "admin",
      actorEmail: req.user?.email,
      action: "product.delete",
      targetType: "product",
      targetId: String(req.params.id),
      targetIdentifier: existing?.name || String(req.params.id),
    }).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default r;
