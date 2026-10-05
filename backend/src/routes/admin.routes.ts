import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { Order } from "../models/Order";
import { User } from "../models/User";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import {
  sendEmail,
  sendOrderConfirmationWithInvoice,
  sendOrderStatusUpdate,
  sendOrderStatusUpdateWithInvoice,
  dispatchOrderInvoiceEmailOnce,
  dispatchOrderDeliveredEmailOnce,
  dispatchOrderCancelledEmailOnce,
  dispatchOrderRefundedEmailOnce,
  dispatchRequestedInvoiceEmail,
  tpl,
  formatOrderNumber,
} from "../utils/email";
import { generateInvoicePDF, type InvoiceData } from "../utils/invoice";
import { getCourierTrackingUrl } from "../utils/courier";
import {
  syncOrderTracking,
  requestManualTrackingRefresh,
  syncAllActiveShipments,
  getQuotaInfo,
} from "../services/courierTracking.service";
import { restockOrderItems } from "../services/cancellation.service";
import {
  earnPointsForOrder,
  reversePointsForOrder,
  getLoyaltySettings,
  calculateCustomerTier,
} from "../services/loyalty.service";

const r = Router();
r.use(requireAuth, requireAdmin);

export function isOrderPaidForFinance(order: any): boolean {
  if (!order || order.status === "Cancelled") return false;
  const pStatus = order.payment?.status;
  if (pStatus === "failed" || pStatus === "refunded") return false;
  if (pStatus === "paid") return true;
  // For COD orders, cash is collected upon successful delivery
  if (order.payment?.method === "cod" && order.status === "Delivered") return true;
  return false;
}

export function computeOrderFinances(order: any, customCourierCharge?: number) {
  const isPaidSale = isOrderPaidForFinance(order);
  const items = order.items || [];
  let isCostAvailable = items.length > 0;
  let totalProductCost = 0;

  for (const item of items) {
    const retainedQty = Math.max(0, (Number(item.qty) || 1) - (Number(item.returnedQty) || 0));
    if (item.comboComponents && item.comboComponents.length > 0) {
      const allCompsHaveCost = item.comboComponents.every(
        (c: any) => typeof c.costPrice === "number" && c.costPrice > 0
      );
      if (allCompsHaveCost) {
        const compCost = item.comboComponents.reduce(
          (sum: number, c: any) => sum + Number(c.costPrice) * (Number(c.qty) || 1),
          0
        );
        totalProductCost += compCost * retainedQty;
      } else if (typeof item.costPrice === "number" && item.costPrice > 0) {
        totalProductCost += Number(item.costPrice) * retainedQty;
      } else {
        isCostAvailable = false;
        break;
      }
    } else {
      if (typeof item.costPrice === "number" && item.costPrice > 0) {
        totalProductCost += Number(item.costPrice) * retainedQty;
      } else {
        isCostAvailable = false;
        break;
      }
    }
  }

  const subtotal = Number(order.subtotal);
  const total = Number(order.total) || 0;
  const shipping = Number(order.shipping) || 0;
  const codFee = Number(order.codFee) || 0;
  const refundedAmount = Number(order.refundedAmount) || 0;

  // Net realized revenue excludes refunded amount from partial returns
  const realizedRevenue = Math.max(0, total - refundedAmount);

  // Packaging Cost = Net Retained Order Value x 2%. Excludes shipping & COD fee! Only applicable to paid sales
  const orderValue = !isNaN(subtotal) && subtotal > 0 ? subtotal : Math.max(0, total - shipping - codFee);
  const netOrderValue = Math.max(0, orderValue - refundedAmount);
  const packagingCost = isPaidSale ? Math.round(netOrderValue * 0.02 * 100) / 100 : 0;

  const isPaidOnline = order.payment?.method === "razorpay" && order.payment?.status === "paid";
  const razorpayFee = isPaidOnline ? Math.round(total * 0.0236 * 100) / 100 : 0;

  const courierCharge =
    customCourierCharge !== undefined
      ? Number(customCourierCharge)
      : (typeof order.courierCharge === "number" ? order.courierCharge : 0);

  if (!isPaidSale) {
    return {
      isCostAvailable,
      isPaidSale: false,
      realizedRevenue: 0,
      productCost: isCostAvailable ? Math.round(totalProductCost * 100) / 100 : null,
      packagingCost: 0,
      razorpayFee: 0,
      courierCharge,
      totalExpense: null,
      netProfit: null,
    };
  }

  if (isCostAvailable) {
    const productCost = Math.round(totalProductCost * 100) / 100;
    const totalExpense = Math.round((productCost + packagingCost + razorpayFee + courierCharge) * 100) / 100;
    const netProfit = Math.round((realizedRevenue - totalExpense) * 100) / 100;
    return {
      isCostAvailable: true,
      isPaidSale: true,
      realizedRevenue,
      productCost,
      packagingCost,
      razorpayFee,
      courierCharge,
      totalExpense,
      netProfit,
    };
  } else {
    return {
      isCostAvailable: false,
      isPaidSale: true,
      realizedRevenue,
      productCost: null,
      packagingCost,
      razorpayFee,
      courierCharge,
      totalExpense: null,
      netProfit: null,
    };
  }
}

r.get("/orders", async (_req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).populate("user", "name email");
    const enriched = orders.map((o) => {
      const obj = o.toObject();
      const isPaid = isOrderPaidForFinance(obj);
      const f = computeOrderFinances(obj);
      return {
        ...obj,
        productCost: f.productCost,
        packagingCost: isPaid ? (obj.packagingCost ?? f.packagingCost) : 0,
        razorpayFee: isPaid ? (obj.razorpayFee ?? f.razorpayFee) : 0,
        courierCharge: obj.courierCharge ?? f.courierCharge,
        totalExpense: isPaid && f.isCostAvailable ? f.totalExpense : null,
        netProfit: isPaid && f.isCostAvailable ? f.netProfit : null,
        isCostAvailable: f.isCostAvailable,
      };
    });
    res.json({ orders: enriched });
  } catch (e) {
    next(e);
  }
});

// Update courier charge and recalculate finances for an order
r.patch("/orders/:id/courier-charge", async (req, res, next) => {
  try {
    const { courierCharge } = z
      .object({
        courierCharge: z.number().min(0),
      })
      .parse(req.body);

    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) throw new HttpError(404, "Order not found");

    const finances = computeOrderFinances(order, courierCharge);
    order.courierCharge = finances.courierCharge;
    order.packagingCost = finances.packagingCost;
    order.razorpayFee = finances.razorpayFee;
    if (finances.isCostAvailable && finances.isPaidSale) {
      order.productCost = finances.productCost as number;
      order.totalExpense = finances.totalExpense as number;
      order.netProfit = finances.netProfit as number;
    } else {
      order.productCost = undefined;
      order.totalExpense = undefined;
      order.netProfit = undefined;
    }
    await order.save();

    res.json({ order });
  } catch (e) {
    next(e);
  }
});

// Combined update: status / courier / tracking id / courier URL
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Placed: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Cancelled"],
  Processing: ["Hold", "Packed", "Cancelled"],
  Hold: ["Processing", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for delivery", "Delivered"],
  "Out for delivery": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

// Legacy: status-only update
r.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const { status, note } = z
      .object({
        status: z.enum([
          "Placed",
          "Confirmed",
          "Processing",
          "Packed",
          "Shipped",
          "Out for delivery",
          "Delivered",
          "Cancelled",
        ]),
        note: z.string().optional(),
      })
      .parse(req.body);

    const existing = await Order.findById(req.params.id);
    if (!existing) throw new HttpError(404, "Not found");

    if (status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new HttpError(
          400,
          `Invalid status transition: Cannot change order from "${existing.status}" to "${status}".`
        );
      }
    }

    const update: any = {
      status,
      $push: {
        statusHistory: {
          status,
          changedAt: new Date(),
          changedBy: "admin",
          note: note?.trim() || "",
        },
      },
    };

    if (status === "Cancelled") {
      const cleanReason = (note || "").trim();
      if (!cleanReason) {
        throw new HttpError(400, "A cancellation reason is required when cancelling an order.");
      }
      update.cancellationReason = cleanReason;
      update.cancelledBy = "admin";
      update.cancelledAt = new Date();
      update.isRestocked = true;
      update.restockedAt = new Date();
    }

    if (status === "Delivered" && !existing.deliveredAt) {
      update.deliveredAt = new Date();
    }

    const o = await Order.findByIdAndUpdate(req.params.id, update, { new: true }).populate("user", "name email");
    if (!o) throw new HttpError(404, "Not found");

    if (status === "Cancelled" && existing.status !== "Cancelled" && !existing.isRestocked) {
      await restockOrderItems(o);
      reversePointsForOrder(o).catch((err) => console.error("[reversePointsForOrder:error]", err));
    }

    if (status === "Delivered" && existing.status !== "Delivered") {
      earnPointsForOrder(o).catch((err) => console.error("[earnPointsForOrder:error]", err));
    }

    const u: any = o.user;
    const recipientEmail = o.customerEmail || u?.email;
    const recipientName = o.address?.name || u?.name || "Customer";

    if (recipientEmail && status !== existing.status) {
      if (!o.invoiceSentAt && (status === "Confirmed" || status === "Processing")) {
        dispatchOrderInvoiceEmailOnce(o._id, recipientEmail, recipientName, buildEmailOrder(o)).catch(() => {});
      } else if (status === "Delivered") {
        dispatchOrderDeliveredEmailOnce(o._id, recipientEmail, recipientName, buildEmailOrder(o) as any).catch(() => {});
      } else if (status === "Cancelled") {
        dispatchOrderCancelledEmailOnce(
          o,
          recipientEmail,
          recipientName,
          o.cancellationReason || note?.trim() || "Cancelled by store administrator"
        ).catch(() => {});
      } else {
        sendOrderStatusUpdate(recipientEmail, recipientName, buildEmailOrder(o)).catch(() => {});
      }
    }
    res.json({ order: o });
  } catch (e) {
    next(e);
  }
});

r.patch("/orders/:id", async (req, res, next) => {
  try {
    const data = z
      .object({
        status: z
          .enum([
            "Placed",
            "Confirmed",
            "Processing",
            "Hold",
            "Packed",
            "Shipped",
            "Out for delivery",
            "Delivered",
            "Cancelled",
          ])
          .optional(),
        holdReason: z.string().optional(),
        note: z.string().optional(),
        courier: z
          .enum([
            "Ekart",
            "DTDC",
            "Shree Maruti",
            "Shree Murti",
            "India Post",
            "Delhivery",
            "Bluedart",
          ])
          .nullable()
          .optional(),
        trackingId: z.string().min(3).max(40).optional(),
        courierTrackingUrl: z.string().url().or(z.literal("")).optional(),
      })
      .parse(req.body);

    const existing = await Order.findById(req.params.id);
    if (!existing) throw new HttpError(404, "Not found");

    const update: any = {};

    if (data.status !== undefined && data.status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(data.status)) {
        throw new HttpError(
          400,
          `Invalid status transition: Cannot change order from "${existing.status}" to "${data.status}".`
        );
      }

      if (data.status === "Hold") {
        const cleanHoldReason = (data.holdReason || "").trim();
        if (!cleanHoldReason) {
          throw new HttpError(400, "A hold reason is mandatory when placing an order on hold.");
        }
        update.holdReason = cleanHoldReason;
        update.holdAt = new Date();
      } else if (existing.status === "Hold" && data.status === "Processing") {
        update.holdReason = "";
      } else if (data.status === "Cancelled") {
        const cleanReason = (data.note || "").trim();
        if (!cleanReason) {
          throw new HttpError(400, "A cancellation reason is required when cancelling an order.");
        }
        update.cancellationReason = cleanReason;
        update.cancelledBy = "admin";
        update.cancelledAt = new Date();
        update.isRestocked = true;
        update.restockedAt = new Date();
      } else if (data.status === "Delivered" && !existing.deliveredAt) {
        update.deliveredAt = new Date();
      }

      update.status = data.status;
      update.$push = {
        statusHistory: {
          status: data.status,
          changedAt: new Date(),
          changedBy: "admin",
          note: data.note?.trim() || "",
          holdReason: data.status === "Hold" ? (data.holdReason || "").trim() : "",
        },
      };
    }

    const requestedCourier = data.courier === "Shree Murti" ? "Shree Maruti" : data.courier;
    if (existing.payment?.method === "cod" && requestedCourier && requestedCourier !== "DTDC") {
      throw new HttpError(400, "COD orders can only be shipped with DTDC");
    }
    if (data.courier !== undefined) update.courier = requestedCourier;
    if (data.trackingId !== undefined) update.trackingId = data.trackingId.toUpperCase();

    const effectiveCourier = data.courier !== undefined ? requestedCourier : existing.courier;
    const effectiveTrackingId =
      data.trackingId !== undefined ? data.trackingId.toUpperCase() : existing.trackingId;

    if (data.courierTrackingUrl !== undefined && data.courierTrackingUrl !== "") {
      update.courierTrackingUrl = data.courierTrackingUrl;
    } else if (effectiveCourier && effectiveTrackingId) {
      update.courierTrackingUrl = getCourierTrackingUrl(effectiveCourier, effectiveTrackingId);
    } else if (data.courierTrackingUrl === "") {
      update.courierTrackingUrl = "";
    }

    const o = await Order.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
      "user",
      "name email"
    );
    if (!o) throw new HttpError(404, "Not found");
    const u: any = o.user;

    const statusChanged = data.status !== undefined && data.status !== existing.status;
    const isNowCancelled = data.status === "Cancelled" && statusChanged;

    if (isNowCancelled && !existing.isRestocked) {
      await restockOrderItems(o);
    }

    const trackingChanged =
      data.trackingId !== undefined && data.trackingId.toUpperCase() !== (existing.trackingId || "");
    const courierChanged = data.courier !== undefined && requestedCourier !== existing.courier;

    const recipientEmail = o.customerEmail || u?.email;
    const recipientName = o.address?.name || u?.name || "Customer";

    // Send notification email only on genuine status change or when tracking is newly assigned to Shipped order
    if (
      recipientEmail &&
      (statusChanged || (existing.status === "Shipped" && (trackingChanged || courierChanged)))
    ) {
      if (!o.invoiceSentAt && (o.status === "Confirmed" || o.status === "Processing")) {
        dispatchOrderInvoiceEmailOnce(o._id, recipientEmail, recipientName, buildEmailOrder(o)).catch(() => {});
      } else if (o.status === "Delivered") {
        dispatchOrderDeliveredEmailOnce(o._id, recipientEmail, recipientName, buildEmailOrder(o) as any).catch(() => {});
      } else if (o.status === "Cancelled") {
        dispatchOrderCancelledEmailOnce(
          o,
          recipientEmail,
          recipientName,
          o.cancellationReason || data.note?.trim() || "Cancelled by store administrator"
        ).catch(() => {});
      } else {
        sendOrderStatusUpdate(recipientEmail, recipientName, buildEmailOrder(o)).catch(() => {});
      }
    }

    // Trigger background courier tracking sync if shipped with trackingId
    if (
      o.courier &&
      o.trackingId &&
      (o.status === "Shipped" || o.status === "Out for delivery" || o.status === "Delivered")
    ) {
      syncOrderTracking(o, { allowRemoteFetch: true }).catch(() => {});
    }

    const obj = o.toObject();
    const isPaid = isOrderPaidForFinance(obj);
    const f = computeOrderFinances(obj);
    const enriched = {
      ...obj,
      productCost: f.productCost,
      packagingCost: isPaid ? (obj.packagingCost !== undefined && obj.packagingCost !== 0 ? obj.packagingCost : f.packagingCost) : 0,
      razorpayFee: isPaid ? (obj.razorpayFee !== undefined && obj.razorpayFee !== 0 ? obj.razorpayFee : f.razorpayFee) : 0,
      courierCharge: obj.courierCharge ?? f.courierCharge,
      totalExpense: isPaid ? (obj.totalExpense !== undefined && obj.totalExpense !== 0 ? obj.totalExpense : f.totalExpense) : null,
      netProfit: isPaid ? (obj.netProfit !== undefined && obj.netProfit !== 0 ? obj.netProfit : f.netProfit) : null,
      isCostAvailable: f.isCostAvailable,
    };

    res.json({ order: enriched });
  } catch (e) {
    next(e);
  }
});

// Manual payment verification endpoint disabled (automated by server and webhooks)
r.patch("/orders/:id/payment", async (_req, _res, next) => {
  next(
    new HttpError(
      400,
      "Manual payment status modifications are disabled. Payment status is automatically managed by Razorpay webhooks."
    )
  );
});

// Manual UPI refund recording for cancelled Razorpay-paid orders
r.post("/orders/:id/refund", async (req, res, next) => {
  try {
    const refundSchema = z.object({
      upiReference: z.string({ required_error: "UPI Reference is required" }).min(1, "UPI Reference is required"),
      notes: z.string().optional(),
    });
    const parsed = refundSchema.parse(req.body);

    const cleanUpiRef = parsed.upiReference.trim();
    if (cleanUpiRef.length < 6) {
      throw new HttpError(400, "Please provide a valid UPI Reference / Transaction ID (minimum 6 characters).");
    }
    const cleanNotes = (parsed.notes || "").trim().slice(0, 500);

    const orderId = req.params.id;
    let order = mongoose.Types.ObjectId.isValid(orderId) ? await Order.findById(orderId) : null;
    if (!order && !isNaN(Number(orderId))) {
      order = await Order.findOne({ orderNo: Number(orderId) });
    }
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    if (order.status !== "Cancelled") {
      throw new HttpError(
        400,
        order.status === "Delivered"
          ? "Delivered orders must be processed via Returns & Refunds portal."
          : `Order cannot be refunded from status "${order.status}". Only Cancelled orders are eligible.`
      );
    }

    if (order.payment?.method !== "razorpay") {
      throw new HttpError(400, "Manual refund is only applicable to online Razorpay prepaid orders.");
    }

    if (order.payment?.status === "refunded" || (order.refundedAmount && order.refundedAmount >= order.total)) {
      throw new HttpError(409, "This order has already been refunded.");
    }

    if (order.payment?.status !== "paid") {
      throw new HttpError(400, `Order payment status is "${order.payment?.status}". Only "paid" orders can be refunded.`);
    }

    // Authoritative server-side refundable amount calculation
    const totalPaid = Number(order.total) || 0;
    const codFee = Number(order.codFee) || 0;
    const previouslyRefunded = Number(order.refundedAmount) || 0;
    const refundableAmount = Math.max(0, Math.round((totalPaid - codFee - previouslyRefunded) * 100) / 100);

    if (refundableAmount <= 0) {
      throw new HttpError(400, "This order has no refundable balance.");
    }

    const adminIdentity = (req.user as any)?.email || (req.user as any)?.name || (req.user as any)?.sub || "admin";
    const now = new Date();

    // Atomic conditional update guaranteeing double-refund prevention
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: "Cancelled",
        "payment.method": "razorpay",
        "payment.status": "paid",
        $or: [
          { refundedAmount: { $lt: refundableAmount } },
          { refundedAmount: { $exists: false } },
        ],
      },
      {
        $set: {
          "payment.status": "refunded",
          refundedAmount: refundableAmount,
          refund: {
            amount: refundableAmount,
            method: "upi",
            upiReference: cleanUpiRef,
            refundedAt: now,
            refundedBy: adminIdentity,
            notes: cleanNotes,
          },
        },
        $push: {
          statusHistory: {
            status: "Cancelled",
            changedAt: now,
            changedBy: adminIdentity,
            note: `Manual UPI refund recorded. Amount: ₹${refundableAmount}. UPI Ref: ${cleanUpiRef}`,
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      throw new HttpError(409, "Order has already been refunded or is being processed concurrently.");
    }

    // Asynchronous non-blocking idempotent customer email notification
    const recipientEmail = updatedOrder.customerEmail || (updatedOrder.user as any)?.email;
    const recipientName = updatedOrder.address?.name || (updatedOrder.user as any)?.name || "Devotee";
    const orderNum = updatedOrder.orderNo ? String(updatedOrder.orderNo) : String(updatedOrder._id);

    if (recipientEmail) {
      dispatchOrderRefundedEmailOnce(
        updatedOrder._id,
        recipientEmail,
        recipientName,
        orderNum,
        refundableAmount,
        cleanUpiRef
      ).catch((err) => {
        console.error(`[admin.refund] Failed to dispatch refund email:`, err);
      });
    }

    res.json({
      ok: true,
      message: "Manual UPI refund recorded successfully.",
      order: updatedOrder,
    });
  } catch (e) {
    next(e);
  }
});

r.get("/users", async (_req, res, next) => {
  try {
    const users = await User.find().select("-passwordHash").sort({ createdAt: -1 }).lean();
    const ids = users.map((u) => u._id);
    const emails = users.map((u) => u.email.toLowerCase().trim());

    // Fetch orders matching either user ID or customerEmail
    const orders = await Order.find({
      $or: [{ user: { $in: ids } }, { customerEmail: { $in: emails } }],
    }).select("user customerEmail total status payment createdAt").lean();

    const { tiers } = await getLoyaltySettings();

    // Group orders by userId and customerEmail
    const ordersByUserId = new Map<string, any[]>();
    const ordersByEmail = new Map<string, any[]>();
    for (const o of orders) {
      if (o.user) {
        const uid = String(o.user);
        const list = ordersByUserId.get(uid) || [];
        list.push(o);
        ordersByUserId.set(uid, list);
      }
      if (o.customerEmail) {
        const em = o.customerEmail.toLowerCase().trim();
        const list = ordersByEmail.get(em) || [];
        list.push(o);
        ordersByEmail.set(em, list);
      }
    }

    res.json({
      users: users.map((u) => {
        const uid = String(u._id);
        const uEmail = u.email.toLowerCase().trim();

        // Merge deduplicated orders
        const userOrders = ordersByUserId.get(uid) || [];
        const emailOrders = ordersByEmail.get(uEmail) || [];
        const seenIds = new Set<string>();
        const combinedOrders: any[] = [];
        for (const o of [...userOrders, ...emailOrders]) {
          const oid = String(o._id);
          if (!seenIds.has(oid)) {
            seenIds.add(oid);
            combinedOrders.push(o);
          }
        }

        const qualified = combinedOrders.filter(isOrderPaidForFinance);
        const qualifiedSpend = Math.round(qualified.reduce((sum, o) => sum + (Number(o.total) || 0), 0) * 100) / 100;
        const qualifiedCount = qualified.length;
        const tier = calculateCustomerTier(qualifiedSpend, qualifiedCount, tiers);

        return {
          ...u,
          ordersCount: qualifiedCount,
          totalOrdersCount: combinedOrders.length,
          totalSpent: qualifiedSpend,
          tier: tier.name,
          tierBadgeColor: tier.badgeColor,
          loyaltyPointsBalance: Math.max(0, (u as any).loyaltyPointsBalance ?? 0),
          walletBalance: Math.max(0, (u as any).walletBalance ?? 0),
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

r.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { isBlocked } = z.object({ isBlocked: z.boolean() }).parse(req.body);
    const u = await User.findByIdAndUpdate(req.params.id, { isBlocked }, { new: true }).select("-passwordHash");
    if (!u) throw new HttpError(404, "User not found");
    res.json({ user: u });
  } catch (e) {
    next(e);
  }
});

// ---- live order fetch + derived courier events (polled by admin) ----
r.get("/orders/:id", async (req, res, next) => {
  try {
    let o = await Order.findById(req.params.id).populate("user", "name email");
    if (!o) throw new HttpError(404, "Not found");

    let trackingData = null;
    if (o.courier && o.trackingId) {
      const synced = await syncOrderTracking(o);
      if (synced.order) o = synced.order;
      trackingData = synced.tracking;
    }

    res.json({ order: o, tracking: trackingData, events: deriveEvents(o) });
  } catch (e) {
    next(e);
  }
});

// Admin manual tracking refresh (cooldown & budget protected)
r.post("/orders/:id/refresh-tracking", async (req, res, next) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");
    const result = await requestManualTrackingRefresh(o);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Admin quota & tracking config diagnostics
r.get("/tracking/quota", async (_req, res) => {
  res.json({ quota: getQuotaInfo() });
});

// Admin trigger sync of all active shipments (distributed lock + cache TTL + quota protected)
r.post("/tracking/sync", async (_req, res, next) => {
  try {
    const result = await syncAllActiveShipments();
    const alreadyFresh = Math.max(0, result.totalActive - result.refreshed);
    res.json({
      success: true,
      ...result,
      alreadyFresh,
    });
  } catch (e) {
    next(e);
  }
});

// Download / Stream Invoice PDF for Admin
r.get("/orders/:id/invoice", async (req, res, next) => {
  try {
    let o = null;
    if (mongoose.isValidObjectId(req.params.id)) {
      o = await Order.findById(req.params.id).populate("user", "name email");
    }
    if (!o && !isNaN(Number(req.params.id))) {
      o = await Order.findOne({ orderNo: Number(req.params.id) }).populate("user", "name email");
    }
    if (!o) throw new HttpError(404, "Order not found");

    const u: any = o.user;
    const customerName = o.address?.name || u?.name || "Customer";
    const customerEmail = o.customerEmail || u?.email || "";
    const orderNum = formatOrderNumber(o);

    const invoiceData: InvoiceData = {
      orderId: String(o._id),
      orderNo: o.orderNo ?? orderNum,
      invoiceNo: `INV-${orderNum}`,
      trackingId: o.trackingId ?? undefined,
      courier: o.courier ?? null,
      status: o.status,
      customerName,
      customerEmail,
      businessName: o.businessName,
      gstin: o.gstin,
      needsGstInvoice: o.needsGstInvoice,
      items: o.items as any,
      subtotal: o.subtotal,
      shipping: o.shipping,
      codFee: o.codFee,
      total: o.total,
      address: (o.billingAddress?.line1 ? o.billingAddress : o.address) as any,
      payment: {
        method: o.payment?.method ?? "cod",
        status: o.payment?.status ?? "pending",
        razorpayPaymentId: o.payment?.razorpayPaymentId ?? undefined,
      },
      createdAt: o.createdAt,
    };

    const pdfBuffer = await generateInvoicePDF(invoiceData);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Invoice-${orderNum}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    next(e);
  }
});

export function normalizeIndianPhone(raw: unknown): { valid: boolean; digits: string; reason?: string } {
  if (!raw || typeof raw !== "string") {
    return { valid: false, digits: "", reason: "Phone number is missing" };
  }
  const rawDigits = raw.replace(/\D/g, "");
  if (rawDigits.length === 10 && /^[6-9]/.test(rawDigits)) {
    return { valid: true, digits: `91${rawDigits}` };
  }
  if (rawDigits.length === 11 && rawDigits.startsWith("0") && /^[6-9]/.test(rawDigits.slice(1))) {
    return { valid: true, digits: `91${rawDigits.slice(1)}` };
  }
  if (rawDigits.length === 12 && rawDigits.startsWith("91") && /^[6-9]/.test(rawDigits.slice(2))) {
    return { valid: true, digits: rawDigits };
  }
  return { valid: false, digits: "", reason: "Customer phone is not a valid 10-digit mobile number" };
}

export function buildInvoiceWhatsAppUrl(
  order: any,
  oneTimeDownloadUrl: string
): { url?: string; disabledReason?: string } {
  const phone = order.address?.phone || order.phone;
  const phoneCheck = normalizeIndianPhone(phone);
  if (!phoneCheck.valid) {
    return { disabledReason: phoneCheck.reason };
  }

  const firstName = (order.address?.name || "Customer").trim().split(/\s+/)[0] || "Customer";
  const orderNum = formatOrderNumber(order);
  const invoiceNo = `INV-${orderNum}`;

  const msg =
    `🙏 Hare Krishna ${firstName},\n\n` +
    `As requested, here is the official tax invoice for your order #${orderNum} (Invoice: ${invoiceNo}).\n\n` +
    `Secure One-Time Download Link:\n${oneTimeDownloadUrl}\n\n` +
    `Please note that this download link is single-use and valid for 48 hours.\n\n` +
    `Thank you for shopping with Shri Radha Govind Store.\n\n` +
    `Hare Krishna 🙏`;

  return {
    url: `https://api.whatsapp.com/send?phone=${phoneCheck.digits}&text=${encodeURIComponent(msg)}`,
  };
}

const sendInvoiceSchema = z.object({
  adminNote: z.string().trim().max(500).optional(),
});

// Admin sends invoice (manual fulfillment with 48h single-use token, email PDF, and WhatsApp link)
r.post("/orders/:id/send-invoice", async (req, res, next) => {
  try {
    let o = null;
    if (mongoose.isValidObjectId(req.params.id)) {
      o = await Order.findById(req.params.id).populate("user", "name email");
    }
    if (!o && !isNaN(Number(req.params.id))) {
      o = await Order.findOne({ orderNo: Number(req.params.id) }).populate("user", "name email");
    }
    if (!o) throw new HttpError(404, "Order not found");

    if (o.status !== "Delivered") {
      throw new HttpError(400, `Cannot send invoice for order with status "${o.status}". Only Delivered orders can be fulfilled.`);
    }

    const u: any = o.user;
    const customerEmail = (o.customerEmail || u?.email || "").trim();
    if (!customerEmail) {
      throw new HttpError(400, "Cannot send invoice: order has no associated customer email address.");
    }
    const customerName = o.address?.name || u?.name || "Customer";
    const orderNum = formatOrderNumber(o);
    const invoiceNo = `INV-${orderNum}`;

    const body = sendInvoiceSchema.parse(req.body || {});

    // Generate secure 192-bit token and 48-hour expiration
    const token = crypto.randomBytes(24).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const PRODUCTION_DOMAIN = "https://www.shriradhagovindstore.com";
    const guestParam = o.guestAccessToken ? `&token=${encodeURIComponent(o.guestAccessToken)}` : "";
    const oneTimeDownloadUrl = `${PRODUCTION_DOMAIN}/orders/${orderNum}?invoiceToken=${token}${guestParam}`;

    // Generate invoice PDF
    const invoiceData: InvoiceData = {
      orderId: String(o._id),
      orderNo: o.orderNo ?? orderNum,
      invoiceNo,
      trackingId: o.trackingId ?? undefined,
      courier: o.courier ?? null,
      status: o.status,
      customerName,
      customerEmail,
      businessName: o.businessName,
      gstin: o.gstin,
      needsGstInvoice: o.needsGstInvoice,
      items: o.items as any,
      subtotal: o.subtotal,
      shipping: o.shipping,
      codFee: o.codFee,
      total: o.total,
      address: (o.billingAddress?.line1 ? o.billingAddress : o.address) as any,
      payment: {
        method: o.payment?.method ?? "cod",
        status: o.payment?.status ?? "pending",
        razorpayPaymentId: o.payment?.razorpayPaymentId ?? undefined,
      },
      createdAt: o.createdAt,
    };

    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Dispatch email with invoice PDF attachment & secure one-time link
    const emailResult = await dispatchRequestedInvoiceEmail({
      to: customerEmail,
      name: customerName,
      orderNum,
      invoiceNo,
      oneTimeDownloadUrl,
      expiresAt,
      pdfBuffer,
    });
    if (!emailResult.success) {
      throw new HttpError(500, `Failed to dispatch invoice email: ${emailResult.error || "Unknown error"}`);
    }

    // Atomically persist token and mark request as fulfilled
    const adminIdentifier = req.user?.email || req.user?.sub || "admin";
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: o._id,
        status: "Delivered",
      },
      {
        $set: {
          invoiceOneTimeToken: token,
          invoiceOneTimeTokenExpiresAt: expiresAt,
          invoiceOneTimeTokenUsedAt: null,
          invoiceSentToCustomerAt: now,
          "invoiceRequest.status": "fulfilled",
          "invoiceRequest.processedAt": now,
          "invoiceRequest.processedBy": adminIdentifier,
          "invoiceRequest.adminNote": body.adminNote !== undefined ? body.adminNote : (o.invoiceRequest?.adminNote || ""),
        },
      },
      { new: true }
    );

    const whatsApp = buildInvoiceWhatsAppUrl(o, oneTimeDownloadUrl);

    res.json({
      ok: true,
      message: `Invoice successfully sent to ${customerEmail}.`,
      order: updatedOrder,
      oneTimeDownloadUrl,
      expiresAt,
      whatsAppUrl: whatsApp.url || null,
      whatsAppDisabledReason: whatsApp.disabledReason || null,
    });
  } catch (e) {
    next(e);
  }
});

function buildEmailOrder(o: any) {
  return {
    _id: o._id,
    orderNo: o.orderNo ?? undefined,
    trackingId: o.trackingId ?? undefined,
    courier: o.courier ?? undefined,
    courierTrackingUrl: o.courierTrackingUrl ?? undefined,
    status: o.status ?? "Placed",
    businessName: o.businessName ?? undefined,
    gstin: o.gstin ?? undefined,
    needsGstInvoice: o.needsGstInvoice,
    items: o.items as any,
    subtotal: o.subtotal ?? 0,
    shipping: o.shipping ?? 0,
    total: o.total ?? 0,
    address: o.address as any,
    payment: {
      method: o.payment?.method ?? "cod",
      status: o.payment?.status ?? "pending",
      razorpayPaymentId: o.payment?.razorpayPaymentId ?? undefined,
    },
    createdAt: o.createdAt,
  };
}

function deriveEvents(o: any) {
  if (Array.isArray(o.statusHistory) && o.statusHistory.length > 0) {
    return o.statusHistory.map((h: any) => {
      const at = h.changedAt instanceof Date ? h.changedAt : new Date(h.changedAt || o.createdAt);
      let description = h.note || `Order status updated to ${h.status}.`;
      if (h.status === "Hold" && (h.holdReason || o.holdReason)) {
        description = `Order placed on Hold: ${h.holdReason || o.holdReason}`;
      }
      return {
        at: at.toISOString(),
        label: h.status,
        description,
        changedBy: h.changedBy,
        holdReason: h.holdReason,
      };
    });
  }

  const placedAt = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
  const updatedAt = o.updatedAt instanceof Date ? o.updatedAt : new Date(o.updatedAt ?? placedAt);
  const courier = o.courier ?? "Courier partner";
  const city = o.address?.city ?? "destination";
  const order = [
    "Placed",
    "Confirmed",
    "Processing",
    "Packed",
    "Shipped",
    "Out for delivery",
    "Delivered",
  ];
  const idx =
    o.status === "Cancelled" || o.status === "Hold" ? -1 : Math.max(0, order.indexOf(o.status));
  const evts: { at: Date; label: string; description: string }[] = [];

  if (o.status === "Cancelled") {
    evts.push({
      at: updatedAt,
      label: "Cancelled",
      description: "Order was cancelled. Customer was notified by email.",
    });
  } else if (o.status === "Hold") {
    evts.push({
      at: placedAt,
      label: "Placed",
      description: `Order placed successfully (#${formatOrderNumber(o)}).`,
    });
    evts.push({
      at: updatedAt,
      label: "Hold",
      description: o.holdReason
        ? `Order on temporary hold: ${o.holdReason}`
        : "Order placed on temporary hold.",
    });
  } else {
    if (idx >= 0)
      evts.push({
        at: placedAt,
        label: "Placed",
        description: `Order placed successfully (#${formatOrderNumber(o)}).`,
      });
    if (idx >= 1)
      evts.push({
        at: updatedAt,
        label: "Confirmed",
        description: "Order confirmed. Customer notified.",
      });
    if (idx >= 2)
      evts.push({
        at: updatedAt,
        label: "Processing",
        description: "Order is being processed and prepared for packing.",
      });
    if (idx >= 3)
      evts.push({
        at: updatedAt,
        label: "Packed",
        description: `Items packed at warehouse. Handed over to ${courier}.`,
      });
    if (idx >= 4)
      evts.push({
        at: updatedAt,
        label: "Shipped",
        description: `Shipped via ${courier}. In transit to ${city}.`,
      });
    if (idx >= 5)
      evts.push({
        at: updatedAt,
        label: "Out for delivery",
        description: `${courier} agent is out for delivery in ${city}.`,
      });
    if (idx >= 6)
      evts.push({
        at: updatedAt,
        label: "Delivered",
        description: `Delivered by ${courier} to ${city}.`,
      });
  }
  return evts.map((e) => ({
    at: e.at.toISOString(),
    label: e.label,
    description: e.description,
  }));
}

r.get("/payments", async (_req, res, next) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .select("orderNo total payment createdAt user trackingId address")
      .populate("user", "name email");
    res.json({
      payments: orders.map((o) => ({
        id: o._id,
        orderNo: o.orderNo,
        trackingId: o.trackingId,
        user: o.user,
        customerName: o.address?.name || (o.user as any)?.name || "Customer",
        amount: o.total,
        method: o.payment?.method,
        status: o.payment?.status,
        razorpayOrderId: o.payment?.razorpayOrderId,
        razorpayPaymentId: o.payment?.razorpayPaymentId,
        failureReason: o.payment?.failureReason,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

r.get("/stats", async (_req, res, next) => {
  try {
    const [orderCount, userCount, revenueAgg] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments({ role: "user" }),
      Order.aggregate([
        { $match: { "payment.status": "paid", status: { $ne: "Cancelled" } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
    ]);
    res.json({ orderCount, userCount, revenue: revenueAgg[0]?.total ?? 0 });
  } catch (e) {
    next(e);
  }
});

export default r;
