import { Resend } from "resend";
import { env } from "../config/env";
import { Order } from "../models/Order";
import { generateInvoicePDF, type InvoiceData } from "./invoice";
import { getCourierTrackingUrl } from "./courier";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export type EmailAttachment = { filename: string; content: Buffer };

export type EmailOrderPayload = {
  _id: any;
  orderNo?: number | string | null;
  trackingId?: string;
  courier?: string | null;
  courierTrackingUrl?: string;
  status?: string;
  businessName?: string;
  gstin?: string;
  needsGstInvoice?: boolean;
  items: Item[];
  subtotal: number;
  discount?: number;
  couponCode?: string;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscount?: number;
  walletUsed?: number;
  shipping: number;
  codFee?: number;
  total: number;
  address: Addr;
  payment: { method: string; status: string; razorpayPaymentId?: string };
  customerEmail?: string;
  createdAt?: Date | string | number;
};

export function formatOrderNumber(order: {
  orderNo?: number | string | null;
  _id?: any;
  id?: string;
}): string {
  if (order.orderNo !== undefined && order.orderNo !== null && order.orderNo !== "") {
    return String(order.orderNo).padStart(4, "0");
  }
  const idStr = String(order._id ?? order.id ?? "");
  if (idStr) {
    const hash = idStr.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return String(5000 + (hash % 5000)).padStart(4, "0");
  }
  return "5000";
}

export function buildEmailOrderPayload(o: any): EmailOrderPayload {
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
    discount: o.discount ?? 0,
    couponCode: o.couponCode ?? undefined,
    loyaltyPointsRedeemed: o.loyaltyPointsRedeemed ?? undefined,
    loyaltyDiscount: o.loyaltyPointsDiscount ?? undefined,
    walletUsed: o.walletAmountUsed ?? undefined,
    shipping: o.shipping ?? 0,
    codFee: o.codFee ?? 0,
    total: o.total ?? 0,
    address: o.address as any,
    payment: {
      method: o.payment?.method ?? "cod",
      status: o.payment?.status ?? "pending",
      razorpayPaymentId: o.payment?.razorpayPaymentId ?? undefined,
    },
    customerEmail: o.customerEmail ?? undefined,
    createdAt: o.createdAt,
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  bcc?: string[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}) {
  if (!resend) {
    // eslint-disable-next-line no-console
    console.log("[email:disabled]", opts.subject, "->", opts.to, opts.bcc ? `(bcc: ${opts.bcc.join(",")})` : "", opts.attachments?.length ? `(+${opts.attachments.length} attachment)` : "");
    return { skipped: true };
  }
  try {
    return await resend.emails.send({
      from: env.RESEND_FROM,
      to: opts.to,
      bcc: opts.bcc,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      headers: opts.headers,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email:error]", e);
    return { error: String(e) };
  }
}

const SUPPORT_EMAIL_BCC = ["support@shriradhagovindstore.com"];

/**
 * Sends an order-confirmation email with a PDF invoice attached.
 * Always use this helper for successful orders so the invoice is generated once.
 */
export async function sendOrderConfirmationWithInvoice(
  to: string,
  name: string,
  order: EmailOrderPayload
) {
  const orderNum = formatOrderNumber(order);
  const built = tpl.orderConfirmed(name, order);
  let attachments: EmailAttachment[] | undefined;
  try {
    const invoiceData: InvoiceData = {
      orderId: String(order._id),
      orderNo: order.orderNo ?? orderNum,
      invoiceNo: `INV-${orderNum}`,
      trackingId: order.trackingId,
      courier: order.courier ?? null,
      status: order.status,
      customerName: name,
      customerEmail: to,
      businessName: order.businessName,
      gstin: order.gstin,
      needsGstInvoice: order.needsGstInvoice,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      couponCode: order.couponCode,
      shipping: order.shipping,
      codFee: order.codFee,
      total: order.total,
      address: order.address,
      payment: order.payment,
      createdAt: order.createdAt,
    };
    const pdf = await generateInvoicePDF(invoiceData);
    const fname = `Invoice-${orderNum}.pdf`;
    attachments = [{ filename: fname, content: pdf }];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[invoice:error]", e);
  }
  return exports.sendEmail({
    to,
    bcc: SUPPORT_EMAIL_BCC,
    subject: built.subject,
    html: built.html,
    attachments,
  });
}

/**
 * Safely and idempotently dispatches the order confirmation email with invoice PDF.
 * Strict rules enforced:
 * 1. Check order.invoiceSentAt. If already sent, do NOT generate or send another invoice.
 * 2. Atomic lock via invoiceLockUntil prevents duplicate concurrent sends (e.g. concurrent webhooks or status changes).
 * 3. Generate invoice PDF.
 * 4. Send invoice email.
 * 5. ONLY AFTER the email sending operation succeeds: persist invoiceSentAt and clear the lock.
 * 6. If invoice generation or email fails: invoiceSentAt MUST remain null/unset, lock is cleared, allowing legitimate retries.
 */
export async function dispatchOrderInvoiceEmailOnce(
  orderId: any,
  to: string,
  name: string,
  order: EmailOrderPayload
): Promise<{ success: boolean; reason?: string; skipped?: boolean }> {
  if (!orderId || !to) return { success: false, reason: "missing_recipient_or_order_id" };

  const now = new Date();
  const lockExpiry = new Date(now.getTime() + 60 * 1000); // 60-second atomic lock window

  // Atomic check and lock: order must NOT have invoiceSentAt set, and must NOT have an active lock
  const lockedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      invoiceSentAt: null,
      $or: [
        { invoiceLockUntil: null },
        { invoiceLockUntil: { $lt: now } },
      ],
    },
    {
      $set: { invoiceLockUntil: lockExpiry },
    },
    { new: true }
  );

  if (!lockedOrder) {
    // Either already sent (invoiceSentAt is not null) or another worker is actively sending right now
    return { success: false, reason: "already_sent_or_in_progress", skipped: true };
  }

  try {
    const orderNum = formatOrderNumber(order);
    const invoiceData: InvoiceData = {
      orderId: String(order._id),
      orderNo: order.orderNo ?? orderNum,
      invoiceNo: `INV-${orderNum}`,
      trackingId: order.trackingId,
      courier: order.courier ?? null,
      status: order.status,
      customerName: name,
      customerEmail: to,
      businessName: order.businessName,
      gstin: order.gstin,
      needsGstInvoice: order.needsGstInvoice,
      items: order.items,
      subtotal: order.subtotal,
      shipping: order.shipping,
      codFee: order.codFee,
      total: order.total,
      address: order.address,
      payment: order.payment,
      createdAt: order.createdAt,
    };

    const pdf = await generateInvoicePDF(invoiceData);
    const fname = `Invoice-${orderNum}.pdf`;
    const attachments: EmailAttachment[] = [{ filename: fname, content: pdf }];

    const built = tpl.orderConfirmed(name, order);
    const sendResult = await exports.sendEmail({
      to,
      bcc: SUPPORT_EMAIL_BCC,
      subject: built.subject,
      html: built.html,
      attachments,
    });

    if (sendResult && (sendResult as any).error) {
      throw new Error(`Email provider error: ${JSON.stringify((sendResult as any).error)}`);
    }

    // ONLY AFTER the email sending operation succeeds: persist invoiceSentAt and release lock
    const sentDate = new Date();
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        invoiceSentAt: sentDate,
        invoiceLockUntil: null,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[dispatchOrderInvoiceEmailOnce] Failed to generate/send invoice email:", err);
    // Release the lock so a legitimate retry remains possible. invoiceSentAt MUST remain null/unset!
    await Order.findByIdAndUpdate(orderId, {
      $set: { invoiceLockUntil: null },
    }).catch(() => {});
    return { success: false, reason: err?.message || String(err) };
  }
}

/**
 * Sends a status update email WITHOUT invoice attachment.
 * Per business rules:
 * - Routine intermediate status updates (Processing, Hold, Packed, Shipped, Out for delivery, etc.)
 *   are sent to the customer ONLY with NO support BCC.
 * - Delivered notifications must be dispatched via dispatchOrderDeliveredEmailOnce to guarantee
 *   exactly ONE email with support BCC and prevent duplicate notifications on subsequent edits.
 */
export async function sendOrderStatusUpdate(
  to: string,
  name: string,
  order: EmailOrderPayload & { status: string },
  options?: { includeSupportBcc?: boolean }
) {
  const orderNum = formatOrderNumber(order);
  const built = tpl.statusUpdate(
    name,
    orderNum,
    order.status,
    order.trackingId,
    order.courier,
    order.courierTrackingUrl,
    order,
  );
  return exports.sendEmail({
    to,
    bcc: options?.includeSupportBcc ? SUPPORT_EMAIL_BCC : undefined,
    subject: built.subject,
    html: built.html,
  });
}

/**
 * Safely and idempotently dispatches the Delivered order email.
 * Strict rules enforced:
 * 1. Check order.deliveredSentAt. If already sent, do NOT send another email.
 * 2. Atomic lock via deliveredLockUntil prevents duplicate concurrent sends (e.g. concurrent webhook/admin/carrier sync).
 * 3. Sends email to customer with SUPPORT_EMAIL_BCC attached (so support receives exactly ONE Delivered email).
 * 4. ONLY AFTER the email sending operation succeeds: persist deliveredSentAt and clear the lock.
 * 5. If email provider fails: deliveredSentAt MUST remain null/unset, lock is cleared, allowing legitimate retries.
 */
export async function dispatchOrderDeliveredEmailOnce(
  orderId: any,
  to: string,
  name: string,
  order: EmailOrderPayload & { status: string }
): Promise<{ success: boolean; reason?: string; skipped?: boolean }> {
  if (!orderId || !to) return { success: false, reason: "missing_recipient_or_order_id" };

  const now = new Date();
  const lockExpiry = new Date(now.getTime() + 60 * 1000); // 60-second atomic lock window

  // Atomic check and lock: order must NOT have deliveredSentAt set, and must NOT have an active lock
  const lockedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      deliveredSentAt: null,
      $or: [
        { deliveredLockUntil: null },
        { deliveredLockUntil: { $lt: now } },
      ],
    },
    {
      $set: { deliveredLockUntil: lockExpiry },
    },
    { new: true }
  );

  if (!lockedOrder) {
    // Either already sent (deliveredSentAt is not null) or another worker is actively sending right now
    return { success: false, reason: "already_sent_or_in_progress", skipped: true };
  }

  try {
    const sendResult = await sendOrderStatusUpdate(to, name, order, { includeSupportBcc: true });

    if (sendResult && (sendResult as any).error) {
      throw new Error(`Email provider error: ${JSON.stringify((sendResult as any).error)}`);
    }

    // ONLY AFTER the email sending operation succeeds: persist deliveredSentAt and release lock
    const sentDate = new Date();
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        deliveredSentAt: sentDate,
        deliveredLockUntil: null,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[dispatchOrderDeliveredEmailOnce] Failed to send delivered email:", err);
    // Release the lock so a legitimate retry remains possible. deliveredSentAt MUST remain null/unset!
    await Order.findByIdAndUpdate(orderId, {
      $set: { deliveredLockUntil: null },
    }).catch(() => {});
    return { success: false, reason: err?.message || String(err) };
  }
}

/**
 * Safely and idempotently dispatches the order cancellation email using tpl.orderCancelled.
 * Strict rules enforced:
 * 1. Check order.cancelledEmailSentAt. If already sent, do NOT send duplicate email.
 * 2. Atomic lock via cancelledEmailLockUntil prevents duplicate concurrent sends (e.g. concurrent cancellation requests).
 * 3. Sends email to customer with human-readable Order Number and cancellation reason.
 * 4. ONLY AFTER sending succeeds: persist cancelledEmailSentAt and clear the lock.
 * 5. If sending fails: cancelledEmailSentAt remains null/unset, lock is cleared for retry.
 */
export async function dispatchOrderCancelledEmailOnce(
  order: any,
  to: string,
  name: string,
  reason: string
): Promise<{ success: boolean; reason?: string; skipped?: boolean }> {
  const orderId = order?._id || order?.id;
  if (!orderId || !to) return { success: false, reason: "missing_recipient_or_order_id" };

  const now = new Date();
  const lockExpiry = new Date(now.getTime() + 60 * 1000); // 60-second atomic lock window

  const lockedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      cancelledEmailSentAt: null,
      $or: [
        { cancelledEmailLockUntil: null },
        { cancelledEmailLockUntil: { $lt: now } },
      ],
    },
    {
      $set: { cancelledEmailLockUntil: lockExpiry },
    },
    { new: true }
  );

  if (!lockedOrder) {
    return { success: false, reason: "already_sent_or_in_progress", skipped: true };
  }

  try {
    const orderNum = formatOrderNumber(order);
    const built = tpl.orderCancelled(name, orderNum, reason);
    const sendResult = await exports.sendEmail({
      to,
      subject: built.subject,
      html: built.html,
    });

    if (sendResult && (sendResult as any).error) {
      throw new Error(`Email provider error: ${JSON.stringify((sendResult as any).error)}`);
    }

    const sentDate = new Date();
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        cancelledEmailSentAt: sentDate,
        cancelledEmailLockUntil: null,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[dispatchOrderCancelledEmailOnce] Failed to send cancellation email:", err);
    await Order.findByIdAndUpdate(orderId, {
      $set: { cancelledEmailLockUntil: null },
    }).catch(() => {});
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function sendOrderStatusUpdateWithInvoice(
  to: string,
  name: string,
  order: EmailOrderPayload & { status: string }
) {
  const orderNum = formatOrderNumber(order);
  const built = tpl.statusUpdate(
    name,
    orderNum,
    order.status,
    order.trackingId,
    order.courier,
    order.courierTrackingUrl,
    order,
  );
  let attachments: EmailAttachment[] | undefined;
  try {
    const invoiceData: InvoiceData = {
      orderId: String(order._id),
      orderNo: order.orderNo ?? orderNum,
      invoiceNo: `INV-${orderNum}`,
      trackingId: order.trackingId,
      courier: order.courier ?? null,
      status: order.status,
      customerName: name,
      customerEmail: to,
      businessName: order.businessName,
      gstin: order.gstin,
      needsGstInvoice: order.needsGstInvoice,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      couponCode: order.couponCode,
      shipping: order.shipping,
      total: order.total,
      address: order.address,
      payment: order.payment,
      createdAt: order.createdAt,
    };
    const pdf = await generateInvoicePDF(invoiceData);
    const fname = `Invoice-${orderNum}.pdf`;
    attachments = [{ filename: fname, content: pdf }];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[invoice:error]", e);
  }
  return exports.sendEmail({
    to,
    bcc: SUPPORT_EMAIL_BCC,
    subject: built.subject,
    html: built.html,
    attachments,
  });
}

const BRAND = "Shri Radha Govind Store";
const ACCENT = "#0f766e";

const shell = (inner: string) => `
<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f7f7f5;padding:24px;color:#1c1c1c">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec">
    <div style="background:${ACCENT};color:#fff;padding:18px 24px">
      <div style="font-size:18px;font-weight:600;letter-spacing:0.3px">${BRAND}</div>
      <div style="opacity:.85;font-size:12px">Made with love from Vrindavan</div>
    </div>
    <div style="padding:24px">${inner}</div>
    <div style="border-top:1px solid #ececec;padding:18px 24px;background:#fafaf8;color:#666;font-size:12px;line-height:1.6;text-align:center">
      <p style="margin:0 0 6px;color:#888;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">
        Please do not reply to this email.
      </p>
      <p style="margin:0 0 4px;color:#555">
        For any queries, please contact us at
        <a href="mailto:support@shriradhagovindstore.com" style="color:${ACCENT};font-weight:600;text-decoration:none">support@shriradhagovindstore.com</a>
      </p>
      <p style="margin:0 0 10px;color:#555">
        For assistance, call or WhatsApp us at
        <a href="tel:+917500533505" style="color:${ACCENT};font-weight:600;text-decoration:none">7500533505</a>
        (<a href="https://wa.me/917500533505" style="color:${ACCENT};font-weight:600;text-decoration:none">WhatsApp</a>)
      </p>
      <div style="border-top:1px solid #f0f0ee;padding-top:10px;color:#999;font-size:11px">
        © ${new Date().getFullYear()} ${BRAND} · Made with love from Heart of Vrindavan
      </div>
    </div>
  </div>
</div>`;

type Item = { name?: string; price?: number; qty: number };
type Addr = {
  name?: string;
  phone?: string;
  alternatePhone?: string;
  line1?: string;
  line2?: string;
  postOffice?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const rupee = (n?: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const invoiceTable = (
  items?: Item[],
  subtotal?: number,
  shipping?: number,
  total?: number,
  discount?: number,
  couponCode?: string,
  codFee?: number
) => `
  <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px">
    <thead>
      <tr style="background:#f4f4f1;text-align:left">
        <th style="padding:10px 12px">Item</th>
        <th style="padding:10px 12px;text-align:center">Qty</th>
        <th style="padding:10px 12px;text-align:right">Price</th>
        <th style="padding:10px 12px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${(items || []).map((i) => `
        <tr style="border-top:1px solid #eee">
          <td style="padding:10px 12px">${i.name ?? "Item"}</td>
          <td style="padding:10px 12px;text-align:center">${i.qty}</td>
          <td style="padding:10px 12px;text-align:right">${rupee(i.price ?? 0)}</td>
          <td style="padding:10px 12px;text-align:right">${rupee((i.price ?? 0) * (i.qty || 1))}</td>
        </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:8px 12px;text-align:right">Subtotal</td><td style="padding:8px 12px;text-align:right">${rupee(subtotal || 0)}</td></tr>
      ${discount && discount > 0 ? `<tr><td colspan="3" style="padding:8px 12px;text-align:right;color:#047857">Coupon Discount ${couponCode ? `(${couponCode})` : ""}</td><td style="padding:8px 12px;text-align:right;color:#047857">-${rupee(discount)}</td></tr>` : ""}
      <tr><td colspan="3" style="padding:8px 12px;text-align:right">Shipping</td><td style="padding:8px 12px;text-align:right">${!shipping || shipping === 0 ? "FREE" : rupee(shipping)}</td></tr>
      ${codFee && codFee > 0 ? `<tr><td colspan="3" style="padding:8px 12px;text-align:right">COD Handling Fee</td><td style="padding:8px 12px;text-align:right">${rupee(codFee)}</td></tr>` : ""}
      <tr style="background:#f4f4f1;font-weight:700">
        <td colspan="3" style="padding:10px 12px;text-align:right">Total Paid</td>
        <td style="padding:10px 12px;text-align:right;color:${ACCENT}">${rupee(total || 0)}</td>
      </tr>
    </tfoot>
  </table>`;

const customerBlock = (name: string, email?: string, a?: Addr, businessName?: string, gstin?: string) => `
  <div style="margin-top:16px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;line-height:1.6;color:#374151">
    <div style="font-weight:700;color:#111827;font-size:14px;margin-bottom:6px">Customer & Delivery Details</div>
    <div><b>${a?.name || name}</b></div>
    ${businessName ? `<div style="margin-top:2px"><b>Business:</b> ${businessName}</div>` : ""}
    ${gstin ? `<div style="margin-top:2px"><b>Customer GSTIN:</b> ${gstin}</div>` : ""}
    ${email ? `<div>Email: <a href="mailto:${email}" style="color:${ACCENT};text-decoration:none">${email}</a></div>` : ""}
    ${a?.phone ? `<div>Phone: <a href="tel:${a.phone}" style="color:${ACCENT};text-decoration:none">${a.phone}</a></div>` : ""}
    ${a?.alternatePhone ? `<div>Alt Phone: <a href="tel:${a.alternatePhone}" style="color:${ACCENT};text-decoration:none">${a.alternatePhone}</a></div>` : ""}
    ${a?.line1 || a?.line2 || a?.postOffice || a?.city || a?.state || a?.pincode ? `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;color:#4b5563">
        <div style="font-weight:600;font-size:12px;color:#6b7280;text-transform:uppercase;margin-bottom:2px">Delivery Address</div>
        ${a.line1 ? `<div>${a.line1}</div>` : ""}
        ${a.line2 ? `<div>${a.line2}</div>` : ""}
        ${a.postOffice ? `<div>PO: ${a.postOffice}</div>` : ""}
        <div>${[a.city, a.state, a.pincode].filter(Boolean).join(", ")}</div>
      </div>
    ` : ""}
  </div>`;

export const tpl = {
  welcome: (name: string) => ({
    subject: `Welcome to ${BRAND}`,
    html: shell(`<h2 style="margin:0 0 8px">Radhe Radhe, ${name}!</h2>
      <p>Your devotee account is ready. Explore sacred essentials curated from Vrindavan.</p>`),
  }),

  loginOtp: (name: string, otp: string) => ({
    subject: `Your Login OTP - ${BRAND}`,
    html: shell(`<h2 style="margin:0 0 8px">Radhe Radhe, ${name || "Devotee"}</h2>
      <p>Use this secure 6-digit OTP to sign in to your Shri Radha Govind Store account. It is valid for 10 minutes.</p>
      <div style="margin:18px 0;padding:14px 18px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px;font-size:28px;font-weight:700;letter-spacing:6px;color:${ACCENT};text-align:center">${otp}</div>
      <p style="font-size:13px;color:#777">If you did not request this OTP, you can safely ignore this email.</p>`),
  }),

  passwordResetOtp: (name: string, otp: string) => ({
    subject: `Password reset OTP - ${BRAND}`,
    html: shell(`<h2 style="margin:0 0 8px">Radhe Radhe, ${name}</h2>
      <p>Use this OTP to reset your password. It expires in 10 minutes.</p>
      <div style="margin:18px 0;padding:14px 18px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px;font-size:28px;font-weight:700;letter-spacing:6px;color:${ACCENT};text-align:center">${otp}</div>
      <p style="font-size:13px;color:#777">If you did not request this, you can ignore this email.</p>`),
  }),

  orderConfirmed: (
    name: string,
    order: EmailOrderPayload
  ) => {
    const orderNum = formatOrderNumber(order);
    const trackingUrl = order.courierTrackingUrl || getCourierTrackingUrl(order.courier, order.trackingId);
    const hasTracking = !!(order.trackingId && order.trackingId.trim());

    return {
      subject: `Order confirmed - #${orderNum}`,
      html: shell(`
        <h2 style="margin:0 0 6px">Thank you, ${name}! 🌸</h2>
        <p style="margin:0 0 4px;color:#555">Your order <b>#${orderNum}</b> has been received and confirmed.</p>

        <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
          ${hasTracking ? `
            <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase">Tracking ID (AWB)</div>
            <div style="font-size:22px;font-weight:700;color:#0f766e">${order.trackingId}</div>
            <div style="margin-top:6px;font-size:13px;color:#555">Order Number: <b>#${orderNum}</b></div>
            <div style="margin-top:4px;font-size:13px;color:#555">Status: <b style="color:${ACCENT}">${order.status ?? "Confirmed"}</b></div>
            <div style="margin-top:4px;font-size:13px;color:#555">Courier: <b>${order.courier ?? "To be assigned"}</b></div>
            ${trackingUrl ? `<div style="margin-top:8px"><a href="${trackingUrl}" style="display:inline-block;background:${ACCENT};color:#fff;padding:8px 16px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500">Track with ${order.courier || "Courier"}</a></div>` : ""}
          ` : `
            <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase">Order Details</div>
            <div style="font-size:20px;font-weight:700;color:#0f766e">Order #${orderNum}</div>
            <div style="margin-top:6px;font-size:13px;color:#555">Status: <b style="color:${ACCENT}">${order.status ?? "Confirmed"}</b></div>
            ${order.courier ? `<div style="margin-top:4px;font-size:13px;color:#555">Courier: <b>${order.courier}</b></div>` : ""}
            <div style="margin-top:4px;font-size:13px;color:#777">Tracking ID: <i>Will be assigned once shipped</i></div>
            <div style="margin-top:10px">
              <a href="https://www.shriradhagovindstore.com/track?id=${encodeURIComponent(orderNum)}"
                style="display:inline-block;background:${ACCENT};color:#fff;padding:8px 16px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500">
                View order status
              </a>
            </div>
          `}
        </div>

        <h3 style="margin:18px 0 4px">Invoice & Order Details</h3>
        <div style="font-size:12px;color:#888">Order ID: #${orderNum}${hasTracking ? ` | Tracking ID: ${order.trackingId}` : ""} | Payment: ${order.payment.method.toUpperCase()} | ${order.payment.status.toUpperCase()}${order.payment.razorpayPaymentId ? ` | Txn ${order.payment.razorpayPaymentId}` : ""}</div>
        ${invoiceTable(order.items, order.subtotal, order.shipping, order.total, order.discount, order.couponCode, order.codFee)}

        ${customerBlock(name, order.customerEmail, order.address, order.businessName, order.gstin)}
      `),
    };
  },

  paymentFailed: (name: string, ref: string, amount: number, reason: string) => ({
    subject: `Payment failed for Order #${ref} - order auto-cancelled`,
    html: shell(`
      <h2 style="margin:0 0 8px">Sorry, ${name} 😔</h2>
      <p>Your payment of <b>${rupee(amount)}</b> for order <b>#${ref}</b> could not be verified, so we have automatically cancelled the order.</p>
      <p style="font-size:13px;color:#888">Reason: ${reason}</p>
      <p>No amount has been debited; if your bank shows a hold, it will reverse within 5–7 business days.</p>
      <a href="https://shriradhagovindstore.com/cart" style="display:inline-block;margin-top:10px;background:${ACCENT};color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-size:13px">Try again</a>
    `),
  }),

  orderCancelled: (name: string, ref: string, reason: string) => ({
    subject: `Order #${ref} cancelled - Shri Radha Govind Store`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your order <b>#${ref}</b> has been cancelled.</p>

      <div style="margin:16px 0;padding:14px 16px;background:#fef2f2;border:1px solid #fee2e2;border-radius:10px">
        <div style="font-size:12px;color:#dc2626;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cancellation Details</div>
        <div style="margin-top:6px;font-size:14px;color:#333">Order Number: <b>#${ref}</b></div>
        <div style="margin-top:4px;font-size:14px;color:#333">Status: <b style="color:#dc2626">Cancelled</b></div>
        <div style="margin-top:6px;font-size:13px;color:#555">Reason: <i>${reason || "Requested by customer"}</i></div>
      </div>

      <p style="font-size:13px;color:#666;line-height:1.5">
        If you have any questions or need further assistance with your devotional purchases, our support team is always here to assist you at <a href="mailto:support@shriradhagovindstore.com" style="color:${ACCENT};text-decoration:none">support@shriradhagovindstore.com</a>.
      </p>

      <div style="margin-top:16px">
        <a href="https://www.shriradhagovindstore.com"
          style="display:inline-block;background:${ACCENT};color:#fff;padding:9px 18px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500">
          Visit Storefront
        </a>
      </div>
    `),
  }),

  statusUpdate: (
    name: string,
    ref: string,
    status: string,
    trackingId?: string,
    courier?: string | null,
    url?: string,
    order?: EmailOrderPayload
  ) => {
    const orderNum = order ? formatOrderNumber(order) : ref;
    const effectiveTrackingId = trackingId ?? order?.trackingId;
    const effectiveCourier = courier ?? order?.courier;
    const trackingUrl = url || order?.courierTrackingUrl || getCourierTrackingUrl(effectiveCourier, effectiveTrackingId);
    const hasTracking = !!(effectiveTrackingId && effectiveTrackingId.trim());

    return {
      subject: `Order #${orderNum} - ${status}`,
      html: shell(`
        <h2 style="margin:0 0 6px">Update on your order</h2>
        <p>Hi ${name}, your order <b>#${orderNum}</b> is now <b style="color:${ACCENT}">${status}</b>.</p>

        <div style="margin:14px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
          ${hasTracking ? `
            <div style="font-size:12px;color:${ACCENT};letter-spacing:.1em;text-transform:uppercase">Tracking ID (AWB)</div>
            <div style="font-size:20px;font-weight:700;color:${ACCENT}">${effectiveTrackingId}</div>
            <div style="margin-top:6px;font-size:13px;color:#555">Order Number: <b>#${orderNum}</b></div>
            <div style="margin-top:4px;font-size:13px;color:#555">Status: <b style="color:${ACCENT}">${status}</b></div>
            <div style="margin-top:4px;font-size:13px;color:#555">Courier: <b>${effectiveCourier ?? "To be assigned"}</b></div>
            ${trackingUrl ? `<div style="margin-top:8px"><a href="${trackingUrl}" style="display:inline-block;background:${ACCENT};color:#fff;padding:8px 16px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500">Track with ${effectiveCourier || "Courier"}</a></div>` : ""}
          ` : `
            <div style="font-size:12px;color:${ACCENT};letter-spacing:.1em;text-transform:uppercase">Order Details</div>
            <div style="font-size:20px;font-weight:700;color:${ACCENT}">Order #${orderNum}</div>
            <div style="margin-top:6px;font-size:13px;color:#555">Status: <b style="color:${ACCENT}">${status}</b></div>
            ${effectiveCourier ? `<div style="margin-top:4px;font-size:13px;color:#555">Courier: <b>${effectiveCourier}</b></div>` : ""}
            <div style="margin-top:4px;font-size:13px;color:#777">Tracking ID: <i>Will be assigned once shipped</i></div>
            <div style="margin-top:10px">
              <a href="https://www.shriradhagovindstore.com/track?id=${encodeURIComponent(orderNum)}"
                style="display:inline-block;background:${ACCENT};color:#fff;padding:8px 16px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:500">
                View order status
              </a>
            </div>
          `}
        </div>

        ${order ? `
          <h3 style="margin:18px 0 4px">Order details</h3>
          <div style="font-size:12px;color:#888">Order ID: #${orderNum}${hasTracking ? ` | Tracking ID: ${effectiveTrackingId}` : ""}${order.payment ? ` | Payment: ${(order.payment.method || "ONLINE").toUpperCase()} | ${(order.payment.status || "PAID").toUpperCase()}` : ""}</div>
          ${invoiceTable(order.items, order.subtotal, order.shipping, order.total, order.discount, order.couponCode, order.codFee)}
          ${customerBlock(name, order.customerEmail, order.address, order?.businessName, order?.gstin)}
        ` : ""}
      `),
    };
  },

  // legacy alias kept for other call sites
  orderPlaced: (name: string, orderId: string, total: number) => ({
    subject: `Order #${orderId} received`,
    html: shell(`<h2>Thank you, ${name}!</h2><p>Your order <b>#${orderId}</b> for <b>${rupee(total)}</b> has been received.</p>`),
  }),

  abandonedCart: (
    name: string,
    items: Array<{ name: string; qty: number; price: number; image?: string }>,
    recoveryUrl: string,
    total: number
  ) => {
    const greetingName = name?.trim() ? name.trim() : "Devotee";
    const itemsRows = items
      .map(
        (i) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f1ed">
            <div style="font-weight:600;color:#1c1917;font-size:14px">${i.name}</div>
            <div style="font-size:12px;color:#78716c">Qty: ${i.qty}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f1ed;text-align:right;font-weight:600;color:#1c1917;font-size:14px">
            ${rupee(i.price * i.qty)}
          </td>
        </tr>`
      )
      .join("");

    return {
      subject: `Radhe Radhe 🙏 Your sacred selections are waiting - ${BRAND}`,
      html: shell(`
        <h2 style="margin:0 0 10px;font-size:22px;color:#1c1917">Radhe Radhe, ${greetingName} 🌸</h2>
        <p style="margin:0 0 14px;color:#44403c;font-size:14px;line-height:1.6">
          We noticed you left some sacred essentials in your cart during your recent visit. Your Vrindavan treasures are preserved and ready for you whenever you wish to complete your order.
        </p>

        <div style="margin:18px 0;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden">
          <div style="padding:12px 14px;background:#f5f5f4;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#57534e">
            Items in your cart
          </div>
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              ${itemsRows}
            </tbody>
            <tfoot>
              <tr style="background:#fafaf9">
                <td style="padding:12px 14px;font-weight:700;color:#1c1917;font-size:14px">Estimated Total</td>
                <td style="padding:12px 14px;text-align:right;font-weight:700;color:${ACCENT};font-size:16px">${rupee(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin:24px 0 16px;text-align:center">
          <a href="${recoveryUrl}"
             style="display:inline-block;background:${ACCENT};color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:600;box-shadow:0 4px 12px rgba(15,118,110,0.25)">
            Complete Your Order &rarr;
          </a>
        </div>

        <p style="margin:20px 0 0;font-size:12px;color:#78716c;line-height:1.5;text-align:center">
          If you have already completed this purchase or no longer need these items, you can safely disregard this email.<br/>
          For any questions or seva assistance, feel free to reply to this email or reach us on WhatsApp.
        </p>
      `),
    };
  },

  requestedInvoice: (
    name: string,
    orderNum: string,
    invoiceNo: string,
    oneTimeDownloadUrl: string,
    expiresAtFormatted: string
  ) => ({
    subject: `Tax Invoice ${invoiceNo} for Order #${orderNum} - Shri Radha Govind Store`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">
        Here is the official tax invoice you requested for your order <b>#${orderNum}</b> (Invoice: <b>${invoiceNo}</b>).
      </p>

      <div style="margin:16px 0;padding:16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:${ACCENT};letter-spacing:.1em;text-transform:uppercase;font-weight:700">Invoice Information</div>
        <div style="margin-top:6px;font-size:14px;color:#333">Order Number: <b>#${orderNum}</b></div>
        <div style="margin-top:4px;font-size:14px;color:#333">Invoice Number: <b>${invoiceNo}</b></div>
        <div style="margin-top:6px;font-size:13px;color:#555">The official PDF invoice has been attached directly to this email.</div>
      </div>

      <div style="margin:20px 0;padding:16px;background:#fffbeb;border:1px solid #fef3c7;border-radius:10px">
        <div style="font-size:13px;font-weight:700;color:#b45309">One-Time Secure Website Download</div>
        <p style="margin:6px 0 12px;font-size:13px;color:#78350f;line-height:1.5">
          If you prefer downloading your invoice directly through our website, you may use the secure link below.
          <br/><b>Note:</b> This link is single-use and will expire on <b>${expiresAtFormatted}</b> (48 hours from issuance).
        </p>
        <div style="text-align:center;margin:12px 0 6px">
          <a href="${oneTimeDownloadUrl}"
            style="display:inline-block;background:${ACCENT};color:#ffffff;padding:10px 22px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600">
            Download Invoice (Single-Use) &rarr;
          </a>
        </div>
      </div>

      <p style="font-size:13px;color:#666;line-height:1.5">
        If you have any questions or need further seva assistance, please contact us at <a href="mailto:support@shriradhagovindstore.com" style="color:${ACCENT};text-decoration:none">support@shriradhagovindstore.com</a>.
      </p>
    `),
  }),

  winBack: (name: string, discountCode: string, discountText = "10% OFF") => ({
    subject: `We miss you at Shri Radha Govind Store! Special sacred gift inside 🎁`,
    html: shell(`
      <h2 style="margin:0 0 8px">Radhe Radhe, ${name || "Devotee"} 🙏</h2>
      <p style="margin:0 0 14px;color:#444;line-height:1.6">
        It has been a while since your last visit to Vrindavan's sacred collection. We hope your seva and devotions are flourishing.
      </p>
      <div style="margin:20px 0;padding:20px;background:#fffbeb;border:1px dashed #d97706;border-radius:12px;text-align:center">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#92400e">Exclusive Devotee Reconnect Blessing</p>
        <div style="font-size:26px;font-weight:800;letter-spacing:4px;color:#b45309;padding:8px 16px">${discountCode}</div>
        <p style="margin:8px 0 0;font-size:13px;color:#b45309">Use this code at checkout to enjoy <b>${discountText}</b> on your next order.</p>
      </div>
      <div style="text-align:center;margin:24px 0 10px">
        <a href="https://shriradhagovindstore.com/shop" style="display:inline-block;background:${ACCENT};color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">
          Visit Sacred Shop &rarr;
        </a>
      </div>
    `),
  }),

  loyaltyMilestone: (name: string, pointsBalance: number, rupeeValue: number) => ({
    subject: `You have ${pointsBalance} Divine Reward Points waiting for you! 🌟`,
    html: shell(`
      <h2 style="margin:0 0 8px">Radhe Radhe, ${name || "Devotee"} 🙏</h2>
      <p style="margin:0 0 14px;color:#444;line-height:1.6">
        Thank you for your blessed association with Shri Radha Govind Store. Your devotion and seva have earned you valuable rewards.
      </p>
      <div style="margin:20px 0;padding:20px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;text-align:center">
        <div style="font-size:32px;font-weight:800;color:${ACCENT}">${pointsBalance} Points</div>
        <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#134e4a">Worth ${rupee(rupeeValue)} toward your next sacred order</p>
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5">You can apply these points directly at checkout to save on sacred essentials, dress sets, or tulsi items.</p>
      <div style="text-align:center;margin:22px 0 10px">
        <a href="https://shriradhagovindstore.com/profile" style="display:inline-block;background:${ACCENT};color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">
          View Your Rewards &rarr;
        </a>
      </div>
    `),
  }),

  tierUpgrade: (name: string, newTierName: string, perks: string[]) => ({
    subject: `Congratulations! You've reached ${newTierName} Status at Shri Radha Govind Store 🏆`,
    html: shell(`
      <h2 style="margin:0 0 8px">Radhe Radhe, ${name || "Devotee"} 🙏</h2>
      <p style="margin:0 0 14px;color:#444;line-height:1.6">
        We are thrilled to welcome you into our highest echelon of devotees. Your continuous association has elevated you to:
      </p>
      <div style="margin:20px 0;padding:20px;background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#b45309">${newTierName}</div>
        <div style="margin-top:12px;text-align:left;display:inline-block">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#78350f">Your Exclusive Tier Privileges:</p>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#92400e;line-height:1.6">
            ${perks.map((p) => `<li>${p}</li>`).join("")}
          </ul>
        </div>
      </div>
    `),
  }),
  returnRequested: (name: string, orderNum: string, items: Array<{name: string; qty: number}>) => ({
    subject: `Return Request Received — Order #${orderNum}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">We have received your return request for order <b>#${orderNum}</b> and will review it shortly.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Items Requested for Return</div>
        ${items.map(i => `<div style="margin-top:6px;font-size:14px;color:#333">${i.name} — Qty: ${i.qty}</div>`).join('')}
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5">Our team will review your request and respond within 1–2 business days. For queries, contact us at <a href="mailto:support@shriradhagovindstore.com" style="color:#0f766e">support@shriradhagovindstore.com</a>.</p>
    `),
  }),

  returnApproved: (name: string, orderNum: string, resolution: string, items: Array<{name: string; qty: number}>) => ({
    subject: `Return Approved — Order #${orderNum}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your return request for order <b>#${orderNum}</b> has been <b style="color:#0f766e">approved</b>.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Return Decision</div>
        <div style="margin-top:6px;font-size:14px;color:#333">Resolution: <b>${resolution === 'replacement' ? 'Replacement' : 'Refund'}</b></div>
        ${items.map(i => `<div style="margin-top:4px;font-size:13px;color:#555">${i.name} — Qty: ${i.qty}</div>`).join('')}
      </div>
      ${resolution === 'refund' ? '<p style="font-size:13px;color:#666;line-height:1.5">Please ship the item(s) back to us as instructed. Once we receive and verify the goods, we will process your refund.</p>' : '<p style="font-size:13px;color:#666;line-height:1.5">A replacement will be arranged for you. Our team will contact you with further details.</p>'}
      <p style="font-size:13px;color:#666">For assistance, contact us at <a href="mailto:support@shriradhagovindstore.com" style="color:#0f766e">support@shriradhagovindstore.com</a>.</p>
    `),
  }),

  returnRejected: (name: string, orderNum: string, reason: string) => ({
    subject: `Return Request Update — Order #${orderNum}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">We have reviewed your return request for order <b>#${orderNum}</b>.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#fef2f2;border:1px solid #fee2e2;border-radius:10px">
        <div style="font-size:12px;color:#dc2626;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Return Not Approved</div>
        <div style="margin-top:6px;font-size:14px;color:#333">Reason: <i>${reason || 'Does not meet return policy criteria.'}</i></div>
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5">If you believe this decision is incorrect or need further assistance, please contact us at <a href="mailto:support@shriradhagovindstore.com" style="color:#0f766e">support@shriradhagovindstore.com</a>.</p>
    `),
  }),

  returnRefunded: (name: string, orderNum: string, amount: number, method: string, upiRef?: string) => ({
    subject: `Refund Processed — Order #${orderNum}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your refund for order <b>#${orderNum}</b> has been processed.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Refund Details</div>
        <div style="margin-top:6px;font-size:16px;font-weight:700;color:#0f766e">₹${amount.toFixed(2)}</div>
        <div style="margin-top:4px;font-size:14px;color:#333">Method: <b>${method === 'wallet' ? 'Store Wallet / Credit' : 'UPI'}</b></div>
        ${upiRef ? `<div style="margin-top:4px;font-size:13px;color:#555">UPI Reference: <b>${upiRef}</b></div>` : ''}
        ${method === 'wallet' ? '<div style="margin-top:6px;font-size:13px;color:#555">The amount has been credited to your store wallet and is available for your next purchase.</div>' : '<div style="margin-top:6px;font-size:13px;color:#555">Please allow 1–3 business days for the amount to reflect in your UPI account.</div>'}
      </div>
      <p style="font-size:12px;color:#888">Note: Original shipping charges are non-refundable.</p>
      <p style="font-size:13px;color:#666">Thank you for shopping with Shri Radha Govind Store. Hare Krishna 🙏</p>
    `),
  }),

  ticketCreated: (name: string, ticketNo: string, subject: string, category: string, orderNo?: number | null) => ({
    subject: `Support Ticket Received — #${ticketNo}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">We have received your support inquiry <b>#${ticketNo}</b> and our seva team will assist you shortly.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Ticket Details</div>
        <div style="margin-top:6px;font-size:14px;color:#333">Ticket Number: <b>#${ticketNo}</b></div>
        <div style="margin-top:4px;font-size:13px;color:#555">Category: <b>${category}</b></div>
        <div style="margin-top:4px;font-size:13px;color:#555">Subject: <b>${subject}</b></div>
        ${orderNo ? `<div style="margin-top:4px;font-size:13px;color:#555">Linked Order: <b>#${orderNo}</b></div>` : ''}
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5"><b>Response Target:</b> We aim to respond within 24 business hours (Monday to Saturday, 10 AM – 7 PM IST). If you need to share photos or unboxing videos, you may reply to this email or send them on our official WhatsApp at <a href="https://wa.me/917500533505" style="color:#0f766e;font-weight:600">+91 7500533505</a>.</p>
      <p style="font-size:13px;color:#666">Thank you for reaching out to Shri Radha Govind Store. Hare Krishna 🙏</p>
    `),
  }),

  ticketAdminReply: (name: string, ticketNo: string, subject: string, replyMessage: string) => ({
    subject: `Update on Support Ticket #${ticketNo} — ${subject}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Our seva team has responded to your support ticket <b>#${ticketNo}</b>.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Message from Store Support</div>
        <div style="margin-top:8px;font-size:14px;color:#333;white-space:pre-wrap;line-height:1.5">${replyMessage}</div>
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5">You can view your ticket and reply directly through our website or reply to this email.</p>
      <p style="font-size:13px;color:#666">At your service in Braj Seva, <br /><b>Shri Radha Govind Store</b></p>
    `),
  }),

  ticketWaitingForCustomer: (name: string, ticketNo: string, subject: string, instructions: string) => ({
    subject: `Action Required for Support Ticket #${ticketNo}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">We need a little more information to resolve your support ticket <b>#${ticketNo}</b>.</p>
      <div style="margin:16px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fef3c7;border-radius:10px">
        <div style="font-size:12px;color:#b45309;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Information Needed</div>
        <div style="margin-top:8px;font-size:14px;color:#78350f;white-space:pre-wrap;line-height:1.5">${instructions}</div>
      </div>
      <p style="font-size:13px;color:#666;line-height:1.5">Please reply to this email or visit our website to provide the requested details so we can assist you promptly.</p>
    `),
  }),

  ticketResolved: (name: string, ticketNo: string, subject: string, resolutionNote?: string) => ({
    subject: `Support Ticket Resolved — #${ticketNo}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your support ticket <b>#${ticketNo}</b> (${subject}) has been marked as <b style="color:#0f766e">Resolved</b>.</p>
      ${resolutionNote ? `
      <div style="margin:16px 0;padding:14px 16px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:10px">
        <div style="font-size:12px;color:#0f766e;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Resolution Summary</div>
        <div style="margin-top:8px;font-size:14px;color:#333;white-space:pre-wrap;line-height:1.5">${resolutionNote}</div>
      </div>
      ` : ''}
      <p style="font-size:13px;color:#666;line-height:1.5">If your inquiry has not been fully resolved, you can simply reply to this email or send a message on the ticket to <b>reopen it within 72 hours</b>. After 72 hours of inactivity, the ticket will be automatically closed.</p>
      <p style="font-size:13px;color:#666">Thank you for your devotion and patience. Hare Krishna 🙏</p>
    `),
  }),

  ticketClosed: (name: string, ticketNo: string, subject: string) => ({
    subject: `Support Ticket Closed — #${ticketNo}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your support ticket <b>#${ticketNo}</b> (${subject}) is now closed.</p>
      <p style="font-size:13px;color:#666;line-height:1.5">If you have any further questions or require assistance in the future, please feel free to open a new support ticket on our website or contact our support team at <a href="mailto:support@shriradhagovindstore.com" style="color:#0f766e">support@shriradhagovindstore.com</a>.</p>
      <p style="font-size:13px;color:#666">Always in your service, <br /><b>Shri Radha Govind Store</b></p>
    `),
  }),

  ticketReopened: (name: string, ticketNo: string, subject: string) => ({
    subject: `Support Ticket Reopened — #${ticketNo}`,
    html: shell(`
      <h2 style="margin:0 0 6px">Hare Krishna, ${name} 🙏</h2>
      <p style="margin:0 0 12px;color:#555">Your support ticket <b>#${ticketNo}</b> (${subject}) has been reopened.</p>
      <p style="font-size:13px;color:#666;line-height:1.5">Our seva team will review your latest message and get back to you as soon as possible.</p>
      <p style="font-size:13px;color:#666">Thank you for your patience. Hare Krishna 🙏</p>
    `),
  }),
};

export async function dispatchRequestedInvoiceEmail(opts: {
  to: string;
  name: string;
  orderNum: string;
  invoiceNo: string;
  oneTimeDownloadUrl: string;
  expiresAt: Date;
  pdfBuffer: Buffer;
}): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    const expiresAtFormatted = opts.expiresAt.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const built = tpl.requestedInvoice(
      opts.name,
      opts.orderNum,
      opts.invoiceNo,
      opts.oneTimeDownloadUrl,
      expiresAtFormatted
    );
    const fname = `Invoice-${opts.orderNum}.pdf`;
    const attachments: EmailAttachment[] = [{ filename: fname, content: opts.pdfBuffer }];

    const res = await sendEmail({
      to: opts.to,
      bcc: SUPPORT_EMAIL_BCC,
      subject: built.subject,
      html: built.html,
      attachments,
    });
    if (res && (res as any).error) {
      return { success: false, error: String((res as any).error) };
    }
    return { success: true, skipped: Boolean((res as any)?.skipped) };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dispatches a re-engagement/marketing email with strict opt-out enforcement.
 * Checks both User.marketingEmailOptIn and MarketingUnsubscribe before sending.
 * Injects required List-Unsubscribe headers and one-click footer.
 */
export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  html: string;
  campaignName?: string;
}): Promise<{ success: boolean; skipped?: boolean; error?: string; reason?: string }> {
  try {
    const cleanEmail = opts.to.trim().toLowerCase();

    // 1. Enforce opt-out: check User and MarketingUnsubscribe
    const { User } = await import("../models/User");
    const { MarketingUnsubscribe } = await import("../models/MarketingUnsubscribe");

    const [userOptOut, unsubRecord] = await Promise.all([
      User.findOne({ email: cleanEmail, marketingEmailOptIn: false }).select("_id").lean(),
      MarketingUnsubscribe.findOne({ email: cleanEmail }).select("_id").lean(),
    ]);

    if (userOptOut || unsubRecord) {
      console.log(`[email:marketing_skipped_unsubscribed] ${cleanEmail} is unsubscribed from marketing`);
      return { success: true, skipped: true, reason: "unsubscribed" };
    }

    const unsubUrl = `https://shriradhagovindstore.com/api/marketing/unsubscribe?email=${encodeURIComponent(cleanEmail)}`;

    const footerHtml = `
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
        <p style="margin:0 0 4px">You received this sacred update because you are a valued devotee of Shri Radha Govind Store, Vrindavan.</p>
        <p style="margin:0"><a href="${unsubUrl}" style="color:#b45309;text-decoration:underline;">Unsubscribe from marketing emails</a></p>
      </div>
    `;

    const res = await sendEmail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html + footerHtml,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (res && (res as any).error) {
      return { success: false, error: String((res as any).error) };
    }

    return { success: true, skipped: Boolean((res as any)?.skipped) };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function dispatchReturnRequestedEmail(
  returnRequestId: any,
  to: string,
  name: string,
  orderNum: string,
  items: Array<{ name: string; qty: number }>
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!returnRequestId || !to) return { success: false, reason: 'missing_args' };
  const { ReturnRequest } = await import('../models/ReturnRequest');
  const now = new Date();
  const locked = await ReturnRequest.findOneAndUpdate(
    { _id: returnRequestId, requestEmailSentAt: null },
    { $set: { requestEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: 'already_sent' };
  try {
    const built = tpl.returnRequested(name, orderNum, items);
    await sendEmail({ to, subject: built.subject, html: built.html });
    return { success: true };
  } catch (err: any) {
    await ReturnRequest.findByIdAndUpdate(returnRequestId, { $set: { requestEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchReturnApprovedEmail(
  returnRequestId: any,
  to: string,
  name: string,
  orderNum: string,
  resolution: string,
  items: Array<{ name: string; qty: number }>
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!returnRequestId || !to) return { success: false, reason: 'missing_args' };
  const { ReturnRequest } = await import('../models/ReturnRequest');
  const now = new Date();
  const locked = await ReturnRequest.findOneAndUpdate(
    { _id: returnRequestId, approvedEmailSentAt: null },
    { $set: { approvedEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: 'already_sent' };
  try {
    const built = tpl.returnApproved(name, orderNum, resolution, items);
    await sendEmail({ to, subject: built.subject, html: built.html });
    return { success: true };
  } catch (err: any) {
    await ReturnRequest.findByIdAndUpdate(returnRequestId, { $set: { approvedEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchReturnRejectedEmail(
  returnRequestId: any,
  to: string,
  name: string,
  orderNum: string,
  reason: string
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!returnRequestId || !to) return { success: false, reason: 'missing_args' };
  const { ReturnRequest } = await import('../models/ReturnRequest');
  const now = new Date();
  const locked = await ReturnRequest.findOneAndUpdate(
    { _id: returnRequestId, rejectedEmailSentAt: null },
    { $set: { rejectedEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: 'already_sent' };
  try {
    const built = tpl.returnRejected(name, orderNum, reason);
    await sendEmail({ to, subject: built.subject, html: built.html });
    return { success: true };
  } catch (err: any) {
    await ReturnRequest.findByIdAndUpdate(returnRequestId, { $set: { rejectedEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchReturnRefundedEmail(
  returnRequestId: any,
  to: string,
  name: string,
  orderNum: string,
  amount: number,
  method: string,
  upiRef?: string
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!returnRequestId || !to) return { success: false, reason: 'missing_args' };
  const { ReturnRequest } = await import('../models/ReturnRequest');
  const now = new Date();
  const locked = await ReturnRequest.findOneAndUpdate(
    { _id: returnRequestId, refundedEmailSentAt: null },
    { $set: { refundedEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: 'already_sent' };
  try {
    const built = tpl.returnRefunded(name, orderNum, amount, method, upiRef);
    await sendEmail({ to, subject: built.subject, html: built.html });
    return { success: true };
  } catch (err: any) {
    await ReturnRequest.findByIdAndUpdate(returnRequestId, { $set: { refundedEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchTicketCreatedEmail(
  ticketId: any,
  to: string,
  name: string,
  ticketNo: string,
  subject: string,
  category: string,
  orderNo?: number | null
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!ticketId || !to) return { success: false, reason: "missing_args" };
  const { SupportTicket } = await import("../models/SupportTicket");
  const now = new Date();
  const locked = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, createdEmailSentAt: null },
    { $set: { createdEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: "already_sent" };
  try {
    const built = tpl.ticketCreated(name, ticketNo, subject, category, orderNo);
    await sendEmail({ to, subject: built.subject, html: built.html, bcc: SUPPORT_EMAIL_BCC });
    return { success: true };
  } catch (err: any) {
    await SupportTicket.findByIdAndUpdate(ticketId, { $set: { createdEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchTicketAdminReplyEmail(
  to: string,
  name: string,
  ticketNo: string,
  subject: string,
  replyMessage: string,
  isWaitingForCustomer = false
): Promise<{ success: boolean; reason?: string }> {
  if (!to) return { success: false, reason: "missing_to" };
  try {
    const built = isWaitingForCustomer
      ? tpl.ticketWaitingForCustomer(name, ticketNo, subject, replyMessage)
      : tpl.ticketAdminReply(name, ticketNo, subject, replyMessage);
    await sendEmail({ to, subject: built.subject, html: built.html, bcc: SUPPORT_EMAIL_BCC });
    return { success: true };
  } catch (err: any) {
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchTicketResolvedEmail(
  ticketId: any,
  to: string,
  name: string,
  ticketNo: string,
  subject: string,
  resolutionNote?: string
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!ticketId || !to) return { success: false, reason: "missing_args" };
  const { SupportTicket } = await import("../models/SupportTicket");
  const now = new Date();
  const locked = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, resolvedEmailSentAt: null },
    { $set: { resolvedEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: "already_sent" };
  try {
    const built = tpl.ticketResolved(name, ticketNo, subject, resolutionNote);
    await sendEmail({ to, subject: built.subject, html: built.html, bcc: SUPPORT_EMAIL_BCC });
    return { success: true };
  } catch (err: any) {
    await SupportTicket.findByIdAndUpdate(ticketId, { $set: { resolvedEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchTicketClosedEmail(
  ticketId: any,
  to: string,
  name: string,
  ticketNo: string,
  subject: string
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  if (!ticketId || !to) return { success: false, reason: "missing_args" };
  const { SupportTicket } = await import("../models/SupportTicket");
  const now = new Date();
  const locked = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, closedEmailSentAt: null },
    { $set: { closedEmailSentAt: now } },
    { new: true }
  );
  if (!locked) return { success: false, skipped: true, reason: "already_sent" };
  try {
    const built = tpl.ticketClosed(name, ticketNo, subject);
    await sendEmail({ to, subject: built.subject, html: built.html, bcc: SUPPORT_EMAIL_BCC });
    return { success: true };
  } catch (err: any) {
    await SupportTicket.findByIdAndUpdate(ticketId, { $set: { closedEmailSentAt: null } });
    return { success: false, reason: err?.message || String(err) };
  }
}

export async function dispatchTicketReopenedEmail(
  to: string,
  name: string,
  ticketNo: string,
  subject: string
): Promise<{ success: boolean; reason?: string }> {
  if (!to) return { success: false, reason: "missing_to" };
  try {
    const built = tpl.ticketReopened(name, ticketNo, subject);
    await sendEmail({ to, subject: built.subject, html: built.html, bcc: SUPPORT_EMAIL_BCC });
    return { success: true };
  } catch (err: any) {
    return { success: false, reason: err?.message || String(err) };
  }
}
