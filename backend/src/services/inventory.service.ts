import mongoose, { type Types } from "mongoose";
import { Product } from "../models/Product";
import { StockHistory } from "../models/StockHistory";
import { HttpError } from "../middleware/error";

export const LOW_STOCK_THRESHOLD = 5;
export const OUT_OF_STOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // exactly 24 hours

export type StockClassification = "in_stock" | "low_stock" | "out_of_stock";

export function getStockClassification(stock: number): StockClassification {
  if (stock > LOW_STOCK_THRESHOLD) return "in_stock";
  if (stock >= 1 && stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "out_of_stock";
}

/**
 * Evaluates whether a product is customer-visible on the storefront.
 * Rule:
 * 1. Must be active (isActive === true).
 * 2. If stock > 0: Visible.
 * 3. If stock <= 0: Visible ONLY within exactly 24 hours of outOfStockSince.
 * 4. If stock <= 0 and outOfStockSince is missing/null/older than 24h: Hidden.
 */
export function isProductCustomerVisible(
  product: {
    isActive?: boolean;
    stock?: number;
    outOfStockSince?: Date | null;
  } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!product || product.isActive === false) return false;
  const currentStock = Number(product.stock ?? 0);
  if (currentStock > 0) return true;

  // Out of stock case
  if (!product.outOfStockSince) {
    // Missing out-of-stock timestamp on existing/legacy 0-stock products:
    // Safe storefront rule: not within the 24-hour grace window, so hidden.
    return false;
  }

  const outOfStockTime = new Date(product.outOfStockSince).getTime();
  if (isNaN(outOfStockTime)) return false;

  const elapsed = nowMs - outOfStockTime;
  return elapsed < OUT_OF_STOCK_WINDOW_MS;
}

/**
 * Builds the MongoDB query condition for customer-facing storefront product queries.
 */
export function buildCustomerStorefrontQuery(baseFilter: any = {}, now: Date = new Date()): any {
  const cutoff = new Date(now.getTime() - OUT_OF_STOCK_WINDOW_MS);
  return {
    ...baseFilter,
    isActive: true,
    $or: [
      { stock: { $gt: 0 } },
      { stock: { $lte: 0 }, outOfStockSince: { $gt: cutoff } },
    ],
  };
}

export interface DecrementItem {
  productId: string | Types.ObjectId;
  qty: number;
  name?: string;
}

export interface DecrementOrderStockResult {
  success: boolean;
  decrementedProducts: Array<{
    productId: string;
    productName: string;
    previousStock: number;
    newStock: number;
    qty: number;
  }>;
  recordHistory: (orderId: Types.ObjectId | any, orderNo?: number | null) => Promise<void>;
  rollback: () => Promise<void>;
}

/**
 * Safely decrements stock for multiple order items.
 * Guarantees all-or-nothing semantics:
 * If ANY item in the batch fails stock validation, ALL already-decremented items
 * in the same batch are immediately and atomically restored via compensating updates.
 */
export async function decrementOrderStockSafely(
  items: DecrementItem[],
  actorMeta: {
    actorType: "customer" | "admin" | "system" | "guest";
    actorId?: Types.ObjectId | null;
    source?: string;
  }
): Promise<DecrementOrderStockResult> {
  if (!items || items.length === 0) {
    return {
      success: true,
      decrementedProducts: [],
      recordHistory: async () => {},
      rollback: async () => {},
    };
  }

  const decrementedSoFar: Array<{
    productId: string;
    productName: string;
    previousStock: number;
    newStock: number;
    qty: number;
    previousOutOfStockSince: Date | null;
  }> = [];

  try {
    for (const item of items) {
      const pid = String(item.productId);
      const qty = item.qty;
      if (qty <= 0) continue;

      // 1. Fetch current document to know previousStock and outOfStockSince
      const current = await Product.findById(pid).select("name stock outOfStockSince isActive").lean();
      if (!current || !current.isActive) {
        throw new HttpError(400, `Product "${item.name || pid}" is unavailable`);
      }

      const prevStock = Number(current.stock ?? 0);
      if (prevStock < qty) {
        throw new HttpError(
          409,
          `${current.name || "Item"} has only ${prevStock} left in stock. Please review your cart.`
        );
      }

      const nextStock = prevStock - qty;
      const sets: any = {};
      if (nextStock === 0 && prevStock > 0) {
        sets.outOfStockSince = new Date();
      }

      // 2. Atomic conditional decrement
      const updateDoc: any = { $inc: { stock: -qty } };
      if (Object.keys(sets).length > 0) {
        updateDoc.$set = sets;
      }

      const updated = await Product.findOneAndUpdate(
        {
          _id: pid,
          isActive: true,
          stock: { $gte: qty },
        },
        updateDoc,
        { new: true }
      ).lean();

      if (!updated) {
        throw new HttpError(
          409,
          `Some items just went out of stock: "${current.name}". Please review your cart.`
        );
      }

      decrementedSoFar.push({
        productId: pid,
        productName: current.name,
        previousStock: prevStock,
        newStock: updated.stock,
        qty,
        previousOutOfStockSince: current.outOfStockSince ?? null,
      });
    }

    // Rollback helper for all decremented items in this transaction
    const executeRollback = async () => {
      for (const d of decrementedSoFar) {
        const revertDoc: any = { $inc: { stock: d.qty } };
        // If stock was restored above 0, clear outOfStockSince or restore previous timestamp
        if (d.previousStock > 0) {
          revertDoc.$set = { outOfStockSince: d.previousOutOfStockSince };
        }
        await Product.updateOne({ _id: d.productId }, revertDoc);
      }
    };

    // History recording helper once order is confirmed
    const recordHistory = async (orderId: Types.ObjectId | any, orderNo?: number | null) => {
      const historyDocs = decrementedSoFar.map((d) => ({
        productId: new mongoose.Types.ObjectId(d.productId),
        previousStock: d.previousStock,
        newStock: d.newStock,
        delta: -d.qty,
        movementType: "purchase" as const,
        reason: "Customer purchase",
        note: `Order #${orderNo ?? orderId}`,
        actorId: actorMeta.actorId ?? null,
        actorType: actorMeta.actorType,
        orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
        orderNo: orderNo ?? null,
        source: actorMeta.source || "checkout",
      }));

      if (historyDocs.length > 0) {
        await StockHistory.insertMany(historyDocs);
      }
    };

    return {
      success: true,
      decrementedProducts: decrementedSoFar.map(({ productId, productName, previousStock, newStock, qty }) => ({
        productId,
        productName,
        previousStock,
        newStock,
        qty,
      })),
      recordHistory,
      rollback: executeRollback,
    };
  } catch (err) {
    // Immediate compensating rollback on any error
    for (const d of decrementedSoFar) {
      try {
        const revertDoc: any = { $inc: { stock: d.qty } };
        if (d.previousStock > 0) {
          revertDoc.$set = { outOfStockSince: d.previousOutOfStockSince };
        }
        await Product.updateOne({ _id: d.productId }, revertDoc);
      } catch (rollbackErr) {
        // eslint-disable-next-line no-console
        console.error(`[decrementOrderStockSafely] Critical rollback error for product ${d.productId}:`, rollbackErr);
      }
    }
    throw err;
  }
}

/**
 * Restores stock for items belonging to an order and writes audit entries.
 */
export async function restockOrderItemsWithHistory(params: {
  orderId: Types.ObjectId | any;
  orderNo?: number | null;
  items: Array<{ productId?: any; qty: number; name?: string | null }>;
  reason: string;
  cancelledBy: "customer" | "admin" | "system";
  actorId?: Types.ObjectId | null;
}): Promise<{ restockedCount: number; itemsRestocked: number }> {
  const { orderId, orderNo, items, reason, cancelledBy, actorId } = params;
  if (!items || items.length === 0) return { restockedCount: 0, itemsRestocked: 0 };

  // Aggregate quantities by productId
  const qtyMap = new Map<string, { qty: number; name?: string }>();
  for (const item of items) {
    if (!item.productId || typeof item.qty !== "number" || item.qty <= 0) continue;
    const pid = String(item.productId);
    const existing = qtyMap.get(pid);
    qtyMap.set(pid, {
      qty: (existing?.qty || 0) + item.qty,
      name: item.name || existing?.name,
    });
  }

  if (qtyMap.size === 0) return { restockedCount: 0, itemsRestocked: 0 };

  let restockedCount = 0;
  const historyDocs: any[] = [];

  for (const [pid, entry] of qtyMap.entries()) {
    // Atomically increment stock and clear outOfStockSince (stock is now positive)
    const productBefore = await Product.findById(pid).select("stock name").lean();
    if (!productBefore) continue;

    const prevStock = Number(productBefore.stock ?? 0);
    const updated = await Product.findOneAndUpdate(
      { _id: pid },
      {
        $inc: { stock: entry.qty },
        $set: { outOfStockSince: null },
      },
      { new: true }
    ).lean();

    if (updated) {
      restockedCount++;
      historyDocs.push({
        productId: new mongoose.Types.ObjectId(pid),
        previousStock: prevStock,
        newStock: updated.stock,
        delta: entry.qty,
        movementType: "cancellation_restock" as const,
        reason: reason || "Order cancelled",
        note: `Order #${orderNo ?? orderId}`,
        actorId: actorId ?? null,
        actorType: cancelledBy,
        orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
        orderNo: orderNo ?? null,
        source: "cancellation",
      });
    }
  }

  if (historyDocs.length > 0) {
    try {
      await StockHistory.insertMany(historyDocs);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[restockOrderItemsWithHistory] Failed to insert StockHistory:", err);
    }
  }

  return {
    restockedCount,
    itemsRestocked: qtyMap.size,
  };
}

export const VALID_ADJUSTMENT_REASONS = [
  "Received New Stock",
  "Physical Recount",
  "Damaged / Broken",
  "Return",
  "Correction",
  "Other",
] as const;

export type ValidAdjustmentReason = (typeof VALID_ADJUSTMENT_REASONS)[number];

export interface AdjustStockParams {
  productId: string | Types.ObjectId;
  action: "add" | "remove" | "set";
  quantity: number;
  reason: string;
  note?: string;
  actorId?: Types.ObjectId | null;
  actorType?: "admin" | "system" | "shop_manager";
}

/**
 * Manually adjusts a product's stock with required reason, audit logging,
 * and automatic management of outOfStockSince.
 */
export async function manualAdjustStock(params: AdjustStockParams) {
  const { productId, action, quantity, reason, note = "", actorId, actorType = "admin" } = params;

  if (!productId) throw new HttpError(400, "Product ID is required");
  if (typeof quantity !== "number" || isNaN(quantity) || quantity < 0) {
    throw new HttpError(400, "Quantity must be a non-negative number");
  }

  const cleanReason = (reason || "").trim();
  if (!cleanReason) {
    throw new HttpError(400, "A valid stock adjustment reason is required");
  }

  if (!VALID_ADJUSTMENT_REASONS.includes(cleanReason as ValidAdjustmentReason)) {
    throw new HttpError(
      400,
      `Invalid reason. Must be one of: ${VALID_ADJUSTMENT_REASONS.join(", ")}`
    );
  }

  const cleanNote = (note || "").trim();
  if (cleanReason === "Other" && !cleanNote) {
    throw new HttpError(400, 'When reason is "Other", an explanatory note is required');
  }

  const product = await Product.findById(productId);
  if (!product) throw new HttpError(404, "Product not found");

  const prevStock = Number(product.stock ?? 0);
  let newStock = prevStock;
  let delta = 0;

  if (action === "add") {
    if (quantity <= 0) throw new HttpError(400, "Add quantity must be greater than 0");
    delta = quantity;
    newStock = prevStock + delta;
  } else if (action === "remove") {
    if (quantity <= 0) throw new HttpError(400, "Remove quantity must be greater than 0");
    if (quantity > prevStock) {
      throw new HttpError(
        400,
        `Cannot remove ${quantity} units. Product only has ${prevStock} units in stock.`
      );
    }
    delta = -quantity;
    newStock = prevStock + delta;
  } else if (action === "set") {
    newStock = quantity;
    delta = newStock - prevStock;
  } else {
    throw new HttpError(400, 'Invalid adjustment action. Must be "add", "remove", or "set".');
  }

  // Update outOfStockSince
  if (newStock === 0 && prevStock > 0) {
    product.outOfStockSince = new Date();
  } else if (newStock > 0) {
    product.outOfStockSince = null;
  }
  // If product was already 0 and remains 0, preserve existing outOfStockSince or initialize if null
  else if (newStock === 0 && prevStock === 0 && !product.outOfStockSince) {
    product.outOfStockSince = new Date();
  }

  product.stock = newStock;
  await product.save();

  // Create StockHistory entry
  const historyEntry = await StockHistory.create({
    productId: product._id,
    previousStock: prevStock,
    newStock,
    delta,
    movementType: "manual_adjustment",
    reason: cleanReason,
    note: cleanNote,
    actorId: actorId ?? null,
    actorType,
    source: "admin_inventory",
  });

  return {
    product,
    historyEntry,
    previousStock: prevStock,
    newStock,
    delta,
  };
}
