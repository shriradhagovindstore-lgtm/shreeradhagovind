import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import {
  displayOrderNumber,
  useStore,
  formatINR,
  type Order,
  type NormalizedTrackingData,
} from "@/lib/store";
import {
  Check,
  Package,
  Truck,
  Home,
  CreditCard,
  Phone,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  MessageCircle,
  RefreshCw,
  ExternalLink,
  MapPin,
  Copy,
  Star,
  LifeBuoy,
  X as XIcon,
} from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { api, isApiEnabled, getToken, API_URL } from "@/lib/api";
import { slugify } from "@/lib/seo";
import { toast } from "sonner";
import { CustomerReturnsSection } from "@/components/returns/CustomerReturnsSection";

type Search = { token?: string; invoiceToken?: string };

export const Route = createFileRoute("/orders/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    token: typeof s.token === "string" ? s.token : undefined,
    invoiceToken: typeof s.invoiceToken === "string" ? s.invoiceToken : undefined,
  }),
  component: OrderDetail,
  head: () => ({
    meta: [
      { title: "Order Details - Shri Radha Govind Store" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const MAIN_STAGES: Order["status"][] = [
  "Placed",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for delivery",
  "Delivered",
];

function OrderDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const { orders } = useStore();
  const [liveOrder, setLiveOrder] = useState<Order | null>(null);
  const [liveTracking, setLiveTracking] = useState<NormalizedTrackingData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewingProduct, setReviewingProduct] = useState<any | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("Changed my mind");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [requestingInvoice, setRequestingInvoice] = useState(false);

  const submitProductReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingProduct) return;
    if (reviewComment.trim().length < 3) {
      toast.error("Please provide a short review comment (at least 3 characters)");
      return;
    }
    setSubmittingReview(true);
    try {
      await api("/reviews", {
        method: "POST",
        body: {
          orderId: id,
          productId: reviewingProduct.id,
          rating: reviewRating,
          comment: reviewComment.trim(),
          guestAccessToken: search.token || undefined,
        },
      });
      toast.success("Hare Krishna! Your review has been submitted for moderation and will appear publicly once approved.");
      setReviewingProduct(null);
      setReviewComment("");
      setReviewRating(5);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const initialOrder = orders.find((o) => o.id === id);

  const fetchLiveOrder = useCallback(async () => {
    if (!isApiEnabled()) return;
    try {
      setIsRefreshing(true);
      const url = search.token ? `/orders/${id}?token=${encodeURIComponent(search.token)}` : `/orders/${id}`;
      const res = await api<{ order: any; tracking?: NormalizedTrackingData }>(url);
      if (res?.tracking) {
        setLiveTracking(res.tracking);
      }
      if (res?.order) {
        const o = res.order;
        setLiveOrder({
          id: o._id,
          orderNo: o.orderNo,
          customerEmail: o.customerEmail,
          guestAccessToken: o.guestAccessToken,
          trackingId: o.trackingId,
          courier: o.courier,
          courierTrackingUrl: o.courierTrackingUrl,
          items: o.items.map((it: any) => ({
            product: {
              id: it.productId,
              name: it.name,
              image: it.image,
              price: it.price,
              slug: "",
              category: "",
              description: "",
              features: [],
              inStock: true,
              rating: 5,
              reviewsCount: 1,
            },
            qty: it.qty,
            price: it.price,
          })),
          subtotal: o.subtotal,
          shipping: o.shipping,
          total: o.total,
          needsGstInvoice: o.needsGstInvoice,
          businessName: o.businessName,
          gstin: o.gstin,
          address: o.address,
          billingAddress: o.billingAddress,
          payment: o.payment,
          status: o.status,
          holdReason: o.holdReason,
          holdAt: o.holdAt,
          cancellationReason: o.cancellationReason,
          cancelledBy: o.cancelledBy,
          cancelledAt: o.cancelledAt,
          deliveredAt: o.deliveredAt,
          invoiceRequest: o.invoiceRequest,
          invoiceSentToCustomerAt: o.invoiceSentToCustomerAt,
          statusHistory: o.statusHistory,
          refund: o.refund,
          refundedAmount: o.refundedAmount,
          courierTrackingData: o.courierTrackingData || res?.tracking || null,
          createdAt: new Date(o.createdAt).getTime(),
        });
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  }, [id, search.token]);

  useEffect(() => {
    fetchLiveOrder();
  }, [fetchLiveOrder]);

  // Live polling every 20s
  useEffect(() => {
    const active = liveOrder || initialOrder;
    if (!active) return;
    if (active.status === "Delivered" || active.status === "Cancelled") return;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchLiveOrder();
      }
    }, 20000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchLiveOrder();
      }
    };

    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [liveOrder, initialOrder, fetchLiveOrder]);

  const order = liveOrder || initialOrder;

  const handleDownloadInvoice = async () => {
    if (!order) return;
    try {
      setDownloadingInvoice(true);
      const token = getToken();
      const guestToken = search.token || (order as any).guestAccessToken;
      const queryParams = new URLSearchParams();
      if (guestToken) queryParams.set("token", guestToken);
      if (search.invoiceToken) queryParams.set("invoiceToken", search.invoiceToken);
      const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const targetId = order.id || id;
      const res = await fetch(`${API_URL}/orders/${targetId}/invoice${queryStr}`, {
        headers,
      });

      if (!res.ok) {
        if (res.status === 410) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.message || json?.error || "This invoice download link has expired or has already been used.");
        }
        if (res.status === 400) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.message || json?.error || "Invoice is not available for this order.");
        }
        if (res.status === 403) {
          throw new Error("Unable to download invoice: Access forbidden. Please ensure you are logged in or using the link from your email.");
        }
        if (res.status === 404) {
          throw new Error("Invoice not found for this order.");
        }
        throw new Error(`Failed to download invoice (${res.status})`);
      }

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const json = await res.json();
        throw new Error(json.error || json.message || "Failed to generate invoice PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const orderNum = displayOrderNumber(order);
      a.href = url;
      a.download = `Invoice-${orderNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Invoice for Order #${orderNum} downloaded successfully`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download invoice");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const handleRequestInvoice = async () => {
    if (!order) return;
    try {
      setRequestingInvoice(true);
      const guestToken = search.token || (order as any).guestAccessToken;
      const targetId = order.id || id;
      const res = await api<{ ok: boolean; message?: string; order?: any }>(`/orders/${targetId}/request-invoice`, {
        method: "POST",
        body: {
          token: guestToken || undefined,
        },
      });
      toast.success(res?.message || "Invoice request submitted successfully. Our team will review and send your invoice shortly.");
      await fetchLiveOrder();
    } catch (err: any) {
      toast.error(err?.message || "Failed to request invoice");
    } finally {
      setRequestingInvoice(false);
    }
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (cancelReason === "Other" && !customCancelReason.trim()) {
      toast.error("Please provide a reason for cancellation");
      return;
    }

    try {
      setCancellingOrder(true);
      const guestToken = search.token || (order as any).guestAccessToken;
      const targetId = order.id || id;
      const res = await api<{ ok: boolean; order: any; message?: string }>(`/orders/${targetId}/cancel`, {
        method: "POST",
        body: {
          reason: cancelReason,
          customReason: customCancelReason.trim(),
          token: guestToken || undefined,
        },
      });

      toast.success(res?.message || "Order has been cancelled successfully.");
      setShowCancelModal(false);
      setCustomCancelReason("");
      setCancelReason("Changed my mind");

      await fetchLiveOrder();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel order");
    } finally {
      setCancellingOrder(false);
    }
  };

  if (!order) {
    return (
      <Layout>
        <div className="container py-20 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4 text-stone-400">
            <Package className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-2xl text-stone-900">Order not found</h1>
          <p className="text-stone-500 text-sm mt-2">
            We couldn't find details for this order. It might have been placed as a guest or on another device.
          </p>
          <Link
            to="/orders"
            className="inline-block mt-6 px-6 py-2.5 rounded-full bg-[#166F77] text-white text-sm font-semibold hover:bg-[#125B62] transition shadow-sm"
          >
            View Your Orders
          </Link>
        </div>
      </Layout>
    );
  }

  const currentIdx = MAIN_STAGES.indexOf(order.status);
  const isHold = order.status === "Hold";
  const isCancelled = order.status === "Cancelled";
  const isCancellable = Boolean(order && ["Placed", "Confirmed"].includes(order.status));

  const isDelivered = order.status === "Delivered";
  const deliveredTimeMs = useMemo(() => {
    if (!order) return null;
    if (order.deliveredAt) return new Date(order.deliveredAt).getTime();
    if (Array.isArray(order.statusHistory)) {
      const deliveredEntry = order.statusHistory.find((h: any) => h.status === "Delivered");
      if (deliveredEntry?.changedAt) return new Date(deliveredEntry.changedAt).getTime();
    }
    return null;
  }, [order]);

  const isDeliveryExpired = useMemo(() => {
    if (!isDelivered || !deliveredTimeMs) return false;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - deliveredTimeMs > SEVEN_DAYS_MS;
  }, [isDelivered, deliveredTimeMs]);

  const isPreDeliveredEligible = Boolean(
    order &&
      ["Confirmed", "Processing", "Hold", "Packed", "Shipped", "Out for delivery"].includes(
        order.status
      )
  );

  const hasOneTimeInvoiceToken = Boolean(search.invoiceToken);

  const canDownloadInvoiceDirectly = Boolean(
    isPreDeliveredEligible || (isDelivered && !isDeliveryExpired)
  );

  const canDownloadWithOneTimeToken = Boolean(
    isDelivered && isDeliveryExpired && hasOneTimeInvoiceToken
  );

  const invoiceRequestStatus = order.invoiceRequest?.status;

  // Derived courier tracking data — prefer live state over cached order data
  const tracking: NormalizedTrackingData | null =
    liveTracking || (order.courierTrackingData as NormalizedTrackingData | null) || null;
  const hasShipment = Boolean(order.trackingId && order.courier);

  return (
    <Layout>
      <div className="bg-[#FAF8F5] border-b border-stone-200/80 py-3 sm:py-4">
        <div className="w-full max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <Link to="/orders" className="text-xs sm:text-sm font-medium text-stone-500 hover:text-[#166F77] transition inline-flex items-center gap-1">
            ← Back to orders
          </Link>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-12 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 mt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-stone-900 font-bold tracking-tight">
                Order #{displayOrderNumber(order)}
              </h1>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-2xs ${
                  order.status === "Delivered"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : order.status === "Cancelled"
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : order.status === "Hold"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-teal-50 text-teal-800 border border-teal-200"
                }`}
              >
                {order.status}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-500">
              Placed on {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:items-center gap-2.5 w-full sm:w-auto pt-1 sm:pt-0">
            {isCancellable && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-rose-300 hover:border-rose-500 text-rose-700 hover:bg-rose-50/70 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition bg-white shadow-xs cursor-pointer active:scale-[0.98] w-full sm:w-auto"
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                Cancel Order
              </button>
            )}
            {isApiEnabled() && (canDownloadInvoiceDirectly || canDownloadWithOneTimeToken) && (
              <button
                type="button"
                onClick={handleDownloadInvoice}
                disabled={downloadingInvoice}
                className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-stone-300 hover:border-[#166F77] text-stone-700 hover:text-[#166F77] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition bg-white shadow-xs disabled:opacity-60 cursor-pointer active:scale-[0.98] w-full sm:w-auto"
              >
                {downloadingInvoice ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#166F77]" />
                ) : (
                  <FileText className="w-4 h-4 text-[#166F77]" />
                )}
                {downloadingInvoice
                  ? "Downloading..."
                  : canDownloadWithOneTimeToken
                  ? "Download Requested Invoice"
                  : "Download Invoice PDF"}
              </button>
            )}
            {isApiEnabled() && isDelivered && isDeliveryExpired && !hasOneTimeInvoiceToken && (
              invoiceRequestStatus === "pending" ? (
                <div
                  className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs select-none w-full sm:w-auto"
                  title="Your invoice request is currently under review by our support team."
                >
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Invoice Request Pending</span>
                </div>
              ) : invoiceRequestStatus === "fulfilled" ? (
                <div
                  className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs select-none w-full sm:w-auto"
                  title="The invoice has been sent to your email with a single-use download link."
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Invoice Sent to Email</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestInvoice}
                  disabled={requestingInvoice}
                  className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-stone-300 hover:border-[#166F77] bg-white hover:bg-stone-50 text-stone-800 hover:text-[#166F77] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition shadow-xs disabled:opacity-60 cursor-pointer active:scale-[0.98] w-full sm:w-auto"
                  title="Direct 7-day download has expired. Request an invoice to receive it by email and WhatsApp."
                >
                  {requestingInvoice ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#166F77]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#166F77]" />
                  )}
                  {requestingInvoice ? "Requesting..." : "Request Invoice"}
                </button>
              )
            )}
            <Link
              to="/track"
              search={{ id: order.trackingId || displayOrderNumber(order) } as never}
              className="h-11 sm:h-10 px-5 rounded-xl sm:rounded-full bg-[#166F77] hover:bg-[#125B62] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition shadow-xs active:scale-[0.98] w-full sm:w-auto"
            >
              Public Tracker <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/support"
              search={{
                tab: "submit",
                orderId: order.id,
                orderNo: String(displayOrderNumber(order)),
                category: "ORDER_TRACKING",
              } as never}
              className="h-11 sm:h-10 px-4 rounded-xl sm:rounded-full border border-stone-300 hover:border-[#166F77] bg-white hover:bg-stone-50 text-stone-700 hover:text-[#166F77] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition shadow-xs active:scale-[0.98] w-full sm:w-auto"
            >
              <LifeBuoy className="w-4 h-4 text-[#166F77]" />
              Need Help?
            </Link>
          </div>
        </div>

        {/* Shipment Details Bar */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-5 mt-4 sm:mt-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-3.5">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Shipment & Tracking
            </p>
            {order.trackingId ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 font-mono text-xs sm:text-sm font-bold max-w-full truncate">
                <span className="truncate">AWB: {order.trackingId}</span>
              </div>
            ) : (
              <p className="text-xs text-stone-500 italic">
                Tracking ID will be assigned by warehouse team once packed & handed to courier.
              </p>
            )}
            {order.courier && (
              <p className="text-xs text-stone-600 pt-0.5">
                Courier Partner: <span className="font-semibold text-stone-900">{order.courier}</span>
              </p>
            )}
          </div>
          {order.courierTrackingUrl && (
            <a
              href={order.courierTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="h-11 sm:h-9 px-4 rounded-xl sm:rounded-full border border-[#166F77] text-[#166F77] hover:bg-[#166F77]/10 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition w-full sm:w-auto shrink-0"
            >
              Track on {order.courier || "Courier"} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Hold Alert Banner */}
        {isHold && (
          <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-900 space-y-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-amber-950">
                  Your Order is on Temporary Hold
                </p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  <span className="font-semibold">Hold Reason:</span>{" "}
                  {order.holdReason || "Order details or warehouse verification is currently in progress."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href="https://wa.me/917500533505?text=Hare%20Krishna!%20Inquiry%20regarding%20Order%20Hold%20status"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-xs w-full sm:w-auto"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Chat on WhatsApp
                  </a>
                  <a
                    href="tel:+917500533505"
                    className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-8 px-3.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition shadow-xs w-full sm:w-auto"
                  >
                    <Phone className="w-3.5 h-3.5 text-amber-700" /> Call Support
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-red-900">This Order Has Been Cancelled</p>
              {order.cancellationReason && (
                <p className="text-xs text-red-800 mt-1">
                  <span className="font-semibold">Reason:</span> {order.cancellationReason}
                </p>
              )}
              <p className="text-xs text-red-700 mt-1">
                For assistance, please contact{" "}
                <a href="mailto:support@shriradhagovindstore.com" className="font-semibold underline hover:text-red-950">
                  support@shriradhagovindstore.com
                </a>.
              </p>

              {/* Online Payment Refund Status for Customer */}
              {order.payment?.method === "razorpay" && (
                <>
                  {order.payment?.status === "refunded" ? (
                    <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-950">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Refund Processed ({formatINR(order.refund?.amount || order.refundedAmount || order.total)})</span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Your refund of <span className="font-semibold">{formatINR(order.refund?.amount || order.refundedAmount || order.total)}</span> has been successfully processed via UPI.
                      </p>
                      {order.refund?.upiReference && (
                        <div className="pt-1 border-t border-emerald-200/60 font-mono text-[11px] text-emerald-900">
                          UPI Reference: <span className="font-bold">{order.refund.upiReference}</span>
                        </div>
                      )}
                      {order.refund?.refundedAt && (
                        <div className="text-[10px] text-emerald-700">
                          Processed on {new Date(order.refund.refundedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      )}
                    </div>
                  ) : order.payment?.status === "paid" ? (
                    <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-950">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Refund Pending ({formatINR(order.total)})</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        We have received your cancellation. Your refund of <span className="font-semibold">{formatINR(order.total)}</span> via UPI is currently being processed by our Vrindavan seva team. You will receive an email confirmation with the UPI reference number once completed.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}

        {/* Stepper Card */}
        {!isCancelled && (
          <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-6 sm:p-8 border border-stone-200 shadow-xs mt-4 sm:mt-5">
            <h2 className="font-serif text-lg sm:text-xl text-stone-900 font-bold mb-4 sm:mb-5">Track your order</h2>

            {/* Delivered Celebration Notice */}
            {order.status === "Delivered" && (
              <div className="mb-5 sm:mb-6 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50 border border-emerald-200/80 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-3.5 shadow-xs">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white grid place-items-center shrink-0 shadow-md shadow-emerald-600/20">
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm text-emerald-950">
                      Sacred Order Successfully Delivered
                    </p>
                    <span className="inline-flex items-center text-[11px] font-medium text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      Sri Vrindavan Dham
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800/90 mt-0.5 leading-relaxed">
                    Your package has safely arrived with divine blessings. May Thakur Ji & Sri Radha Rani bless your home with peace, joy, and devotion.
                  </p>
                </div>
              </div>
            )}

            {/* Desktop Stepper */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 relative">
                {MAIN_STAGES.map((s, i) => {
                  const isDelivered = s === "Delivered" && currentIdx >= i;
                  const isCompleted = currentIdx > i || isDelivered;
                  const isCurrent = currentIdx === i && !isHold && !isDelivered;
                  const isPastOrCurrent = currentIdx >= i;
                  const hasConnector = i < MAIN_STAGES.length - 1;

                  // Connector fill calculation from stage i to stage i+1 (NO connector exists after Delivered)
                  const isConnectorCompleted = currentIdx > i;
                  const isConnectorActive = currentIdx === i && !isHold;

                  return (
                    <div key={s} className="relative flex flex-col items-center text-center group">
                      {/* Segmented Connector line to NEXT stage (strictly i < length - 1, NEVER after Delivered) */}
                      {hasConnector && (
                        <div className="absolute top-5 left-1/2 w-full h-1.5 bg-stone-100 rounded-full z-0 overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              isConnectorCompleted
                                ? "w-full bg-gradient-to-r from-[#166F77] via-teal-500 to-[#166F77]"
                                : isConnectorActive
                                ? "w-1/2 bg-gradient-to-r from-[#166F77] to-teal-400 animate-pulse"
                                : isHold && i === MAIN_STAGES.indexOf("Processing")
                                ? "w-1/2 bg-amber-400 animate-pulse"
                                : "w-0"
                            }`}
                          />
                        </div>
                      )}

                      {/* Node Circle */}
                      <div
                        className={`relative z-10 h-10 w-10 rounded-full grid place-items-center transition-all duration-500 ${
                          isDelivered
                            ? "bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-emerald-100 font-bold"
                            : isCompleted
                            ? "bg-[#166F77] text-white shadow-md shadow-[#166F77]/20 ring-4 ring-teal-50"
                            : isCurrent
                            ? "bg-white border-2 border-[#166F77] text-[#166F77] ring-4 ring-[#166F77]/25 shadow-lg font-bold"
                            : "bg-stone-50 border border-stone-200 text-stone-400"
                        }`}
                      >
                        {isDelivered ? (
                          <Check className="h-5 w-5 stroke-[3] text-white motion-safe:animate-scale-in" />
                        ) : isCompleted ? (
                          <Check className="h-4 w-4 stroke-[3] motion-safe:animate-scale-in" />
                        ) : isCurrent ? (
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#166F77] opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#166F77]" />
                          </span>
                        ) : (
                          <span className="text-xs font-semibold">{i + 1}</span>
                        )}
                      </div>

                      {/* Stage Label */}
                      <p
                        className={`text-xs mt-2.5 px-1 leading-tight transition-colors ${
                          isDelivered
                            ? "text-emerald-800 font-bold"
                            : isCurrent
                            ? "text-[#166F77] font-bold"
                            : isPastOrCurrent
                            ? "text-stone-900 font-semibold"
                            : "text-stone-400 font-normal"
                        }`}
                      >
                        {s}
                      </p>

                      {/* Status Micro-badge */}
                      {isDelivered && (
                        <span className="mt-1 inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shadow-xs">
                          Blessed
                        </span>
                      )}
                      {isCurrent && (
                        <span className="mt-1 text-[10px] font-semibold text-[#166F77] bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                          In Progress
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Stepper (Vertical Timeline) */}
            <div className="md:hidden mt-2 space-y-0">
              {MAIN_STAGES.map((s, i) => {
                const isDelivered = s === "Delivered" && currentIdx >= i;
                const isCompleted = currentIdx > i || isDelivered;
                const isCurrent = currentIdx === i && !isHold && !isDelivered;
                const isPastOrCurrent = currentIdx >= i;
                const isLast = i === MAIN_STAGES.length - 1;

                return (
                  <div key={s} className="relative flex items-start gap-3.5 pb-5 last:pb-1">
                    {/* Vertical Connector Line (strictly !isLast, NEVER after Delivered) */}
                    {!isLast && (
                      <div
                        className={`absolute left-[15px] top-8 bottom-0 w-0.5 transition-colors duration-500 ${
                          currentIdx > i
                            ? "bg-[#166F77]"
                            : currentIdx === i && !isHold
                            ? "bg-gradient-to-b from-[#166F77] to-stone-200"
                            : "bg-stone-200"
                        }`}
                      />
                    )}

                    {/* Node Circle */}
                    <div
                      className={`relative z-10 h-8 w-8 rounded-full grid place-items-center shrink-0 text-xs font-semibold transition-all duration-300 ${
                        isDelivered
                          ? "bg-gradient-to-br from-emerald-600 to-[#166F77] text-white ring-4 ring-emerald-100 shadow-sm"
                          : isCompleted
                          ? "bg-[#166F77] text-white shadow-sm ring-2 ring-teal-50"
                          : isCurrent
                          ? "bg-white border-2 border-[#166F77] text-[#166F77] ring-4 ring-[#166F77]/20 font-bold"
                          : "bg-stone-50 text-stone-400 border border-stone-200"
                      }`}
                    >
                      {isDelivered ? (
                        <Check className="h-4 w-4 stroke-[3] text-white" />
                      ) : isCompleted ? (
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      ) : isCurrent ? (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#166F77] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#166F77]" />
                        </span>
                      ) : (
                        i + 1
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-sm ${
                            isDelivered
                              ? "text-emerald-800 font-bold"
                              : isCurrent
                              ? "text-[#166F77] font-bold"
                              : isPastOrCurrent
                              ? "text-stone-900 font-semibold"
                              : "text-stone-400"
                          }`}
                        >
                          {s}
                        </p>
                        {isDelivered && (
                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                            Delivered
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#166F77] bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                            Active Stage
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Shipment Tracking Card */}
        {hasShipment && (
          <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-6 sm:p-8 border border-stone-200 shadow-xs mt-4 sm:mt-5 space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3.5 sm:pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="font-serif text-lg sm:text-xl text-stone-900 font-bold">Live Shipment Tracking</h2>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Real-time package status and courier updates for your order.
                </p>
              </div>

              {order.courierTrackingUrl && (
                <a
                  href={order.courierTrackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-xl sm:rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs sm:text-sm font-semibold transition shadow-xs w-full sm:w-auto"
                >
                  <span>Official {order.courier || "Courier"} Tracker</span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-500" />
                </a>
              )}
            </div>

            {/* Shipment Meta Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-stone-50/90 p-3 sm:p-4 rounded-xl border border-stone-200/80 text-xs">
              <div className="min-w-0">
                <p className="text-stone-400 font-medium uppercase tracking-wider text-[10px]">Courier Partner</p>
                <p className="font-bold text-stone-900 mt-0.5 text-xs sm:text-sm truncate">{order.courier || "Assigned Partner"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-stone-400 font-medium uppercase tracking-wider text-[10px]">AWB / Tracking No.</p>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className="font-mono font-bold text-stone-900 text-xs sm:text-sm truncate">{order.trackingId || "Pending"}</span>
                  {order.trackingId && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(order.trackingId!);
                        toast.success("AWB Number copied to clipboard");
                      }}
                      className="text-stone-400 hover:text-stone-700 p-1 rounded shrink-0 hover:bg-stone-200/60 transition"
                      title="Copy AWB Number"
                      aria-label="Copy AWB Number"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-stone-400 font-medium uppercase tracking-wider text-[10px]">Courier Live Status</p>
                <p className="font-bold text-[#166F77] mt-0.5 text-xs sm:text-sm truncate">
                  {tracking?.latestStatus || (tracking?.hasCarrierScans ? "In Transit" : "Awaiting Carrier Scan")}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-stone-400 font-medium uppercase tracking-wider text-[10px]">Expected Delivery</p>
                <p className="font-semibold text-stone-800 mt-0.5 text-xs sm:text-sm truncate">
                  {tracking?.expectedDeliveryDate
                    ? new Date(tracking.expectedDeliveryDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Standard Delivery (3-5 Days)"}
                </p>
              </div>
            </div>

            {/* Route & Latest Update Card */}
            <div className="p-3.5 sm:p-4 rounded-xl border border-teal-100 bg-teal-50/40 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-stone-700">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="w-4 h-4 text-[#166F77] shrink-0" />
                  {tracking?.origin ? (
                    <span>
                      <span className="font-semibold text-stone-900">{tracking.origin}</span>
                      {" → "}
                      <span className="font-semibold text-stone-900">
                        {tracking.destination || `${order.address.city}, ${order.address.state}`}
                      </span>
                    </span>
                  ) : (
                    <span>
                      <span className="text-stone-500 font-normal">Delivery Destination: </span>
                      <span className="font-semibold text-stone-900">
                        {order.address.city ? `${order.address.city}, ${order.address.state}` : (tracking?.destination || "Destination")}
                      </span>
                    </span>
                  )}
                </div>
                {tracking?.lastUpdated && (
                  <span className="text-[11px] text-stone-500 font-mono">
                    Provider Checked: {new Date(tracking.lastUpdated).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </span>
                )}
              </div>

              {/* Carrier Movement / Scan Status */}
              <div className="pt-2 border-t border-teal-100/80 text-stone-800 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-semibold text-[#166F77]">Carrier Scan Status: </span>
                  {tracking?.hasCarrierScans && (tracking.latestMessage || tracking.checkpoints?.length) ? (
                    <span className="font-semibold text-stone-900">
                      {tracking.latestMessage || "In Transit"}
                      {tracking.lastCarrierScanAt && (
                        <span className="text-stone-500 font-normal text-[11px] ml-1">
                          ({new Date(tracking.lastCarrierScanAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-medium text-amber-800 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded text-[11px]">
                      Awaiting Carrier Scan (No physical scan recorded yet)
                    </span>
                  )}
                </div>

                {tracking?.hasCarrierScans && tracking?.currentLocation && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-700 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-[#166F77] shrink-0" />
                    <span>
                      Location: <span className="font-bold text-stone-900">{tracking.currentLocation}</span>
                    </span>
                  </div>
                )}

                {!tracking?.hasCarrierScans && (
                  <p className="text-stone-600 leading-relaxed text-[11px]">
                    Consignment booked with {order.courier || "courier partner"}. No physical hub scans or movement updates have been received from the carrier yet. Live transit checkpoints will update automatically once scanned at the origin sorting facility.
                  </p>
                )}
              </div>
            </div>

            {/* Tracking Checkpoints History */}
            {tracking?.checkpoints && tracking.checkpoints.length > 0 ? (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#166F77]" /> Shipment Activity History ({tracking.checkpoints.length})
                </h3>
                <ol className="relative border-l border-stone-200 ml-3 space-y-4">
                  {[...tracking.checkpoints].reverse().map((cp, idx) => (
                    <li key={`${cp.time}-${idx}`} className="ml-5 relative">
                      <span
                        className={`absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          idx === 0
                            ? "bg-[#166F77] ring-4 ring-teal-100"
                            : "bg-stone-300"
                        }`}
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                        <p className={`font-semibold ${idx === 0 ? "text-stone-900" : "text-stone-700"}`}>
                          {cp.description}
                        </p>
                        <time className="text-[11px] text-stone-400 shrink-0">
                          {new Date(cp.time).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </time>
                      </div>
                      {cp.location && (
                        <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-stone-400" /> {cp.location}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="p-4 bg-stone-50 rounded-xl text-stone-600 text-xs leading-relaxed border border-stone-200/70 space-y-1">
                <p className="font-semibold text-stone-800">
                  Consignment booked with {order.courier || "courier partner"}.
                </p>
                <p className="text-stone-500">
                  Live transit checkpoints and hub scans will appear here automatically once the package is scanned at the carrier's sorting facility.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Details Grid */}
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 sm:gap-6 mt-4 sm:mt-5">
          {/* Left Column: Ordered Items & Returns */}
          <div className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-6 border border-stone-200 shadow-xs">
              <h2 className="font-serif text-base sm:text-lg font-bold text-stone-900 mb-3.5 sm:mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-[#166F77]" /> Ordered Items ({order.items.length})
            </h2>
            <div className="space-y-3.5 sm:space-y-4 divide-y divide-stone-100">
              {order.items.map((i, idx) => {
                const productTarget =
                  i.product.slug ||
                  (i.product.name ? slugify(i.product.name) : "") ||
                  i.product.id ||
                  "";

                return (
                  <div key={i.product.id || idx} className="pt-3.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {productTarget ? (
                      <Link
                        to="/product/$id"
                        params={{ id: productTarget }}
                        className="group flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0"
                      >
                        <div className="h-16 w-16 sm:h-18 sm:w-18 rounded-xl overflow-hidden bg-stone-100 border border-stone-200 shrink-0 group-hover:border-[#166F77]/30 transition-colors">
                          <img
                            src={i.product.image}
                            alt={i.product.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm text-stone-900 group-hover:text-[#166F77] truncate transition-colors">
                              {i.product.name}
                            </p>
                            <ExternalLink className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 group-hover:text-[#166F77] transition-all shrink-0 hidden sm:inline" />
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Qty: <strong className="text-stone-800">{i.qty}</strong> × {formatINR(i.product.price)}
                          </p>
                          <span className="text-[11px] text-[#166F77] font-medium hidden sm:inline-block">
                            View product →
                          </span>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0">
                        <div className="h-16 w-16 sm:h-18 sm:w-18 rounded-xl overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
                          <img src={i.product.image} alt={i.product.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-stone-900 truncate">{i.product.name}</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Qty: <strong className="text-stone-800">{i.qty}</strong> × {formatINR(i.product.price)}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100 shrink-0">
                      <span className="font-semibold text-sm sm:text-base text-stone-900">
                        {formatINR(i.product.price * i.qty)}
                      </span>
                      {order.status === "Delivered" && (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingProduct(i.product);
                            setReviewRating(5);
                            setReviewComment("");
                          }}
                          className="min-h-[38px] sm:min-h-0 sm:h-8 px-3 rounded-xl sm:rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-[#166F77] hover:text-[#125B62] inline-flex items-center gap-1.5 text-xs font-semibold transition shadow-2xs"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                          Write a Review
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Returns & Refund Section */}
          <CustomerReturnsSection
            order={order}
            guestToken={search.token}
            onReturnCreated={fetchLiveOrder}
          />
        </div>

          {/* Shipping & Payment Summary */}
          <aside className="space-y-4 sm:space-y-6">
            <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-stone-200 shadow-xs">
              <h3 className="font-serif text-base font-bold text-stone-900 mb-2.5 sm:mb-3 flex items-center gap-2">
                <Home className="h-4 w-4 text-[#166F77]" /> Shipping Address
              </h3>
              <p className="text-sm font-semibold text-stone-900">{order.address.name}</p>
              {order.businessName && (
                <p className="text-xs font-semibold text-stone-700 mt-0.5">
                  Business: {order.businessName}
                </p>
              )}
              {order.gstin && (
                <p className="text-xs font-mono font-medium text-stone-500 mt-0.5">
                  GSTIN: {order.gstin}
                </p>
              )}
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                {[order.address.line1, order.address.line2, order.address.city, order.address.state]
                  .filter(Boolean)
                  .join(", ")}{" "}
                <span className="font-semibold">{order.address.pincode}</span>
              </p>
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-stone-600">
                <Phone className="h-3.5 w-3.5 text-stone-400 shrink-0" /> Phone:{" "}
                <a href={`tel:${order.address.phone}`} className="font-medium text-[#166F77] hover:underline">
                  {order.address.phone}
                </a>
              </p>
              {(order.address.alternatePhone || order.alternatePhone) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-600">
                  <Phone className="h-3.5 w-3.5 text-stone-400 shrink-0" /> Alt Phone:{" "}
                  <a
                    href={`tel:${order.address.alternatePhone || order.alternatePhone}`}
                    className="font-medium text-[#166F77] hover:underline"
                  >
                    {order.address.alternatePhone || order.alternatePhone}
                  </a>
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-stone-200 shadow-xs">
              <h3 className="font-serif text-base font-bold text-stone-900 mb-2.5 sm:mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#166F77]" /> Payment Summary
              </h3>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500">Method</span>
                <span className="font-semibold uppercase text-stone-900">
                  {order.payment.method === "razorpay" ? "Online (Razorpay)" : "Cash on Delivery"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-stone-500">Payment Status</span>
                <span
                  className={`font-semibold uppercase text-xs px-2 py-0.5 rounded ${
                    order.payment.status === "paid"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {order.payment.status}
                </span>
              </div>

              {/* Order Cost Breakdown */}
              {(() => {
                const subtotalVal =
                  typeof order.subtotal === "number" && order.subtotal > 0
                    ? order.subtotal
                    : (order.items || []).reduce(
                        (sum, item) => sum + (typeof item.price === "number" ? item.price : 0) * (item.qty || 1),
                        0
                      );
                const shippingVal =
                  typeof order.shipping === "number"
                    ? order.shipping
                    : Math.max(0, (order.total || 0) - subtotalVal + (order.discount || 0));
                const discountVal = typeof order.discount === "number" ? order.discount : 0;

                return (
                  <div className="border-t border-stone-100 my-3 pt-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Product Subtotal</span>
                      <span className="font-semibold text-stone-900">{formatINR(subtotalVal)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Shipping</span>
                      <span className="font-semibold text-stone-900">
                        {shippingVal === 0 ? "FREE" : formatINR(shippingVal)}
                      </span>
                    </div>
                    {typeof order.codFee === "number" && order.codFee > 0 && (
                      <div className="flex justify-between text-stone-600">
                        <span>COD Handling Fee</span>
                        <span className="font-semibold text-stone-900">{formatINR(order.codFee)}</span>
                      </div>
                    )}
                    {discountVal > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="font-semibold">-{formatINR(discountVal)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-stone-100 my-2 pt-1" />
              <div className="flex justify-between items-center font-semibold text-stone-900">
                <span>Grand Total</span>
                <span className="text-base font-bold text-[#166F77]">{formatINR(order.total)}</span>
              </div>
            </div>

            {/* Need Help? Seva Assistance Card */}
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs">
              <h3 className="font-serif text-base font-bold text-stone-900 mb-1.5 flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-[#166F77]" /> Need Help with this Order?
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Have questions about your delivery, poshak sizing, or order updates? Our Vrindavan seva team is here to assist you.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  to="/support"
                  search={{
                    tab: "submit",
                    orderId: order.id,
                    orderNo: String(displayOrderNumber(order)),
                    category: "ORDER_TRACKING",
                  } as never}
                  className="w-full py-2 px-3 rounded-xl bg-[#166F77]/10 hover:bg-[#166F77] text-[#166F77] hover:text-white transition text-xs font-semibold text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LifeBuoy className="w-3.5 h-3.5" />
                  <span>Open Support Ticket</span>
                </Link>
                <Link
                  to="/support"
                  search={{ tab: "faq" } as never}
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 transition text-xs font-semibold text-center cursor-pointer"
                >
                  Browse FAQs & Help Center
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {reviewingProduct && (
          <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4 animate-in fade-in duration-150">
            <div
              className="bg-white rounded-2xl border border-stone-200 p-6 w-full max-w-md shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <h3 className="font-serif text-xl font-bold text-stone-900">Write a Review</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Share your experience with this sacred item</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingProduct(null)}
                  className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200">
                <img
                  src={reviewingProduct.image}
                  alt={reviewingProduct.name}
                  className="w-12 h-12 object-cover rounded-lg border bg-white shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-stone-900 truncate">{reviewingProduct.name}</p>
                  <span className="text-[11px] text-emerald-700 font-medium">Verified Purchase</span>
                </div>
              </div>

              <form onSubmit={submitProductReview} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Your Rating (रेटिंग)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-1 rounded hover:scale-110 transition"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= reviewRating
                              ? "fill-amber-400 text-amber-400"
                              : "text-stone-300 fill-stone-100"
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-semibold text-stone-600 ml-2">
                      {reviewRating === 5
                        ? "5/5 - Outstanding"
                        : reviewRating === 4
                        ? "4/5 - Very Good"
                        : reviewRating === 3
                        ? "3/5 - Good"
                        : reviewRating === 2
                        ? "2/5 - Fair"
                        : "1/5 - Poor"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Your Review (अनुभव / टिप्पणी)
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="How was the quality, craftsmanship, and devotional experience of this item?"
                    className="w-full rounded-xl border border-stone-300 p-3 text-sm focus:outline-none focus:border-[#166F77] focus:ring-1 focus:ring-[#166F77]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setReviewingProduct(null)}
                    className="h-10 px-4 rounded-xl border border-stone-200 text-xs font-semibold hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="h-10 px-5 rounded-xl bg-[#166F77] text-white text-xs font-semibold hover:bg-[#166F77]/90 disabled:opacity-50 transition shadow-sm"
                  >
                    {submittingReview ? "Submitting..." : "Submit Review"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cancel Order Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 grid place-items-center shrink-0">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-stone-900 leading-tight">Cancel Order</h3>
                    <p className="text-[11px] text-stone-500">Order #{displayOrderNumber(order)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !cancellingOrder && setShowCancelModal(false)}
                  disabled={cancellingOrder}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                <p className="font-semibold text-amber-950">Important Notice:</p>
                <p className="mt-0.5">
                  Cancellation cannot be undone. Once cancelled, your items will be returned to store stock.
                </p>
              </div>

              <form onSubmit={handleCancelOrder} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-2">
                    Please select a reason for cancellation:
                  </label>
                  <div className="space-y-1.5">
                    {[
                      "Changed my mind",
                      "Ordered by mistake",
                      "Need to change the order",
                      "Delivery time is not suitable",
                      "Other",
                    ].map((reasonOption) => (
                      <label
                        key={reasonOption}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          cancelReason === reasonOption
                            ? "border-[#166F77] bg-teal-50/50 text-[#166F77] font-semibold"
                            : "border-stone-200 hover:border-stone-300 text-stone-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="cancelReason"
                          value={reasonOption}
                          checked={cancelReason === reasonOption}
                          onChange={(e) => setCancelReason(e.target.value)}
                          className="text-[#166F77] focus:ring-[#166F77]"
                        />
                        <span>{reasonOption}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {cancelReason === "Other" && (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Reason Details (कारण बताएं):
                    </label>
                    <textarea
                      required
                      rows={2}
                      maxLength={300}
                      value={customCancelReason}
                      onChange={(e) => setCustomCancelReason(e.target.value)}
                      placeholder="Please share more details on why you are cancelling..."
                      className="w-full rounded-xl border border-stone-300 p-2.5 text-xs focus:outline-none focus:border-[#166F77] focus:ring-1 focus:ring-[#166F77]"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(false)}
                    disabled={cancellingOrder}
                    className="h-10 px-4 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition disabled:opacity-50 cursor-pointer"
                  >
                    Keep Order
                  </button>
                  <button
                    type="submit"
                    disabled={cancellingOrder}
                    className="h-10 px-5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 transition shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {cancellingOrder ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      "Confirm Cancellation"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
