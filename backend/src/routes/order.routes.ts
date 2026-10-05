import { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { Settings } from "../models/Settings";
import { User } from "../models/User";
import { Counter } from "../models/Counter";
import { CheckoutSession } from "../models/CheckoutSession";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { signToken } from "../utils/jwt";
import {
  sendEmail,
  sendOrderConfirmationWithInvoice,
  dispatchOrderInvoiceEmailOnce,
  tpl,
  formatOrderNumber,
} from "../utils/email";
import { generateInvoicePDF, type InvoiceData } from "../utils/invoice";
import { getCourierTrackingUrl } from "../utils/courier";
import {
  syncOrderTracking,
  requestManualTrackingRefresh,
} from "../services/courierTracking.service";
import {
  cancelOrderAtomically,
  CANCELLABLE_STATUSES_CUSTOMER,
} from "../services/cancellation.service";
import { computeOrderFinances, normalizeIndianPhone } from "./admin.routes";
import { env } from "../config/env";
import { decrementOrderStockSafely } from "../services/inventory.service";
import { recordDailyOrder } from "../models/DailyAnalytics";
import {
  validateAndCalculateCoupon,
  reserveCouponUsage,
  rollbackCouponUsage,
} from "../services/coupon.service";
import {
  earnPointsForOrder,
  redeemPointsForOrder,
  validateAndCalculatePointsRedemption,
} from "../services/loyalty.service";

const r = Router();
const FIRST_ORDER_NO = 5000;

const safeUser = (u: any) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar,
  phone: u.phone,
  address: u.address ?? {},
});

async function nextOrderNo() {
  const counter = await Counter.findOneAndUpdate(
    { name: "orderNo4Digit" },
    { $inc: { value: 1 } },
    { new: true },
  );
  if (counter) return counter.value;
  try {
    const latestFourDigitOrder = await Order.findOne({
      orderNo: { $gte: FIRST_ORDER_NO, $lte: 9999 },
    })
      .sort({ orderNo: -1 })
      .select("orderNo")
      .lean();
    const firstValue = Math.max(
      FIRST_ORDER_NO,
      (latestFourDigitOrder?.orderNo ?? FIRST_ORDER_NO - 1) + 1,
    );
    const created = await Counter.create({
      name: "orderNo4Digit",
      value: firstValue,
    });
    return created.value;
  } catch (error: any) {
    if (error?.code === 11000) return nextOrderNo();
    throw error;
  }
}

function maskName(name?: string | null): string {
  if (!name) return "Customer";
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => {
      if (p.length <= 2) return p[0] + "*";
      return p[0] + "*".repeat(Math.max(1, p.length - 2)) + p[p.length - 1];
    })
    .join(" ");
}

function maskPincode(pin?: string | null): string {
  if (!pin) return "";
  const clean = pin.trim();
  if (clean.length === 6) {
    return clean.slice(0, 3) + "***";
  }
  return clean.slice(0, 2) + "*".repeat(Math.max(1, clean.length - 2));
}

// ---- public tracking (privacy protected DTO, no sensitive data exposed) ----
r.get("/track/:trackingId", async (req, res, next) => {
  try {
    const rawTerm = (req.params.trackingId || "").trim();
    const term = rawTerm.toUpperCase().replace(/^#/, "");
    const asNumber = Number(term);
    const query: any = {
      $or: [
        { trackingId: term },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ orderNo: asNumber }] : []),
      ],
    };
    const foundOrder = await Order.findOne(query);
    if (!foundOrder) throw new HttpError(404, "No order found for this tracking ID or Order Number");
    let o = foundOrder;

    let trackingData = null;
    if (o.courier && o.trackingId) {
      const synced = await syncOrderTracking(o);
      if (synced.order) o = synced.order;
      trackingData = synced.tracking;
    }

    const trackingUrl = o.courierTrackingUrl || getCourierTrackingUrl(o.courier, o.trackingId);
    res.json({
      order: {
        orderNo: o.orderNo,
        trackingId: o.trackingId,
        status: o.status,
        holdReason: o.status === "Hold" ? o.holdReason : undefined,
        statusHistory: (o.statusHistory || []).map((h: any) => ({
          status: h.status,
          changedAt: h.changedAt,
          holdReason: h.status === "Hold" ? h.holdReason : undefined,
        })),
        courier: o.courier,
        courierTrackingUrl: trackingUrl,
        courierTrackingData: trackingData,
        createdAt: o.createdAt,
        items: o.items.map((i: any) => ({
          productId: i.productId ? String(i.productId) : undefined,
          name: i.name,
          image: i.image,
          qty: i.qty,
          price: i.price,
        })),
        total: o.total,
        address: {
          city: o.address?.city || "",
          state: o.address?.state || "",
          pincode: maskPincode(o.address?.pincode),
          name: maskName(o.address?.name),
        },
        payment: { method: o.payment?.method, status: o.payment?.status },
      },
      tracking: trackingData,
    });
  } catch (e) {
    next(e);
  }
});

// Explicit manual refresh for public tracking (cooldown & budget protected)
r.post("/track/:trackingId/refresh", async (req, res, next) => {
  try {
    const rawTerm = (req.params.trackingId || "").trim();
    const term = rawTerm.toUpperCase().replace(/^#/, "");
    const asNumber = Number(term);
    const query: any = {
      $or: [
        { trackingId: term },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ orderNo: asNumber }] : []),
      ],
    };
    const foundOrder = await Order.findOne(query);
    if (!foundOrder) throw new HttpError(404, "No order found for this tracking ID or Order Number");

    const result = await requestManualTrackingRefresh(foundOrder);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export const INVOICE_DIRECT_DOWNLOAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // exactly 7 x 24 hours

export function getOrderDeliveryTimestamp(order: any): Date | null {
  if (order?.deliveredAt) return new Date(order.deliveredAt);
  if (Array.isArray(order?.statusHistory)) {
    const deliveredEntry = order.statusHistory.find((h: any) => h.status === "Delivered");
    if (deliveredEntry?.changedAt) return new Date(deliveredEntry.changedAt);
  }
  if (order?.deliveredSentAt) return new Date(order.deliveredSentAt);
  return null;
}

function sanitizeCustomerOrder(orderDoc: any) {
  if (!orderDoc) return orderDoc;
  const obj = orderDoc.toObject ? orderDoc.toObject() : { ...orderDoc };
  delete obj.courierCharge;
  delete obj.packagingCost;
  delete obj.razorpayFee;
  delete obj.productCost;
  delete obj.totalExpense;
  delete obj.netProfit;
  delete obj.invoiceOneTimeToken;
  delete obj.invoiceOneTimeTokenExpiresAt;
  delete obj.invoiceOneTimeTokenUsedAt;
  delete obj.refundLockUntil;
  if (obj.refund) {
    const safeRefund = { ...obj.refund };
    delete safeRefund.notes;
    delete safeRefund.refundedBy;
    obj.refund = safeRefund;
  }
  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item: any) => {
      const copy = { ...item };
      delete copy.costPrice;
      return copy;
    });
  }
  return obj;
}

r.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const userEmail = (req.user!.email || "").toLowerCase().trim();
    const query: any = {
      $or: [
        { user: userId },
        ...(userEmail ? [{ customerEmail: userEmail }] : []),
      ],
    };
    const orders = await Order.find(query).sort({
      createdAt: -1,
    });
    res.json({ orders: orders.map(sanitizeCustomerOrder) });
  } catch (e) {
    next(e);
  }
});

export async function findOrderByIdOrNo(idOrNo: string | string[] | undefined) {
  const cleanId = Array.isArray(idOrNo) ? idOrNo[0] : idOrNo;
  if (!cleanId) return null;
  let o = null;
  if (mongoose.isValidObjectId(cleanId)) {
    o = await Order.findById(cleanId);
  }
  if (!o && !isNaN(Number(cleanId))) {
    o = await Order.findOne({ orderNo: Number(cleanId) });
  }
  return o;
}

export function checkOrderAccess(
  o: any,
  user?: Express.Request["user"],
  queryToken?: unknown
): { isOwner: boolean; isAdmin: boolean; isTokenAuthorized: boolean; allowed: boolean } {
  const userId = user?.sub;
  const userEmail = user?.email ? user.email.toLowerCase().trim() : "";
  const orderEmail = o.customerEmail ? o.customerEmail.toLowerCase().trim() : "";
  const orderUserId = (o.user as any)?._id ? String((o.user as any)._id) : o.user ? String(o.user) : null;
  const isOwner = Boolean(
    (userId && orderUserId && orderUserId === userId) ||
    (userEmail && orderEmail && userEmail === orderEmail)
  );
  const isAdmin = user?.role === "admin";
  const token = typeof queryToken === "string" ? queryToken.trim() : "";
  const isTokenAuthorized = Boolean(token && o.guestAccessToken && token === o.guestAccessToken);

  return {
    isOwner,
    isAdmin,
    isTokenAuthorized,
    allowed: isOwner || isAdmin || isTokenAuthorized,
  };
}

r.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    let o = await findOrderByIdOrNo(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");
    const access = checkOrderAccess(o, req.user, req.query.token);
    if (!access.allowed) {
      throw new HttpError(403, "Access forbidden. Please sign in or use your secure order link.");
    }

    let trackingData = null;
    if (o.courier && o.trackingId) {
      const synced = await syncOrderTracking(o);
      if (synced.order) o = synced.order;
      trackingData = synced.tracking;
    }

    const payload = access.isAdmin ? o : sanitizeCustomerOrder(o);
    res.json({ order: payload, tracking: trackingData });
  } catch (e) {
    next(e);
  }
});

// Explicit manual refresh for customer order detail (cooldown & budget protected)
r.post("/:id/refresh", optionalAuth, async (req, res, next) => {
  try {
    const o = await findOrderByIdOrNo(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");
    const access = checkOrderAccess(o, req.user, req.query.token);
    if (!access.allowed) {
      throw new HttpError(403, "Access forbidden. Please sign in or use your secure order link.");
    }

    const result = await requestManualTrackingRefresh(o);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, "Please select or provide a cancellation reason").max(100),
  customReason: z.string().trim().max(300).optional(),
  token: z.string().optional(),
});

// Customer order cancellation endpoint
r.post("/:id/cancel", optionalAuth, async (req, res, next) => {
  try {
    const o = await findOrderByIdOrNo(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");

    const effectiveToken = req.query.token || req.body?.token;
    const access = checkOrderAccess(o, req.user, effectiveToken);
    if (!access.allowed) {
      throw new HttpError(403, "Access forbidden. You do not have permission to cancel this order.");
    }

    const data = cancelOrderSchema.parse(req.body);

    let finalReason = data.reason;
    if (data.reason.toLowerCase() === "other") {
      const cleanCustom = (data.customReason || "").trim();
      finalReason = cleanCustom ? `Other: ${cleanCustom}` : "Other reason";
    } else if (data.customReason && data.customReason.trim()) {
      finalReason = `${data.reason}: ${data.customReason.trim()}`;
    }

    const result = await cancelOrderAtomically({
      orderId: o._id,
      cancellableStatuses: CANCELLABLE_STATUSES_CUSTOMER,
      cancelledBy: access.isAdmin ? "admin" : "customer",
      cancellationReason: finalReason,
      note: finalReason,
      sendNotificationEmail: true,
    });

    if (!result.success) {
      if (result.alreadyCancelled) {
        throw new HttpError(400, "This order has already been cancelled.");
      }
      if (result.statusNotCancellable) {
        if (result.currentStatus === "Processing") {
          throw new HttpError(400, "Order cannot be cancelled because it is already being processed. Please contact customer support.");
        }
        if (result.currentStatus === "Hold") {
          throw new HttpError(400, "Order cannot be cancelled while on hold. Please contact customer support.");
        }
        if (result.currentStatus === "Packed") {
          throw new HttpError(400, "Order cannot be cancelled because it has already been packed for dispatch.");
        }
        if (result.currentStatus === "Shipped" || result.currentStatus === "Out for delivery") {
          throw new HttpError(400, "Order cannot be cancelled because it has already been dispatched with courier.");
        }
        if (result.currentStatus === "Delivered") {
          throw new HttpError(400, "Delivered orders cannot be cancelled. Please contact customer support for returns.");
        }
        throw new HttpError(400, result.error || `Order cannot be cancelled from status "${result.currentStatus}".`);
      }
      throw new HttpError(400, result.error || "Failed to cancel order.");
    }

    const payload = access.isAdmin ? result.order : sanitizeCustomerOrder(result.order);
    res.json({
      ok: true,
      message: "Order successfully cancelled.",
      order: payload,
    });
  } catch (e) {
    next(e);
  }
});

export function evaluateInvoiceDownloadEligibility(
  o: any,
  user?: Express.Request["user"],
  queryToken?: unknown,
  currentTimeMs: number = Date.now(),
  invoiceToken?: string
): {
  allowed: boolean;
  httpStatus?: number;
  reason?: string;
  isDeliveredExpired?: boolean;
  requiresOneTimeToken?: boolean;
} {
  const access = checkOrderAccess(o, user, queryToken);
  if (!access.allowed) {
    return {
      allowed: false,
      httpStatus: 403,
      reason: "Access forbidden. Please sign in or use your secure order link.",
    };
  }

  // Admin access remains unrestricted
  if (access.isAdmin) {
    return { allowed: true };
  }

  // Customer / guest access checks
  if (o.status === "Placed") {
    return {
      allowed: false,
      httpStatus: 400,
      reason: "Invoice is not available for orders in 'Placed' status. It will be available once your order is confirmed.",
    };
  }

  const eligibleStatuses = [
    "Confirmed",
    "Processing",
    "Hold",
    "Packed",
    "Shipped",
    "Out for delivery",
    "Delivered",
  ];
  if (!eligibleStatuses.includes(o.status)) {
    return {
      allowed: false,
      httpStatus: 400,
      reason: `Invoice is not available for orders with status "${o.status}".`,
    };
  }

  if (o.status === "Delivered") {
    const deliveredTime = getOrderDeliveryTimestamp(o);
    if (deliveredTime) {
      const elapsed = currentTimeMs - deliveredTime.getTime();
      if (elapsed > INVOICE_DIRECT_DOWNLOAD_WINDOW_MS) {
        if (!invoiceToken) {
          return {
            allowed: false,
            httpStatus: 410,
            reason: "The 7-day direct invoice download window for this delivered order has expired.",
            isDeliveredExpired: true,
          };
        }

        if (!o.invoiceOneTimeToken || o.invoiceOneTimeToken !== invoiceToken) {
          return {
            allowed: false,
            httpStatus: 403,
            reason: "Invalid invoice download token.",
          };
        }
        if (o.invoiceOneTimeTokenUsedAt) {
          return {
            allowed: false,
            httpStatus: 410,
            reason: "This one-time invoice download link has already been used. Please request a new invoice if needed.",
          };
        }
        if (o.invoiceOneTimeTokenExpiresAt && currentTimeMs > new Date(o.invoiceOneTimeTokenExpiresAt).getTime()) {
          return {
            allowed: false,
            httpStatus: 410,
            reason: "This invoice download link has expired (valid for 48 hours). Please request a new invoice.",
          };
        }
        return { allowed: true, requiresOneTimeToken: true };
      }
    }
  }

  return { allowed: true };
}

r.get("/:id/invoice", optionalAuth, async (req, res, next) => {
  try {
    const o = await findOrderByIdOrNo(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");

    const invoiceToken = typeof req.query.invoiceToken === "string" ? req.query.invoiceToken.trim() : undefined;
    const eligibility = evaluateInvoiceDownloadEligibility(o, req.user, req.query.token, Date.now(), invoiceToken);
    if (!eligibility.allowed) {
      throw new HttpError(eligibility.httpStatus || 400, eligibility.reason || "Invoice download denied.");
    }

    if (eligibility.requiresOneTimeToken && invoiceToken) {
      const consumed = await Order.findOneAndUpdate(
        {
          _id: o._id,
          invoiceOneTimeToken: invoiceToken,
          invoiceOneTimeTokenUsedAt: null,
          invoiceOneTimeTokenExpiresAt: { $gt: new Date() },
        },
        {
          $set: { invoiceOneTimeTokenUsedAt: new Date() },
        },
        { new: true }
      );
      if (!consumed) {
        throw new HttpError(410, "This invoice download link has expired or has already been used.");
      }
    }

    const orderNum = formatOrderNumber(o);
    const invoiceData: InvoiceData = {
      orderId: String(o._id),
      orderNo: o.orderNo ?? orderNum,
      invoiceNo: `INV-${orderNum}`,
      trackingId: o.trackingId ?? undefined,
      courier: o.courier ?? null,
      status: o.status,
      customerName: o.address?.name || "Customer",
      customerEmail: o.customerEmail ?? undefined,
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

// Customer / Guest request invoice endpoint (Delivered orders after 7-day cutoff)
r.post("/:id/request-invoice", optionalAuth, async (req, res, next) => {
  try {
    const o = await findOrderByIdOrNo(req.params.id);
    if (!o) throw new HttpError(404, "Order not found");

    const effectiveToken = req.query.token || req.body?.token;
    const access = checkOrderAccess(o, req.user, effectiveToken);
    if (!access.allowed) {
      throw new HttpError(403, "Access forbidden. Please sign in or use your secure order link.");
    }

    if (o.status !== "Delivered") {
      throw new HttpError(400, `Invoice requests are only available for delivered orders. Current order status is "${o.status}".`);
    }

    const deliveredTime = getOrderDeliveryTimestamp(o);
    const elapsed = deliveredTime ? Date.now() - deliveredTime.getTime() : 0;
    if (deliveredTime && elapsed <= INVOICE_DIRECT_DOWNLOAD_WINDOW_MS) {
      throw new HttpError(400, "Direct invoice download is still available for this order. You can download your invoice directly.");
    }

    if (o.invoiceRequest?.status === "pending") {
      throw new HttpError(400, "An invoice request for this order is already pending review.");
    }
    if (o.invoiceRequest?.status === "fulfilled") {
      throw new HttpError(400, "An invoice has already been sent for this order.");
    }

    const requester = req.user?.sub ? "customer" : "guest";
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: o._id,
        status: "Delivered",
        $or: [
          { "invoiceRequest.status": { $exists: false } },
          { "invoiceRequest.status": null },
          { "invoiceRequest.status": { $nin: ["pending", "fulfilled"] } },
        ],
      },
      {
        $set: {
          invoiceRequest: {
            requestedAt: new Date(),
            requestedBy: requester,
            status: "pending",
            adminNote: "",
          },
        },
      },
      { new: true }
    );

    if (!updatedOrder) {
      throw new HttpError(400, "An invoice request for this order is already pending or has already been fulfilled.");
    }

    res.json({
      ok: true,
      message: "Invoice request submitted successfully. Our team will review and send your invoice shortly.",
      order: access.isAdmin ? updatedOrder : sanitizeCustomerOrder(updatedOrder),
    });
  } catch (e) {
    next(e);
  }
});

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const createSchema = z.object({
  email: z.string().email().optional(),
  createAccount: z.boolean().optional().default(false),
  needsGstInvoice: z.boolean().optional().default(false),
  businessName: z.string().optional().default(""),
  gstin: z.string().optional().default(""),
  items: z
    .array(
      z.object({ productId: z.string(), qty: z.number().int().min(1).max(20) }),
    )
    .min(1),
  address: z.object({
    name: z.string().min(1),
    phone: z.string().min(5),
    alternatePhone: z.string().optional().default(""),
    line1: z.string().min(1),
    line2: z.string().optional().default(""),
    postOffice: z.string().optional().default(""),
    city: z.string().min(1),
    state: z.string().optional().default(""),
    pincode: z.string().min(1),
  }),
  billingAddress: z
    .object({
      name: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      line1: z.string().optional().default(""),
      line2: z.string().optional().default(""),
      postOffice: z.string().optional().default(""),
      city: z.string().optional().default(""),
      state: z.string().optional().default(""),
      pincode: z.string().optional().default(""),
    })
    .optional(),
  payment: z.object({
    method: z.enum(["razorpay", "cod"]),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    razorpaySignature: z.string().optional(),
    status: z.enum(["pending", "paid", "failed"]).optional(),
  }),
  sessionId: z.string().optional(),
  recoveryToken: z.string().optional(),
  couponCode: z.string().optional(),
  codFee: z.number().optional(),
  redeemPoints: z.number().int().min(0).optional().default(0),
  analytics: z
    .object({
      visitorId: z.string().max(100).optional(),
      sessionId: z.string().max(100).optional(),
      device: z.enum(["mobile", "desktop", "tablet", "unknown"]).optional(),
      referrer: z.string().max(1000).optional(),
      utm: z
        .object({
          source: z.string().max(100).optional(),
          medium: z.string().max(100).optional(),
          campaign: z.string().max(100).optional(),
          term: z.string().max(100).optional(),
          content: z.string().max(100).optional(),
        })
        .optional(),
    })
    .optional(),
});

r.post("/", optionalAuth, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);

    // Validate GST details if requested
    let cleanBusinessName = "";
    let cleanGstin = "";
    if (body.needsGstInvoice) {
      cleanBusinessName = (body.businessName || "").trim();
      if (!cleanBusinessName) {
        throw new HttpError(400, "Business Name is required when requesting a GST invoice");
      }
      const rawGstin = (body.gstin || "").trim().toUpperCase();
      if (rawGstin) {
        if (!GSTIN_REGEX.test(rawGstin)) {
          throw new HttpError(
            400,
            "Invalid GSTIN format. Please enter a valid 15-character GSTIN (e.g. 09AABCU9603R1ZM)",
          );
        }
        cleanGstin = rawGstin;
      }
    }

    // Validate shipping primary phone number
    const shipPhone = (body.address.phone || "").trim();
    const shipPhoneCheck = normalizeIndianPhone(shipPhone);
    if (!shipPhoneCheck.valid) {
      throw new HttpError(400, "A valid 10-digit primary phone number is required for delivery");
    }

    // Validate billing contact number if separate billing address is provided
    if (body.billingAddress && body.billingAddress.line1?.trim()) {
      const billPhone = (body.billingAddress.phone || body.address.phone || "").trim();
      const billPhoneCheck = normalizeIndianPhone(billPhone);
      if (!billPhoneCheck.valid) {
        throw new HttpError(400, "A valid 10-digit billing contact number is required");
      }
    }

    // Resolve user & account linkage
    let user: any = null;
    let orderUserId: any = null;
    let isNewAccount = false;
    let sessionToken: string | undefined;

    if (req.user?.sub) {
      user = await User.findById(req.user.sub);
      if (user) {
        orderUserId = user._id;
      }
    }

    const rawEmail = body.email || user?.email || "";
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new HttpError(400, "Customer email is required for order confirmation and invoicing");
    }

    if (!orderUserId) {
      // Guest checkout: Only create an account if customer explicitly opted in
      if (body.createAccount) {
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (!existingUser) {
          user = await User.create({
            name: body.address.name.trim() || "Customer",
            email: normalizedEmail,
            phone: body.address.phone.trim(),
            passwordHash: "",
            passwordSet: false,
            role: "user",
            address: {
              line1: body.address.line1,
              city: body.address.city,
              state: body.address.state,
              pincode: body.address.pincode,
            },
          });
          isNewAccount = true;
          orderUserId = user._id;
          // Issue session token for the newly created customer
          sessionToken = signToken({
            sub: String(user._id),
            role: user.role,
            email: user.email,
          });
          sendEmail({ to: normalizedEmail, ...tpl.welcome(user.name) }).catch(() => {});
        } else {
          // Existing email entered as guest does NOT prove ownership.
          orderUserId = undefined;
          user = null;
          sessionToken = undefined;
        }
      } else {
        // Customer chose to continue as guest without account creation
        orderUserId = undefined;
        user = null;
        sessionToken = undefined;
      }
    }

    // Razorpay signature verification (server-side) when method = razorpay
    if (body.payment.method === "razorpay") {
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } =
        body.payment;
      if (!env.RAZORPAY_KEY_SECRET)
        throw new HttpError(503, "Online payments are temporarily unavailable");
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new HttpError(
          400,
          "Complete Razorpay payment verification is required",
        );
      }
      {
        const expected = crypto
          .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest("hex");
        const ok =
          expected.length === razorpaySignature.length &&
          crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(razorpaySignature),
          );
        if (!ok) {
          if (normalizedEmail)
            sendEmail({
              to: normalizedEmail,
              ...tpl.paymentFailed(
                body.address.name || user?.name || "Customer",
                razorpayOrderId.slice(-6).toUpperCase(),
                0,
                "Signature mismatch",
              ),
            }).catch(() => {});
          throw new HttpError(
            400,
            "Payment signature verification failed; order cancelled",
          );
        }
      }
    }

    const requested = mergeItems(body.items);
    const products = await Product.find({
      _id: { $in: requested.map((i) => i.productId) },
      isActive: true,
    });
    if (products.length !== requested.length)
      throw new HttpError(400, "One or more products are unavailable");

    for (const i of requested) {
      const p = products.find((candidate) => String(candidate._id) === i.productId)!;
      if ((p.stock ?? 0) < i.qty)
        throw new HttpError(
          400,
          `${p.name} has only ${p.stock ?? 0} left in stock`,
        );
    }

    const settings =
      (await Settings.findOne({ key: "global" })) ??
      (await Settings.create({ key: "global" }));

    const isCod = body.payment.method === "cod";
    if (isCod) {
      if (!settings.codEnabled) {
        throw new HttpError(
          400,
          "Cash on Delivery is currently unavailable",
        );
      }
      const hasIneligibleProduct = products.some((p) => p.codEligible === false);
      if (hasIneligibleProduct) {
        throw new HttpError(
          400,
          "Cash on Delivery is unavailable for one or more items in your cart",
        );
      }
    }

    const codFee = isCod ? 40 : 0;
    if (body.codFee !== undefined && body.codFee !== codFee) {
      throw new HttpError(400, "Invalid COD handling fee");
    }

    const calculation = await validateAndCalculateCoupon({
      couponCode: body.couponCode,
      items: requested,
      paymentMethod: body.payment.method,
      customerInfo: {
        userId: orderUserId,
        email: normalizedEmail,
        phone: body.address.phone,
      },
      customSettings: {
        freeShipThreshold: settings.freeShipThreshold ?? 299,
        shippingFee: settings.shippingFee ?? 49,
      },
    });

    if (!calculation.valid) {
      throw new HttpError(400, calculation.error || "Coupon could not be applied");
    }

    let pointsDiscount = 0;
    let pointsToRedeem = 0;
    if (body.redeemPoints && body.redeemPoints > 0 && orderUserId) {
      const pointsCheck = await validateAndCalculatePointsRedemption({
        userId: orderUserId,
        pointsRequested: body.redeemPoints,
        subtotal: calculation.grossSubtotal,
        hasCoupon: Boolean(calculation.coupon && calculation.discount > 0),
      });
      if (!pointsCheck.valid) {
        throw new HttpError(400, pointsCheck.error || "Loyalty points redemption failed");
      }
      pointsToRedeem = pointsCheck.pointsRedeemed;
      pointsDiscount = pointsCheck.pointsDiscount;
    }

    const subtotal = calculation.grossSubtotal;
    const discount = calculation.discount;
    const shipping = calculation.shipping;
    const total = Math.max(0, Math.round((calculation.total - pointsDiscount + codFee) * 100) / 100);

    // Apportion pointsDiscount across items if present
    let accumulatedPointsDiscount = 0;
    const totalEligibleForPoints = calculation.itemBreakdown.reduce(
      (sum, b) => sum + (b.discountedLineTotal || b.lineGross),
      0
    );

    const items = calculation.itemBreakdown.map((b, idx) => {
      const p = products.find((candidate) => String(candidate._id) === b.productId)!;
      const itemCostPrice =
        typeof (p as any).costPrice === "number" && (p as any).costPrice > 0
          ? Number((p as any).costPrice)
          : undefined;

      let itemPointsDiscount = 0;
      if (pointsDiscount > 0 && totalEligibleForPoints > 0) {
        if (idx === calculation.itemBreakdown.length - 1) {
          itemPointsDiscount = Math.round((pointsDiscount - accumulatedPointsDiscount) * 100) / 100;
        } else {
          const ratio = (b.discountedLineTotal || b.lineGross) / totalEligibleForPoints;
          itemPointsDiscount = Math.round(pointsDiscount * ratio * 100) / 100;
          accumulatedPointsDiscount += itemPointsDiscount;
        }
      }

      const totalItemDiscount = (b.allocatedDiscount || 0) + itemPointsDiscount;
      const discountedLineTotal = Math.max(0, Math.round((b.lineGross - totalItemDiscount) * 100) / 100);
      const gstRate = Number(p.gstRate ?? 0);
      const gstInclusive = p.gstInclusive !== false;

      let taxableAmount = discountedLineTotal;
      let gstAmount = 0;
      if (gstRate > 0) {
        if (gstInclusive) {
          taxableAmount = Math.round((discountedLineTotal / (1 + gstRate / 100)) * 100) / 100;
          gstAmount = Math.round((discountedLineTotal - taxableAmount) * 100) / 100;
        } else {
          taxableAmount = discountedLineTotal;
          gstAmount = Math.round((discountedLineTotal * (gstRate / 100)) * 100) / 100;
        }
      }

      return {
        productId: p._id,
        name: b.name,
        image: b.image,
        price: b.price,
        costPrice: itemCostPrice,
        qty: b.qty,
        hsnCode: b.hsnCode,
        gstRate: b.gstRate,
        gstInclusive: b.gstInclusive,
        taxableAmount,
        gstAmount,
        discountAmount: totalItemDiscount,
        comboComponents: b.comboComponents,
      };
    });

    // Packaging Cost = ORDER VALUE x 2% (subtotal, excluding shipping)
    const packagingCost = Math.round(subtotal * 0.02 * 100) / 100;
    const razorpayFee = body.payment.method === "razorpay" ? Math.round(total * 0.0236 * 100) / 100 : 0;
    const courierCharge = 0;

    const initialFinances = computeOrderFinances({
      items,
      subtotal,
      shipping,
      codFee,
      total,
      payment: body.payment,
      courierCharge,
    }, courierCharge);

    const productCost = initialFinances.isCostAvailable ? initialFinances.productCost : undefined;
    const totalExpense = initialFinances.isCostAvailable ? initialFinances.totalExpense : undefined;
    const netProfit = initialFinances.isCostAvailable ? initialFinances.netProfit : undefined;

    // Safely decrement stock with all-or-nothing rollback protection across all items
    const decrementResult = await decrementOrderStockSafely(
      items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        name: item.name,
      })),
      {
        actorType: orderUserId ? "customer" : "guest",
        actorId: orderUserId || null,
        source: "checkout",
      }
    );

    const guestAccessToken = crypto.randomBytes(24).toString("hex");
    const initialStatus = body.payment.method === "razorpay" ? "Confirmed" : "Placed";

    let order: any;
    try {
      order = await Order.create({
        user: orderUserId,
        customerEmail: normalizedEmail,
        orderNo: await nextOrderNo(),
        needsGstInvoice: Boolean(body.needsGstInvoice),
        businessName: cleanBusinessName,
        gstin: cleanGstin,
        items,
        subtotal,
        discount,
        couponCode: calculation.coupon ? calculation.coupon.code : "",
        couponId: calculation.coupon ? calculation.coupon._id : null,
        couponDiscountType: calculation.coupon ? calculation.coupon.discountType : null,
        couponDiscountValue: calculation.coupon ? calculation.coupon.discountValue : 0,
        loyaltyPointsRedeemed: pointsToRedeem,
        loyaltyPointsDiscount: pointsDiscount,
        shipping,
        codFee,
        codFeeNonTaxable: true,
        total,
        courierCharge,
        packagingCost,
        razorpayFee,
        productCost,
        totalExpense,
        netProfit,
        courier: body.payment.method === "cod" ? "DTDC" : null,
        alternatePhone: body.address.alternatePhone || "",
        address: {
          name: body.address.name,
          phone: body.address.phone,
          alternatePhone: body.address.alternatePhone || "",
          line1: body.address.line1,
          line2: body.address.line2 || "",
          postOffice: body.address.postOffice?.trim() || "",
          city: body.address.city,
          state: body.address.state,
          pincode: body.address.pincode,
        },
        billingAddress: body.billingAddress
          ? {
              name: body.billingAddress.name || "",
              phone: body.billingAddress.phone || "",
              line1: body.billingAddress.line1 || "",
              line2: body.billingAddress.line2 || "",
              postOffice: body.billingAddress.postOffice?.trim() || "",
              city: body.billingAddress.city || "",
              state: body.billingAddress.state || "",
              pincode: body.billingAddress.pincode || "",
            }
          : undefined,
        payment: {
          method: body.payment.method,
          status: body.payment.method === "razorpay" ? "paid" : "pending",
          razorpayOrderId: body.payment.razorpayOrderId,
          razorpayPaymentId: body.payment.razorpayPaymentId,
          razorpaySignature: body.payment.razorpaySignature,
        },
        status: initialStatus,
        guestAccessToken,
        statusHistory: [
          {
            status: initialStatus,
            changedAt: new Date(),
            changedBy: orderUserId ? "customer" : "guest",
            note:
              body.payment.method === "razorpay"
                ? "Payment verified & order confirmed"
                : "Order placed (Cash on Delivery)",
          },
        ],
        analytics: body.analytics
          ? {
              visitorId: body.analytics.visitorId || "",
              sessionId: body.analytics.sessionId || "",
              device: body.analytics.device || "unknown",
              referrer: body.analytics.referrer || "",
              utm: {
                source: body.analytics.utm?.source || "",
                medium: body.analytics.utm?.medium || "",
                campaign: body.analytics.utm?.campaign || "",
                term: body.analytics.utm?.term || "",
                content: body.analytics.utm?.content || "",
              },
            }
          : undefined,
      });

      if (calculation.coupon && discount > 0) {
        try {
          await reserveCouponUsage({
            couponId: calculation.coupon._id,
            orderId: order._id,
            orderNo: order.orderNo,
            customerInfo: {
              userId: orderUserId,
              email: normalizedEmail,
              phone: body.address.phone,
            },
            discountAmount: discount,
          });
        } catch (couponErr) {
          await Order.findByIdAndDelete(order._id);
          throw couponErr;
        }
      }

      if (pointsToRedeem > 0 && orderUserId) {
        try {
          const redeemRes = await redeemPointsForOrder({
            userId: orderUserId,
            orderId: order._id,
            orderNo: order.orderNo,
            pointsToRedeem,
            pointsDiscount,
          });
          if (!redeemRes.success) {
            await Order.findByIdAndDelete(order._id);
            throw new HttpError(400, redeemRes.error || "Loyalty points redemption failed");
          }
        } catch (pointsErr) {
          await Order.findByIdAndDelete(order._id);
          throw pointsErr;
        }
      }
    } catch (orderCreateErr) {
      // Compensating rollback: if Order.create fails, restore all decremented items immediately
      await decrementResult.rollback();
      throw orderCreateErr;
    }

    // Order successfully created: record stock movement history
    await decrementResult.recordHistory(order._id, order.orderNo);

    // If order is confirmed and paid (e.g. Razorpay), earn loyalty points
    if (body.payment.method === "razorpay" && order.payment?.status === "paid") {
      earnPointsForOrder(order).catch((err) => console.error("[earnPointsForOrder:error]", err));
    }

    const payment = order.payment;
    const customerRecipientName = body.address.name || user?.name || "Customer";
    if (
      normalizedEmail &&
      (payment?.status === "paid" || payment?.method === "cod")
    ) {
      dispatchOrderInvoiceEmailOnce(order._id, normalizedEmail, customerRecipientName, {
        _id: order._id,
        orderNo: order.orderNo,
        trackingId: order.trackingId ?? undefined,
        courier: order.courier ?? undefined,
        courierTrackingUrl: order.courierTrackingUrl ?? undefined,
        status: order.status,
        items,
        subtotal,
        discount,
        couponCode: calculation.coupon?.code,
        loyaltyPointsRedeemed: pointsToRedeem,
        loyaltyDiscount: pointsDiscount,
        shipping,
        total,
        businessName: order.businessName || undefined,
        gstin: order.gstin || undefined,
        needsGstInvoice: order.needsGstInvoice,
        address: {
          name: body.address.name,
          phone: body.address.phone,
          alternatePhone: body.address.alternatePhone || undefined,
          line1: body.address.line1,
          line2: body.address.line2 || undefined,
          postOffice: body.address.postOffice?.trim() || undefined,
          city: body.address.city,
          state: body.address.state,
          pincode: body.address.pincode,
        },
        payment: {
          method: payment.method!,
          status: payment.status!,
          razorpayPaymentId: payment.razorpayPaymentId ?? undefined,
        },
        createdAt: order.createdAt,
      }).catch(() => {});
    } else if (normalizedEmail) {
      sendEmail({
        to: normalizedEmail,
        ...tpl.orderPlaced(customerRecipientName, formatOrderNumber(order), total),
      }).catch(() => {});
    }

    // Reconcile checkout session (mark recovered)
    try {
      const orClauses: any[] = [];
      if (body.sessionId) orClauses.push({ sessionId: body.sessionId });
      if (body.recoveryToken) orClauses.push({ recoveryToken: body.recoveryToken });
      if (orderUserId) orClauses.push({ user: orderUserId });
      if (normalizedEmail) orClauses.push({ email: normalizedEmail });

      if (orClauses.length > 0) {
        await CheckoutSession.updateMany(
          {
            $or: orClauses,
            status: { $ne: "recovered" },
          },
          {
            $set: {
              status: "recovered",
              recoveredAt: new Date(),
            },
          }
        );
      }
    } catch (sessionErr) {
      // Non-blocking: session reconciliation must never impede order placement
      // eslint-disable-next-line no-console
      console.error("[orders] Error reconciling checkout session:", sessionErr);
    }

    // Non-blocking: update daily analytics with order placement metrics
    try {
      await recordDailyOrder(order);
    } catch (analyticsErr) {
      // eslint-disable-next-line no-console
      console.error("[orders] Error recording daily order analytics:", analyticsErr);
    }

    res.status(201).json({
      order,
      token: sessionToken,
      user: user ? safeUser(user) : undefined,
      isNewAccount,
    });
  } catch (e) {
    next(e);
  }
});

// Frontend reports a payment failure (Razorpay modal closed / failed)
r.post("/payment-failed", optionalAuth, async (req, res, next) => {
  try {
    const {
      email,
      razorpayOrderId,
      amount,
      reason,
      items: requestedItems,
      address,
    } = z
      .object({
        email: z.string().email().optional(),
        razorpayOrderId: z.string().optional().default("N/A"),
        amount: z.number().optional().default(0),
        reason: z.string().optional().default("Payment was not completed"),
        items: z
          .array(
            z.object({
              productId: z.string(),
              qty: z.number().int().min(1).max(20),
            }),
          )
          .optional()
          .default([]),
        address: z
          .object({
            name: z.string().optional().default(""),
            phone: z.string().optional().default(""),
            alternatePhone: z.string().optional().default(""),
            line1: z.string().optional().default(""),
            city: z.string().optional().default(""),
            state: z.string().optional().default(""),
            pincode: z.string().optional().default(""),
          })
          .optional(),
      })
      .parse(req.body);

    let order =
      razorpayOrderId !== "N/A"
        ? await Order.findOne({ "payment.razorpayOrderId": razorpayOrderId })
        : null;

    if (!order && requestedItems.length > 0 && address) {
      const mergedItems = mergeItems(requestedItems);
      const products = await Product.find({
        _id: { $in: mergedItems.map((i) => i.productId) },
        isActive: true,
      });
      const items = mergedItems.flatMap((i) => {
        const p = products.find(
          (candidate) => String(candidate._id) === i.productId,
        );
        return p
          ? [
              {
                productId: p._id,
                name: p.name,
                image: p.image,
                price: p.price,
                qty: i.qty,
              },
            ]
          : [];
      });
      const subtotal = items.reduce(
        (s: number, i: any) => s + i.price * i.qty,
        0,
      );
      const settings =
        (await Settings.findOne({ key: "global" })) ??
        (await Settings.create({ key: "global" }));
      const shipping =
        subtotal >= settings.freeShipThreshold ? 0 : settings.shippingFee;
      const total = amount || subtotal + shipping;

      order = await Order.create({
        user: req.user?.sub || undefined,
        customerEmail: email || undefined,
        orderNo: await nextOrderNo(),
        items,
        subtotal,
        shipping,
        total,
        alternatePhone: address.alternatePhone || "",
        address: {
          ...address,
          alternatePhone: address.alternatePhone || "",
        },
        payment: {
          method: "razorpay",
          status: "failed",
          razorpayOrderId,
          failureReason: reason,
        },
        status: "Cancelled",
      });
    } else if (order) {
      // Guard: Do not downgrade an order that was already paid or Confirmed
      if (order.payment?.status !== "paid" && order.status !== "Confirmed") {
        order.payment!.status = "failed";
        order.payment!.failureReason = reason;
        order.status = "Cancelled";
        await order.save();
      } else {
        return res.json({ ok: true, ignored: true, reason: "Order is already paid/confirmed" });
      }
    }

    const user = req.user?.sub ? await User.findById(req.user.sub) : null;
    const recipientEmail = email || user?.email;
    const recipientName = address?.name || user?.name || "Customer";
    if (recipientEmail) {
      const orderRef = order
        ? formatOrderNumber(order)
        : razorpayOrderId.slice(-6).toUpperCase();
      await sendEmail({
        to: recipientEmail,
        ...tpl.paymentFailed(
          recipientName,
          orderRef,
          amount,
          reason,
        ),
      });
    }
    res.json({ ok: true, order });
  } catch (e) {
    next(e);
  }
});

function mergeItems(items: { productId: string; qty: number }[]) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    const qty = (byProduct.get(item.productId) ?? 0) + item.qty;
    if (qty > 20)
      throw new HttpError(400, "Maximum 20 quantity allowed for one product");
    byProduct.set(item.productId, qty);
  }
  return Array.from(byProduct.entries()).map(([productId, qty]) => ({
    productId,
    qty,
  }));
}

export default r;
