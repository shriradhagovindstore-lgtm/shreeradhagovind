import React, { useState, useMemo } from "react";
import {
  Truck,
  Package,
  RefreshCw,
  Search,
  Calendar,
  MapPin,
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Clock,
  ArrowUpRight,
  Eye,
  FileText,
  X as XIcon,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Filter,
  ArrowRight,
  ChevronRight,
  Info,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Order, Courier, displayOrderNumber, formatINR } from "@/lib/store";
import { api } from "@/lib/api";
import { getCourierTrackingUrl } from "@/lib/courier";

type DateRangePreset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";
type DeliverySubTab = "overview" | "all" | "today" | "delayed" | "rto" | "reports";

function normalizeCourierName(courier?: string | null): string {
  if (!courier) return "Other";
  const c = courier.trim().toLowerCase();
  if (c.includes("delhivery")) return "Delhivery";
  if (c.includes("bluedart") || c.includes("blue dart")) return "Blue Dart";
  if (c.includes("maruti") || c.includes("murti")) return "Shree Maruti";
  if (c.includes("dtdc")) return "DTDC";
  if (c.includes("india post") || c.includes("indiapost")) return "India Post";
  if (c.includes("ekart")) return "Ekart";
  return courier.trim();
}

function getShipmentOperationalStatus(order: Order): "Delivered" | "Out for delivery" | "In Transit" | "Pending" | "Exception" | "Cancelled" {
  if (order.status === "Delivered" || order.courierTrackingData?.status === "delivered") {
    return "Delivered";
  }
  if (order.status === "Cancelled") {
    return "Cancelled";
  }
  if (order.status === "Out for delivery" || order.courierTrackingData?.status === "out_for_delivery") {
    return "Out for delivery";
  }
  if (order.courierTrackingData?.status === "exception" || order.courierTrackingData?.status === "undelivered") {
    return "Exception";
  }
  if (order.status === "Shipped" || order.courierTrackingData?.status === "in_transit") {
    const td = order.courierTrackingData;
    if (!td || td.hasCarrierScans === false || td.status === "info_received" || td.status === "unknown") {
      return "Pending";
    }
    return "In Transit";
  }
  if (order.courier && order.trackingId) {
    return "Pending";
  }
  return "Pending";
}

function getRtoClassification(order: Order): "none" | "initiated" | "in_transit" | "returned" {
  const msg = (order.courierTrackingData?.latestMessage || "").toLowerCase();
  const notes = (order.holdReason || "").toLowerCase();
  const cpTexts = (order.courierTrackingData?.checkpoints || []).map((c) => `${c.description} ${c.status || ""}`).join(" ").toLowerCase();
  const combined = `${msg} ${notes} ${cpTexts}`;

  if (
    combined.includes("returned to shipper") ||
    combined.includes("rto delivered") ||
    combined.includes("returned to origin") ||
    combined.includes("return delivered")
  ) {
    return "returned";
  }
  if (
    combined.includes("rto in transit") ||
    combined.includes("return in transit") ||
    combined.includes("returning to origin") ||
    combined.includes("rto undelivered")
  ) {
    return "in_transit";
  }
  if (
    combined.includes("rto") ||
    combined.includes("return to origin") ||
    combined.includes("undeliverable") ||
    combined.includes("rto initiated")
  ) {
    return "initiated";
  }
  return "none";
}

function getActualDeliveryDate(order: Order): Date | null {
  const isDelivered = order.status === "Delivered" || order.courierTrackingData?.status === "delivered";
  if (!isDelivered) return null;

  if (order.courierTrackingData?.lastCarrierScanAt) {
    const d = new Date(order.courierTrackingData.lastCarrierScanAt);
    if (!isNaN(d.getTime())) return d;
  }

  if (Array.isArray(order.courierTrackingData?.checkpoints)) {
    const cp = order.courierTrackingData.checkpoints.slice().reverse().find((c) => {
      const text = `${c.status || ""} ${c.description || ""}`.toLowerCase();
      return text.includes("delivered");
    });
    if (cp && cp.time) {
      const d = new Date(cp.time);
      if (!isNaN(d.getTime())) return d;
    }
  }

  if (Array.isArray(order.statusHistory)) {
    const sh = order.statusHistory.slice().reverse().find((s) => s.status === "Delivered");
    if (sh && sh.changedAt) {
      const d = new Date(sh.changedAt);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return order.createdAt ? new Date(order.createdAt) : new Date();
}

function isDeliveredToday(order: Order): boolean {
  const d = getActualDeliveryDate(order);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function checkDelayRule(order: Order): { isDelayed: boolean; reason: string; elapsedHours: number; elapsedDays: number } {
  const now = Date.now();
  const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : now;
  const ageMs = Math.max(0, now - createdMs);
  const elapsedHours = Math.round(ageMs / (3600 * 1000));
  const elapsedDays = Math.round(ageMs / (24 * 3600 * 1000));

  if (order.status === "Delivered" || order.status === "Cancelled" || order.courierTrackingData?.status === "delivered") {
    return { isDelayed: false, reason: "", elapsedHours, elapsedDays };
  }

  if (order.status === "Out for delivery" || order.courierTrackingData?.status === "out_for_delivery") {
    let ofdTime = createdMs;
    if (Array.isArray(order.statusHistory)) {
      const ofdEntry = order.statusHistory.slice().reverse().find((s) => s.status === "Out for delivery");
      if (ofdEntry?.changedAt) ofdTime = new Date(ofdEntry.changedAt).getTime();
    }
    const hoursInOfd = Math.round(Math.max(0, now - ofdTime) / (3600 * 1000));
    if (hoursInOfd > 24) {
      return {
        isDelayed: true,
        reason: `Out for delivery for ${hoursInOfd}h (>24h SLA limit)`,
        elapsedHours: hoursInOfd,
        elapsedDays: Math.round(hoursInOfd / 24),
      };
    }
  }

  if (order.status === "Shipped" || order.courierTrackingData?.status === "in_transit") {
    if (elapsedDays > 7) {
      return {
        isDelayed: true,
        reason: `In transit for ${elapsedDays} days (>7d transit SLA limit)`,
        elapsedHours,
        elapsedDays,
      };
    }
  }

  if (order.courierTrackingData?.status === "exception" || order.courierTrackingData?.status === "undelivered") {
    return {
      isDelayed: true,
      reason: order.courierTrackingData.latestMessage || "Carrier reported delivery exception / delay",
      elapsedHours,
      elapsedDays,
    };
  }

  return { isDelayed: false, reason: "", elapsedHours, elapsedDays };
}

function formatRelativeTime(timestamp?: string | number | null): string {
  if (!timestamp) return "Awaiting sync";
  const t = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
  if (isNaN(t) || t <= 0) return "Awaiting sync";
  const diffMs = Date.now() - t;
  if (diffMs < 60 * 1000) return "Just now";
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatOrderPrintDate(createdAt: string | number) {
  try {
    const d = new Date(createdAt);
    const datePart = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return String(createdAt);
  }
}

function generateOrderShippingPlainText(order: Order): string {
  const lines: string[] = [];
  const name = (order.address?.name || "").trim() || "Customer";
  lines.push(name);

  if (order.address?.line1?.trim()) lines.push(order.address.line1.trim());
  if (order.address?.line2?.trim()) lines.push(order.address.line2.trim());
  if (order.address?.postOffice?.trim()) lines.push(order.address.postOffice.trim());

  const city = (order.address?.city || "").trim();
  const pincode = (order.address?.pincode || "").trim();
  if (city && pincode) lines.push(`${city} - ${pincode}`);
  else if (city) lines.push(city);
  else if (pincode) lines.push(pincode);

  if (order.address?.state?.trim()) lines.push(order.address.state.trim());

  const phone = (order.address?.phone || "").trim();
  if (phone) lines.push(`Phone: ${phone}`);

  const altPhone = (order.address?.alternatePhone || order.alternatePhone || "").trim();
  if (altPhone && altPhone !== phone) lines.push(`Alt No.: ${altPhone}`);

  const num = displayOrderNumber(order);
  lines.push(`Order No. #${num}`);

  return lines.join("\n");
}

function StatusBadge({ status }: { status: string }) {
  let cls = "bg-stone-100 text-stone-700 border-stone-200";
  if (status === "Delivered") cls = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (status === "Out for delivery") cls = "bg-amber-50 text-amber-700 border-amber-200";
  else if (status === "In Transit") cls = "bg-sky-50 text-sky-700 border-sky-200";
  else if (status === "Pending") cls = "bg-slate-100 text-slate-700 border-slate-200";
  else if (status === "Exception") cls = "bg-rose-50 text-rose-700 border-rose-200";
  else if (status === "Cancelled") cls = "bg-stone-100 text-stone-500 border-stone-200 line-through";

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

function CourierBadge({ courier, provider }: { courier?: string | null; provider?: string }) {
  const norm = normalizeCourierName(courier);
  let color = "bg-stone-50 text-stone-700 border-stone-200";
  if (norm === "Delhivery") color = "bg-red-50 text-red-700 border-red-200";
  else if (norm === "Blue Dart") color = "bg-blue-50 text-blue-700 border-blue-200";
  else if (norm === "Shree Maruti") color = "bg-amber-50 text-amber-800 border-amber-200";
  else if (norm === "DTDC") color = "bg-blue-50 text-indigo-700 border-indigo-200";
  else if (norm === "India Post") color = "bg-rose-50 text-rose-800 border-rose-200";

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border tracking-wide uppercase ${color}`}>
        {norm}
      </span>
      {provider === "carrier_direct" && (
        <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-100/60 text-emerald-800 font-medium" title="Direct Carrier API">
          Direct
        </span>
      )}
    </div>
  );
}

function KpiCard({
  title,
  count,
  subtitle,
  icon: Icon,
  color = "stone",
  active = false,
  onClick,
}: {
  title: string;
  count: number | string;
  subtitle: string;
  icon: any;
  color?: "emerald" | "amber" | "sky" | "slate" | "rose" | "stone" | "purple";
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap = {
    emerald: "text-emerald-700 bg-emerald-50/70 border-emerald-200",
    amber: "text-amber-700 bg-amber-50/70 border-amber-200",
    sky: "text-sky-700 bg-sky-50/70 border-sky-200",
    slate: "text-slate-700 bg-slate-50/70 border-slate-200",
    rose: "text-rose-700 bg-rose-50/70 border-rose-200",
    stone: "text-stone-700 bg-stone-50/70 border-stone-200",
    purple: "text-purple-700 bg-purple-50/70 border-purple-200",
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 sm:p-5 shadow-xs transition ${
        onClick ? "cursor-pointer hover:border-stone-400" : ""
      } ${active ? "ring-2 ring-primary border-primary" : "border-stone-200"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg border ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-bold font-serif text-stone-900">{count}</span>
      </div>
      <p className="mt-1 text-xs text-stone-500 font-medium truncate">{subtitle}</p>
    </div>
  );
}

function ShippingLabelsModal({
  orders,
  onClose,
}: {
  orders: Order[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = () => {
    try {
      const allText = orders.map((o) => generateOrderShippingPlainText(o)).join("\n\n----------------------------------------\n\n");
      navigator.clipboard.writeText(allText);
      setCopied(true);
      toast.success(`${orders.length} shipping labels copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy shipping labels");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 print:hidden">
          <div>
            <h2 className="text-lg font-bold font-serif text-stone-900">Shipping Address Labels ({orders.length})</h2>
            <p className="text-xs text-stone-500">Ready for printing or thermal paper dispatch.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="h-9 px-3 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy Plaintext"}</span>
            </button>
            <button
              onClick={handlePrint}
              className="h-9 px-3.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 inline-flex items-center gap-1.5 transition"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Labels</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-500 transition">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 print:p-0 print:space-y-4">
          <div className="grid sm:grid-cols-2 gap-4 print:grid-cols-2">
            {orders.map((o) => {
              const orderNum = displayOrderNumber(o);
              const isCod = o.payment?.method === "cod";
              const totalStr = formatINR(o.total);

              return (
                <div
                  key={o.id}
                  className="rounded-xl border border-stone-300 p-4 bg-white text-stone-900 shadow-2xs font-sans text-xs flex flex-col justify-between print:border-black print:shadow-none break-inside-avoid"
                >
                  <div className="border-b border-stone-200 pb-2.5 mb-2.5 space-y-0.5">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">DELIVER TO (Consignee):</span>
                    <p className="font-bold text-stone-900 text-sm">{o.address?.name || "Devotee"}</p>
                    <p className="text-stone-700 leading-snug">
                      {o.address?.line1}
                      {o.address?.line2 && `, ${o.address.line2}`}
                      {o.address?.postOffice && `, PO: ${o.address.postOffice}`}
                    </p>
                    <p className="font-semibold text-stone-900">
                      {o.address?.city}, {o.address?.state} - <span className="font-mono text-sm underline">{o.address?.pincode}</span>
                    </p>
                    <p className="text-stone-800 font-medium pt-1">
                      Phone: <span className="font-mono font-bold">{o.address?.phone || "-"}</span>
                      {(o.address?.alternatePhone || o.alternatePhone) && (
                        <span className="text-stone-600 ml-2">Alt: {o.address?.alternatePhone || o.alternatePhone}</span>
                      )}
                    </p>
                  </div>

                  <div className="my-1 flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">FROM (Sender):</span>
                      <span className="font-bold text-stone-900 text-xs">SHRI RADHA GOVIND STORE</span>
                      <p className="text-[11px] text-stone-600 leading-tight">Raman Reti, Vrindavan, Mathura, UP - 281121</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-sm text-stone-900">#{orderNum}</span>
                      <span className="block text-[10px] text-stone-500">{formatOrderPrintDate(o.createdAt)}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200 bg-stone-50/80 -mx-4 -mb-4 p-3 rounded-b-xl flex items-center justify-between gap-2 print:bg-transparent">
                    <div>
                      <span className="font-semibold text-stone-800 text-[11px]">{normalizeCourierName(o.courier)}</span>
                      {o.trackingId && <span className="block font-mono text-[10px] text-stone-600">AWB: {o.trackingId}</span>}
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isCod ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        }`}
                      >
                        {isCod ? `COD: ${totalStr}` : `PREPAID: ${totalStr}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackingDrawerModal({
  order,
  onClose,
  onOpenOrder,
  onRefresh,
  isRefreshing = false,
}: {
  order: Order;
  onClose: () => void;
  onOpenOrder?: (order: Order) => void;
  onRefresh?: (order: Order) => void;
  isRefreshing?: boolean;
}) {
  const td = order.courierTrackingData;
  const num = displayOrderNumber(order);
  const extUrl =
    order.courierTrackingUrl ||
    (order.courier && order.trackingId ? getCourierTrackingUrl(order.courier, order.trackingId) : "");
  const [sortOrder, setSortOrder] = useState<"chronological" | "latestFirst">("chronological");
  const [copiedJourney, setCopiedJourney] = useState(false);

  const checkpoints = useMemo(() => {
    if (!Array.isArray(td?.checkpoints)) return [];
    const list = [...td.checkpoints];
    return sortOrder === "latestFirst" ? list.reverse() : list;
  }, [td?.checkpoints, sortOrder]);

  const handleCopyJourney = () => {
    try {
      const header = `Order #${num} (${normalizeCourierName(order.courier)} - AWB: ${order.trackingId || "N/A"})\nFulfillment Status: ${order.status} (Courier: ${td?.latestStatus || td?.status || "N/A"})\nDestination: ${order.address?.city || "-"}, ${order.address?.state || ""} - ${order.address?.pincode || ""}\nCustomer: ${order.address?.name || "Devotee"} (${order.address?.phone || "-"})\n\nCOMPLETE SHIPMENT JOURNEY (${td?.checkpoints?.length || 0} Checkpoints):\n`;
      const steps = (td?.checkpoints || [])
        .map((cp, idx) => {
          const timeStr = formatOrderPrintDate(cp.time);
          const loc = cp.location ? ` [${cp.location}]` : "";
          const st = cp.status ? ` - ${cp.status}` : "";
          return `${idx + 1}. ${timeStr}${loc}${st}\n   ${cp.description}`;
        })
        .join("\n");

      navigator.clipboard.writeText(header + (steps || "No detailed checkpoints recorded yet."));
      setCopiedJourney(true);
      toast.success("Complete shipment journey copied to clipboard");
      setTimeout(() => setCopiedJourney(false), 2000);
    } catch {
      toast.error("Failed to copy shipment journey");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-2xl sm:max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-start justify-between bg-stone-50/90 gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-serif text-stone-900">Order #{num}</h2>
              <StatusBadge status={getShipmentOperationalStatus(order)} />
              {order.status !== (td?.latestStatus || td?.status) && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/80 text-stone-700 font-medium">
                  Fulfillment: {order.status}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 mt-1">
              <span>
                Courier: <strong className="text-stone-900">{normalizeCourierName(order.courier)}</strong>
              </span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <span>AWB:</span>
                <span className="font-mono font-bold text-stone-900 select-all">{order.trackingId || "Pending"}</span>
                {order.trackingId && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(order.trackingId || "");
                      toast.success(`AWB ${order.trackingId} copied`);
                    }}
                    className="text-stone-400 hover:text-stone-700 p-0.5"
                    title="Copy AWB Number"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
              <span>•</span>
              <span>
                Devotee: <strong className="text-stone-900">{order.address?.name || "Customer"}</strong> ({order.address?.city || "-"})
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-500 transition shrink-0"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 rounded-xl p-3.5 border border-stone-200 text-xs">
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Fulfillment State</span>
              <span className="font-bold text-stone-900 mt-0.5 block">{order.status}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Courier Live State</span>
              <span className="font-bold text-emerald-800 mt-0.5 block capitalize">
                {td?.latestStatus || td?.status || (order.status === "Delivered" ? "Delivered" : "In Transit")}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Current Location</span>
              <span className="font-semibold text-stone-900 mt-0.5 block truncate" title={td?.currentLocation || order.address?.city || ""}>
                {td?.currentLocation || order.address?.city || "In Transit"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Carrier Last Scan</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">
                {td?.lastCarrierScanAt ? formatOrderPrintDate(td.lastCarrierScanAt) : "Awaiting scan"}
              </span>
            </div>
          </div>

          {/* Route Card */}
          {(td?.origin || td?.destination || order.address?.city) && (
            <div className="p-3.5 rounded-xl border border-stone-200 bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-700 shrink-0" />
                <span className="font-medium text-stone-600">
                  Origin: <strong className="text-stone-900">{td?.origin || "Vrindavan Dham"}</strong>
                  {" → "}
                  Destination: <strong className="text-stone-900">{td?.destination || `${order.address?.city}, ${order.address?.state} (${order.address?.pincode})`}</strong>
                </span>
              </div>
              {td?.expectedDeliveryDate && (
                <span className="text-[11px] font-mono text-stone-500">
                  Expected: <strong>{td.expectedDeliveryDate}</strong>
                </span>
              )}
            </div>
          )}

          {/* Complete Shipment Journey Timeline Header */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-stone-700" />
                  <span>Complete Shipment Journey</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-stone-100 text-stone-800 border border-stone-200">
                    {checkpoints.length} Checkpoint{checkpoints.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Exact persisted courier checkpoints from {td?.provider === "carrier_direct" ? "direct carrier API" : "TrackCourier integration"} without estimated or fabricated stops.
                </p>
              </div>

              {/* Sort Order Toggle & Copy */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-stone-200 p-0.5 bg-stone-50 text-[11px] font-medium">
                  <button
                    onClick={() => setSortOrder("chronological")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      sortOrder === "chronological" ? "bg-white text-stone-900 shadow-2xs font-bold" : "text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    Journey (Dispatch → Delivery)
                  </button>
                  <button
                    onClick={() => setSortOrder("latestFirst")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      sortOrder === "latestFirst" ? "bg-white text-stone-900 shadow-2xs font-bold" : "text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    Latest First
                  </button>
                </div>
                <button
                  onClick={handleCopyJourney}
                  className="h-7 px-2 rounded-md border border-stone-300 bg-white text-[11px] font-semibold text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1 transition"
                  title="Copy complete journey history as text"
                >
                  {copiedJourney ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedJourney ? "Copied" : "Copy Journey"}</span>
                </button>
              </div>
            </div>

            {/* Checkpoints Timeline List */}
            {checkpoints.length === 0 ? (
              <div className="text-center py-10 text-stone-500 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1.5">
                <Clock className="h-8 w-8 mx-auto text-stone-400 mb-1" />
                <p className="font-semibold text-stone-800 text-sm">Tracking Number Registered</p>
                <p className="text-stone-500 max-w-md mx-auto leading-relaxed">
                  Consignment booked with {normalizeCourierName(order.courier)}. Physical hub scans and movement checkpoints will appear here once processed at the carrier sorting facility.
                </p>
                {td?.latestMessage && (
                  <p className="font-medium text-stone-700 pt-1">
                    Latest status message: &ldquo;{td.latestMessage}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                {checkpoints.map((cp, idx) => {
                  const isDelivered = (cp.status || cp.description || "").toLowerCase().includes("delivered");
                  const isOfd =
                    (cp.status || cp.description || "").toLowerCase().includes("out for delivery") ||
                    (cp.status || "").toLowerCase().includes("dispatched");
                  const isException =
                    (cp.status || cp.description || "").toLowerCase().includes("exception") ||
                    (cp.status || cp.description || "").toLowerCase().includes("undelivered") ||
                    (cp.description || "").toLowerCase().includes("delay");

                  let nodeClass = "border-stone-400 bg-white";
                  let badgeClass = "bg-stone-100 text-stone-700 border-stone-200";

                  if (isDelivered) {
                    nodeClass = "border-emerald-600 bg-emerald-600 ring-4 ring-emerald-100";
                    badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200 font-bold";
                  } else if (isOfd) {
                    nodeClass = "border-amber-500 bg-amber-500 ring-4 ring-amber-100";
                    badgeClass = "bg-amber-50 text-amber-800 border-amber-200 font-bold";
                  } else if (isException) {
                    nodeClass = "border-rose-500 bg-rose-500 ring-4 ring-rose-100";
                    badgeClass = "bg-rose-50 text-rose-800 border-rose-200 font-bold";
                  }

                  return (
                    <div key={`${cp.time}-${idx}`} className="relative group">
                      {/* Timeline Node */}
                      <div className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 transition ${nodeClass}`} />
                      {/* Checkpoint Card */}
                      <div className="bg-stone-50/70 group-hover:bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-xs transition space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[11px] border font-semibold ${badgeClass}`}>
                              {cp.status || "Checkpoint"}
                            </span>
                            {cp.location && (
                              <span className="font-semibold text-stone-900 inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-stone-400" />
                                {cp.location}
                              </span>
                            )}
                          </div>
                          <time className="text-[11px] font-mono text-stone-500 shrink-0">
                            {formatOrderPrintDate(cp.time)}
                          </time>
                        </div>
                        <p className="text-stone-700 font-medium pt-0.5">{cp.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-stone-500">
            <span>Last synced: </span>
            <strong className="text-stone-800">
              {formatRelativeTime(order.courierTrackingLastFetchedAt || td?.lastUpdated)}
            </strong>
            {order.courierTrackingLastFetchedAt && (
              <span className="text-stone-400 ml-1">
                ({new Date(order.courierTrackingLastFetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
              <button
                onClick={() => onRefresh(order)}
                disabled={isRefreshing}
                className="h-8 px-3 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
                title="Refresh tracking from carrier with safe cooldown check"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>{isRefreshing ? "Refreshing..." : "Safe Refresh"}</span>
              </button>
            )}
            {onOpenOrder && (
              <button
                onClick={() => {
                  onClose();
                  onOpenOrder(order);
                }}
                className="h-8 px-3 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                Manage Order
              </button>
            )}
            {extUrl && (
              <a
                href={extUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 inline-flex items-center gap-1.5 transition"
              >
                <span>Track on {normalizeCourierName(order.courier)}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeliveryOperationsView({
  orders,
  onOpenOrder,
  onRefreshOrders,
}: {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
  onRefreshOrders: () => Promise<void> | void;
}) {
  const [subTab, setSubTab] = useState<DeliverySubTab>("overview");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshingOrderId, setRefreshingOrderId] = useState<string | null>(null);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [viewingTrackingOrder, setViewingTrackingOrder] = useState<Order | null>(null);

  const isShipmentOrder = (o: Order) => {
    return Boolean(
      (o.courier && o.courier.trim()) ||
      (o.trackingId && o.trackingId.trim()) ||
      ["Shipped", "Out for delivery", "Delivered"].includes(o.status)
    );
  };

  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    if (datePreset === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "yesterday") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }
    if (datePreset === "7d") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "30d") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "custom" && customFrom && customTo) {
      const start = new Date(customFrom).setHours(0, 0, 0, 0);
      const end = new Date(customTo).setHours(23, 59, 59, 999);
      return { start, end };
    }
    return { start: 0, end: Infinity };
  }, [datePreset, customFrom, customTo]);

  const dateFilteredOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      if (!isShipmentOrder(o)) return false;
      const t = o.createdAt || 0;
      return t >= dateRangeBounds.start && t <= dateRangeBounds.end;
    });
  }, [orders, dateRangeBounds]);

  const kpis = useMemo(() => {
    const allShipments = (orders || []).filter(isShipmentOrder);
    const inRange = dateFilteredOrders;

    let totalShipments = inRange.length;
    let todayShipments = 0;
    let deliveredCount = 0;
    let deliveredTodayCount = 0;
    let ofdCount = 0;
    let inTransitCount = 0;
    let pendingCount = 0;
    let delayedCount = 0;
    let failedCount = 0;
    let rtoInitiatedCount = 0;
    let rtoReturnedCount = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    for (const o of allShipments) {
      if (o.createdAt >= startOfTodayMs) {
        todayShipments++;
      }
      if (isDeliveredToday(o)) {
        deliveredTodayCount++;
      }
    }

    for (const o of inRange) {
      const opStatus = getShipmentOperationalStatus(o);
      const rto = getRtoClassification(o);
      const delay = checkDelayRule(o);

      if (opStatus === "Delivered") {
        deliveredCount++;
      } else if (opStatus === "Out for delivery") {
        ofdCount++;
      } else if (opStatus === "In Transit") {
        inTransitCount++;
      } else if (opStatus === "Pending") {
        pendingCount++;
      } else if (opStatus === "Exception") {
        failedCount++;
      }

      if (delay.isDelayed) {
        delayedCount++;
      }

      if (rto === "initiated" || rto === "in_transit") {
        rtoInitiatedCount++;
      } else if (rto === "returned") {
        rtoReturnedCount++;
      }
    }

    return {
      totalShipments,
      todayShipments,
      deliveredCount,
      deliveredTodayCount,
      totalDeliveredCount: allShipments.filter((o) => getShipmentOperationalStatus(o) === "Delivered").length,
      ofdCount,
      inTransitCount,
      pendingCount,
      delayedCount,
      failedCount,
      rtoInitiatedCount,
      rtoReturnedCount,
    };
  }, [orders, dateFilteredOrders]);

  const courierMatrix = useMemo(() => {
    const list = ["Delhivery", "Blue Dart", "Shree Maruti", "DTDC", "India Post", "Ekart", "Other"];
    const rows = list.map((cName) => {
      const courierOrders = dateFilteredOrders.filter((o) => normalizeCourierName(o.courier) === cName);
      const count = courierOrders.length;
      let delivered = 0;
      let ofd = 0;
      let inTransit = 0;
      let pending = 0;
      let exception = 0;
      let rto = 0;

      for (const o of courierOrders) {
        const op = getShipmentOperationalStatus(o);
        const rtoState = getRtoClassification(o);
        if (op === "Delivered") delivered++;
        else if (op === "Out for delivery") ofd++;
        else if (op === "In Transit") inTransit++;
        else if (op === "Pending") pending++;
        else if (op === "Exception") exception++;

        if (rtoState !== "none") rto++;
      }

      const rate = count > 0 ? Math.round((delivered / count) * 100) : 0;

      return {
        courier: cName,
        total: count,
        delivered,
        ofd,
        inTransit,
        pending,
        exception,
        rto,
        rate,
      };
    });

    return rows.filter((r) => r.total > 0 || ["Delhivery", "Blue Dart", "Shree Maruti", "DTDC"].includes(r.courier));
  }, [dateFilteredOrders]);

  const todayDeliveries = useMemo(() => {
    return (orders || []).filter((o) => isShipmentOrder(o) && isDeliveredToday(o));
  }, [orders]);

  const delayedParcels = useMemo(() => {
    return dateFilteredOrders.filter((o) => checkDelayRule(o).isDelayed);
  }, [dateFilteredOrders]);

  const rtoOrders = useMemo(() => {
    return dateFilteredOrders
      .map((o) => ({ order: o, rto: getRtoClassification(o) }))
      .filter((item) => item.rto !== "none");
  }, [dateFilteredOrders]);

  const dailyReports = useMemo(() => {
    const map = new Map<
      string,
      {
        dateStr: string;
        timestamp: number;
        created: number;
        shipped: number;
        ofd: number;
        delivered: number;
        exception: number;
        rto: number;
      }
    >();

    for (const o of dateFilteredOrders) {
      const d = new Date(o.createdAt || Date.now());
      const key = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const entry = map.get(key) || {
        dateStr: key,
        timestamp: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        created: 0,
        shipped: 0,
        ofd: 0,
        delivered: 0,
        exception: 0,
        rto: 0,
      };

      entry.created++;
      const op = getShipmentOperationalStatus(o);
      const rtoState = getRtoClassification(o);

      if (op === "Delivered") entry.delivered++;
      else if (op === "Out for delivery") entry.ofd++;
      else if (op === "In Transit") entry.shipped++;
      else if (op === "Exception") entry.exception++;

      if (rtoState !== "none") entry.rto++;

      map.set(key, entry);
    }

    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [dateFilteredOrders]);

  const allShipmentsFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^#/, "");
    return dateFilteredOrders.filter((o) => {
      if (courierFilter !== "all") {
        if (normalizeCourierName(o.courier) !== courierFilter) return false;
      }
      if (statusFilter !== "all") {
        const op = getShipmentOperationalStatus(o);
        const rtoState = getRtoClassification(o);
        if (statusFilter === "rto") {
          if (rtoState === "none") return false;
        } else if (statusFilter === "delayed") {
          if (!checkDelayRule(o).isDelayed) return false;
        } else if (op.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }
      if (!q) return true;
      const orderNum = displayOrderNumber(o).toLowerCase();
      const awb = (o.trackingId || "").toLowerCase();
      const cName = (o.address?.name || "").toLowerCase();
      const phone = (o.address?.phone || "").toLowerCase();
      const city = (o.address?.city || "").toLowerCase();
      const courier = (o.courier || "").toLowerCase();

      return (
        orderNum.includes(q) ||
        awb.includes(q) ||
        cName.includes(q) ||
        phone.includes(q) ||
        city.includes(q) ||
        courier.includes(q)
      );
    });
  }, [dateFilteredOrders, courierFilter, statusFilter, searchQuery]);

  const handleSyncAllCouriers = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await api<{
        success: boolean;
        totalActive: number;
        refreshed: number;
        transitions: number;
        alreadyFresh: number;
        skippedLock?: boolean;
        skippedBudget?: boolean;
      }>("/admin/tracking/sync", { method: "POST" });

      if (res?.skippedLock) {
        toast.warning("Another background sync process is currently running. Please try again shortly.");
      } else {
        const total = res?.totalActive ?? 0;
        const ref = res?.refreshed ?? 0;
        const fresh = res?.alreadyFresh ?? 0;
        const trans = res?.transitions ?? 0;
        toast.success(
          `Sync completed: ${total} active shipments checked (${ref} refreshed, ${fresh} cache-fresh${trans > 0 ? `, ${trans} transitions` : ""})`
        );
        await onRefreshOrders();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to trigger courier sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshSingleTracking = async (o: Order) => {
    if (refreshingOrderId === o.id) return;
    setRefreshingOrderId(o.id);
    try {
      const res = await api<{
        success: boolean;
        refreshed?: boolean;
        message?: string;
      }>(`/admin/orders/${o.id}/refresh-tracking`, { method: "POST" });

      if (res?.refreshed) {
        toast.success(`Tracking refreshed for Order #${displayOrderNumber(o)} from ${o.courier || "courier"}`);
      } else {
        toast.info(res?.message || `Tracking is up to date (within rate-limit cooldown window)`);
      }
      await onRefreshOrders();
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh tracking");
    } finally {
      setRefreshingOrderId(null);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === allShipmentsFiltered.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(allShipmentsFiltered.map((o) => o.id));
    }
  };

  const selectedOrdersForLabel = useMemo(() => {
    if (selectedOrderIds.length > 0) {
      return (orders || []).filter((o) => selectedOrderIds.includes(o.id));
    }
    return allShipmentsFiltered.slice(0, 50);
  }, [orders, selectedOrderIds, allShipmentsFiltered]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="rounded-xl bg-white border border-stone-200 p-6 text-stone-900 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-stone-900 text-white">
                <Truck className="h-5 w-5" />
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900">Delivery Operations</h1>
            </div>
            <p className="mt-1.5 text-xs sm:text-sm text-stone-500">
              Live courier synchronization, tracking analytics, and parcel lifecycle monitoring across all active carriers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsLabelModalOpen(true)}
              className="h-10 px-3.5 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5 transition shadow-xs"
              title="Print formatted shipping labels"
            >
              <Printer className="h-3.5 w-3.5 text-stone-600" />
              <span>Print Labels</span>
            </button>
            <button
              onClick={handleSyncAllCouriers}
              disabled={isSyncing}
              className="h-10 px-4 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 disabled:opacity-50 inline-flex items-center gap-2 transition shadow-xs"
              title="Synchronize all active shipments with carrier APIs (safe rate-limit protected)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing Couriers..." : "Sync All Couriers"}</span>
            </button>
          </div>
        </div>

        {/* Date Preset Filter Bar */}
        <div className="mt-6 pt-5 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 max-w-full">
            <span className="text-xs font-semibold text-stone-400 mr-1 flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Calendar className="h-3.5 w-3.5 shrink-0" /> Date:
            </span>
            {(
              [
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "all", label: "All Time" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => {
              const active = datePreset === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setDatePreset(p.id)}
                  className={`min-h-[44px] sm:min-h-0 h-11 sm:h-8 px-3 rounded-lg text-xs font-semibold transition border whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:text-stone-900"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {datePreset === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="min-h-[44px] sm:min-h-0 h-11 sm:h-8 px-2 text-base sm:text-xs rounded border border-stone-300 bg-white"
              />
              <span className="text-xs text-stone-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-[44px] sm:min-h-0 h-11 sm:h-8 px-2 text-base sm:text-xs rounded border border-stone-300 bg-white"
              />
            </div>
          )}
        </div>
      </section>

      {/* 10 Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <KpiCard
          title="Total Shipments"
          count={kpis.totalShipments}
          subtitle="All active & booked"
          icon={Package}
          color="stone"
          onClick={() => {
            setSubTab("all");
            setStatusFilter("all");
          }}
        />
        <KpiCard
          title="Today's Bookings"
          count={kpis.todayShipments}
          subtitle="Dispatched today"
          icon={Calendar}
          color="stone"
        />
        <KpiCard
          title="Delivered"
          count={kpis.deliveredCount}
          subtitle={`${kpis.deliveredTodayCount} live today • ${kpis.totalDeliveredCount} total`}
          icon={CheckCircle2}
          color="emerald"
          onClick={() => {
            setSubTab("today");
          }}
        />
        <KpiCard
          title="Out for Delivery"
          count={kpis.ofdCount}
          subtitle="Out with agent"
          icon={Truck}
          color="amber"
          onClick={() => {
            setSubTab("all");
            setStatusFilter("out for delivery");
          }}
        />
        <KpiCard
          title="In Transit"
          count={kpis.inTransitCount}
          subtitle="Between carrier hubs"
          icon={ArrowRight}
          color="sky"
          onClick={() => {
            setSubTab("all");
            setStatusFilter("in transit");
          }}
        />
        <KpiCard
          title="Pending / Pickup"
          count={kpis.pendingCount}
          subtitle="Awaiting carrier scan"
          icon={Clock}
          color="slate"
          onClick={() => {
            setSubTab("all");
            setStatusFilter("pending");
          }}
        />
        <KpiCard
          title="Delayed Parcels"
          count={kpis.delayedCount}
          subtitle="Exceeding SLA limits"
          icon={AlertTriangle}
          color="rose"
          active={subTab === "delayed"}
          onClick={() => {
            setSubTab("delayed");
          }}
        />
        <KpiCard
          title="Failed / Exception"
          count={kpis.failedCount}
          subtitle="Delivery attempts failed"
          icon={AlertCircle}
          color="rose"
          onClick={() => {
            setSubTab("all");
            setStatusFilter("exception");
          }}
        />
        <KpiCard
          title="RTO Initiated"
          count={kpis.rtoInitiatedCount}
          subtitle="Returning to origin"
          icon={RotateCcw}
          color="purple"
          onClick={() => {
            setSubTab("rto");
          }}
        />
        <KpiCard
          title="RTO Returned"
          count={kpis.rtoReturnedCount}
          subtitle="Received back at hub"
          icon={RotateCcw}
          color="purple"
          onClick={() => {
            setSubTab("rto");
          }}
        />
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="border-b border-stone-200 flex items-center gap-2 overflow-x-auto pb-px">
        {(
          [
            { id: "overview", label: "Overview & Matrix", count: null },
            { id: "all", label: "All Shipments", count: allShipmentsFiltered.length },
            { id: "today", label: "Today's Deliveries", count: todayDeliveries.length },
            { id: "delayed", label: "Delayed Parcels", count: delayedParcels.length },
            { id: "rto", label: "RTO Hub", count: rtoOrders.length },
            { id: "reports", label: "Daily Reports", count: null },
          ] as const
        ).map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`h-11 px-4 text-xs font-bold whitespace-nowrap transition border-b-2 inline-flex items-center gap-1.5 ${
                active
                  ? "border-stone-900 text-stone-900"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <span>{t.label}</span>
              {t.count !== null && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & MATRIX */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {/* Pipeline Lifecycle Bar */}
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4">Shipment Lifecycle Pipeline</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block text-[11px] text-slate-500 font-semibold">1. Manifest / Pending</span>
                <span className="block text-xl font-bold text-slate-800 font-serif mt-1">{kpis.pendingCount}</span>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <span className="block text-[11px] text-sky-600 font-semibold">2. In Transit</span>
                <span className="block text-xl font-bold text-sky-800 font-serif mt-1">{kpis.inTransitCount}</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="block text-[11px] text-amber-600 font-semibold">3. Out for Delivery</span>
                <span className="block text-xl font-bold text-amber-800 font-serif mt-1">{kpis.ofdCount}</span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="block text-[11px] text-emerald-600 font-semibold">4. Delivered</span>
                <span className="block text-xl font-bold text-emerald-800 font-serif mt-1">{kpis.deliveredCount}</span>
              </div>
            </div>
          </div>

          {/* Courier Performance Matrix */}
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">Courier Performance Matrix</h3>
                <p className="text-xs text-stone-500">Breakdown of shipments across carriers in the active date range.</p>
              </div>
            </div>

            {/* Mobile Courier Matrix Cards (< md) */}
            <div className="block md:hidden divide-y divide-stone-200/70">
              {courierMatrix.map((row) => (
                <div key={row.courier} className="py-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <CourierBadge courier={row.courier} />
                    <span className="font-mono font-bold text-xs text-stone-900 bg-stone-100 px-2.5 py-1 rounded">
                      {row.rate}% Delivery Rate
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <span className="text-[10px] text-stone-500 block">Total</span>
                      <span className="font-mono font-bold text-stone-900">{row.total}</span>
                    </div>
                    <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <span className="text-[10px] text-emerald-700 block">Delivered</span>
                      <span className="font-mono font-bold text-emerald-700">{row.delivered}</span>
                    </div>
                    <div className="bg-sky-50/60 p-2 rounded-lg border border-sky-100">
                      <span className="text-[10px] text-sky-700 block">In Transit</span>
                      <span className="font-mono font-bold text-sky-700">{row.inTransit}</span>
                    </div>
                  </div>
                  {(row.exception > 0 || row.rto > 0 || row.ofd > 0) && (
                    <div className="flex items-center gap-2 text-[11px] text-stone-600 flex-wrap">
                      {row.ofd > 0 && <span className="text-amber-700">OFD: <strong>{row.ofd}</strong></span>}
                      {row.exception > 0 && <span className="text-rose-600">Exceptions: <strong>{row.exception}</strong></span>}
                      {row.rto > 0 && <span className="text-purple-700">RTO: <strong>{row.rto}</strong></span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Courier Matrix Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Courier</th>
                    <th className="py-3 px-4">Total Shipments</th>
                    <th className="py-3 px-4">Delivered</th>
                    <th className="py-3 px-4">Out for Delivery</th>
                    <th className="py-3 px-4">In Transit</th>
                    <th className="py-3 px-4">Pending</th>
                    <th className="py-3 px-4">Exceptions</th>
                    <th className="py-3 px-4">RTO</th>
                    <th className="py-3 px-4 text-right">Delivery Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {courierMatrix.map((row) => (
                    <tr key={row.courier} className="hover:bg-stone-50/50 transition">
                      <td className="py-3 px-4 font-bold text-stone-900 flex items-center gap-2">
                        <CourierBadge courier={row.courier} />
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">{row.total}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold font-mono">{row.delivered}</td>
                      <td className="py-3 px-4 text-amber-700 font-semibold font-mono">{row.ofd}</td>
                      <td className="py-3 px-4 text-sky-700 font-semibold font-mono">{row.inTransit}</td>
                      <td className="py-3 px-4 text-slate-600 font-semibold font-mono">{row.pending}</td>
                      <td className="py-3 px-4 text-rose-600 font-semibold font-mono">{row.exception}</td>
                      <td className="py-3 px-4 text-purple-700 font-semibold font-mono">{row.rto}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-stone-900">{row.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALL SHIPMENTS */}
      {subTab === "all" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Order #, AWB, Customer name, Phone, or City..."
                  className="w-full h-10 pl-9 pr-4 rounded-lg border border-stone-200 bg-stone-50/50 text-xs focus:outline-none focus:border-stone-900"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={courierFilter}
                  onChange={(e) => setCourierFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 focus:outline-none focus:border-stone-900"
                >
                  <option value="all">All Couriers</option>
                  <option value="Delhivery">Delhivery</option>
                  <option value="Blue Dart">Blue Dart</option>
                  <option value="Shree Maruti">Shree Maruti</option>
                  <option value="DTDC">DTDC</option>
                  <option value="India Post">India Post</option>
                  <option value="Ekart">Ekart</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 focus:outline-none focus:border-stone-900"
                >
                  <option value="all">All Statuses</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Out for delivery">Out for Delivery</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Pending">Pending</option>
                  <option value="Exception">Exception</option>
                  <option value="delayed">Delayed</option>
                  <option value="rto">RTO</option>
                </select>
              </div>
            </div>

            {/* Selection Toolbar if rows selected */}
            {selectedOrderIds.length > 0 && (
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800">
                  {selectedOrderIds.length} shipment{selectedOrderIds.length > 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedOrderIds([])}
                    className="text-stone-500 hover:text-stone-800"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={() => setIsLabelModalOpen(true)}
                    className="px-3 py-1 bg-stone-900 text-white rounded text-xs font-semibold hover:bg-stone-800"
                  >
                    Print Selected ({selectedOrderIds.length})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Operational Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            {/* Mobile Shipments Cards (< md) */}
            <div className="block md:hidden divide-y divide-stone-200">
              {allShipmentsFiltered.length === 0 ? (
                <div className="py-12 text-center text-stone-400 p-4">
                  <Package className="h-10 w-10 mx-auto text-stone-300 mb-2" />
                  <p className="font-semibold text-stone-700 text-sm">No shipments matching criteria</p>
                  <p className="text-xs mt-0.5">Try widening date range or clearing filters.</p>
                </div>
              ) : (
                allShipmentsFiltered.map((o) => {
                  const num = displayOrderNumber(o);
                  const op = getShipmentOperationalStatus(o);
                  const td = o.courierTrackingData;
                  const delay = checkDelayRule(o);
                  const isSelected = selectedOrderIds.includes(o.id);
                  const isRefreshing = refreshingOrderId === o.id;

                  return (
                    <div
                      key={o.id}
                      className={`p-4 space-y-3 bg-white transition ${isSelected ? "bg-stone-50/90" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOrder(o.id)}
                            className="rounded border-stone-300 h-4 w-4"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() => onOpenOrder(o)}
                              className="font-mono font-bold text-stone-900 text-sm hover:underline"
                            >
                              #{num}
                            </button>
                            <span className="text-[11px] text-stone-400 block font-mono">
                              {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <StatusBadge status={op} />
                          {delay.isDelayed && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertTriangle className="h-3 w-3" /> Delayed
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100">
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-stone-900 block truncate">
                            {o.address?.name || "Customer"}
                          </span>
                          <span className="text-[11px] text-stone-500 block truncate">
                            {o.address?.city || "-"}, {o.address?.state || ""}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <CourierBadge courier={o.courier} provider={td?.provider} />
                        </div>
                      </div>

                      {/* AWB + Tracking milestone */}
                      <div className="rounded-lg bg-stone-50 p-2.5 border border-stone-100 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-stone-500">AWB:</span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-stone-900 select-all">
                              {o.trackingId || "Pending"}
                            </span>
                            {o.trackingId && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(o.trackingId || "");
                                  toast.success(`AWB ${o.trackingId} copied`);
                                }}
                                className="text-stone-400 hover:text-stone-700 p-1"
                                title="Copy AWB"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {td?.currentLocation && (
                          <div className="flex items-center gap-1 text-[11px] text-stone-700 font-semibold truncate pt-0.5">
                            <MapPin className="h-3 w-3 text-stone-400 shrink-0" />
                            <span className="truncate">{td.currentLocation}</span>
                          </div>
                        )}
                        {td?.latestMessage && (
                          <p className="text-[10px] text-stone-500 truncate" title={td.latestMessage}>
                            {td.latestMessage}
                          </p>
                        )}
                      </div>

                      {/* Action buttons on mobile */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenOrder(o)}
                          className="flex-1 h-11 px-4 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition shadow-xs flex items-center justify-center cursor-pointer min-h-[44px]"
                        >
                          Manage Order
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingTrackingOrder(o)}
                          className="h-11 px-3.5 rounded-xl border border-stone-200 text-xs font-semibold hover:bg-stone-100 text-stone-700 transition flex items-center justify-center gap-1 min-h-[44px] cursor-pointer"
                          title="View tracking milestones"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Track</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefreshSingleTracking(o)}
                          disabled={isRefreshing}
                          className="h-11 px-3 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 transition disabled:opacity-50 flex items-center justify-center min-h-[44px] cursor-pointer"
                          title="Refresh tracking"
                        >
                          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-stone-900" : ""}`} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Operational Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          allShipmentsFiltered.length > 0 &&
                          selectedOrderIds.length === allShipmentsFiltered.length
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-stone-300"
                      />
                    </th>
                    <th className="py-3 px-3">Order #</th>
                    <th className="py-3 px-3">AWB / Courier</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Location & Milestone</th>
                    <th className="py-3 px-3">Last Synced</th>
                    <th className="py-3 px-3">SLA / Delay</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {allShipmentsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-stone-400">
                        <Package className="h-10 w-10 mx-auto text-stone-300 mb-2" />
                        <p className="font-semibold text-stone-700 text-sm">No shipments matching criteria</p>
                        <p className="text-xs mt-0.5">Try widening date range or clearing filters.</p>
                      </td>
                    </tr>
                  ) : (
                    allShipmentsFiltered.map((o) => {
                      const num = displayOrderNumber(o);
                      const op = getShipmentOperationalStatus(o);
                      const td = o.courierTrackingData;
                      const delay = checkDelayRule(o);
                      const isSelected = selectedOrderIds.includes(o.id);
                      const isRefreshing = refreshingOrderId === o.id;

                      return (
                        <tr
                          key={o.id}
                          className={`hover:bg-stone-50/70 transition ${isSelected ? "bg-stone-50" : ""}`}
                        >
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOrder(o.id)}
                              className="rounded border-stone-300"
                            />
                          </td>
                          <td className="py-3.5 px-3">
                            <button
                              onClick={() => onOpenOrder(o)}
                              className="font-mono font-bold text-stone-900 hover:underline hover:text-stone-700 block text-left"
                            >
                              #{num}
                            </button>
                            <span className="text-[10px] text-stone-400 block font-mono">
                              {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="space-y-1">
                              <CourierBadge courier={o.courier} provider={td?.provider} />
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-[11px] text-stone-800 font-semibold select-all">
                                  {o.trackingId || "Pending AWB"}
                                </span>
                                {o.trackingId && (
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(o.trackingId || "");
                                      toast.success(`AWB ${o.trackingId} copied`);
                                    }}
                                    className="text-stone-400 hover:text-stone-700"
                                    title="Copy AWB"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="font-bold text-stone-900 block truncate max-w-[140px]">
                              {o.address?.name || "Customer"}
                            </span>
                            <span className="text-[11px] text-stone-500 block truncate max-w-[140px]">
                              {o.address?.city || "-"}, {o.address?.state || ""}
                            </span>
                            {o.address?.phone && (
                              <span className="text-[10px] font-mono text-stone-400 block">{o.address.phone}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <StatusBadge status={op} />
                          </td>
                          <td className="py-3.5 px-3 max-w-[200px]">
                            <div className="truncate font-medium text-stone-800 text-[11px]">
                              {td?.currentLocation ? (
                                <span className="inline-flex items-center gap-1 text-stone-700 font-semibold">
                                  <MapPin className="h-3 w-3 text-stone-400" />
                                  {td.currentLocation}
                                </span>
                              ) : (
                                <span className="text-stone-400 italic">Location pending</span>
                              )}
                            </div>
                            <p className="text-[10px] text-stone-500 truncate mt-0.5" title={td?.latestMessage || ""}>
                              {td?.latestMessage || "Registered with courier"}
                            </p>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="text-[11px] font-mono text-stone-600 block">
                              {formatRelativeTime(o.courierTrackingLastFetchedAt || td?.lastUpdated)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            {delay.isDelayed ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title={delay.reason}
                              >
                                <AlertTriangle className="h-3 w-3" /> Delayed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="h-3 w-3" /> Normal
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setViewingTrackingOrder(o)}
                                className="p-1.5 rounded hover:bg-stone-200/80 text-stone-600 transition"
                                title="View tracking milestones"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleRefreshSingleTracking(o)}
                                disabled={isRefreshing}
                                className="p-1.5 rounded hover:bg-stone-200/80 text-stone-600 transition disabled:opacity-50"
                                title="Safe refresh tracking from courier"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-stone-900" : ""}`} />
                              </button>
                              <button
                                onClick={() => {
                                  try {
                                    const txt = generateOrderShippingPlainText(o);
                                    navigator.clipboard.writeText(txt);
                                    toast.success(`Shipping details for #${num} copied`);
                                  } catch {
                                    toast.error("Failed to copy details");
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-stone-200/80 text-stone-600 transition"
                                title="Copy plaintext shipping address"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onOpenOrder(o)}
                                className="px-2.5 py-1 bg-stone-900 text-white rounded text-[11px] font-semibold hover:bg-stone-800 transition ml-1"
                              >
                                Open
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TODAY'S DELIVERIES */}
      {subTab === "today" && (
        <div className="space-y-4">
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-bold text-emerald-950 text-sm">Today&apos;s Verified Deliveries</h3>
                <p className="text-xs text-emerald-800/80">
                  Parcels verified delivered today by courier scanning timestamp (distinguished from order placement date).
                </p>
              </div>
            </div>
            <span className="font-bold font-serif text-2xl text-emerald-900">{todayDeliveries.length}</span>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">AWB / Courier</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Delivered Time</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Latest Courier Confirmation</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {todayDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <CheckCircle2 className="h-10 w-10 mx-auto text-stone-300 mb-2" />
                        <p className="font-semibold text-stone-700 text-sm">No parcels delivered today yet</p>
                        <p className="text-xs mt-0.5">Parcels confirmed delivered today will automatically populate here.</p>
                      </td>
                    </tr>
                  ) : (
                    todayDeliveries.map((o) => {
                      const num = displayOrderNumber(o);
                      const delDate = getActualDeliveryDate(o);
                      const td = o.courierTrackingData;

                      return (
                        <tr key={o.id} className="hover:bg-stone-50/70 transition">
                          <td className="py-3.5 px-4 font-mono font-bold text-stone-900">#{num}</td>
                          <td className="py-3.5 px-4">
                            <CourierBadge courier={o.courier} provider={td?.provider} />
                            <span className="block font-mono text-[11px] text-stone-700 mt-0.5">{o.trackingId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-stone-900 block">{o.address?.name || "Customer"}</span>
                            <span className="text-[10px] font-mono text-stone-500">{o.address?.phone}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-emerald-800 font-semibold">
                            {delDate ? formatOrderPrintDate(delDate.getTime()) : "Today"}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-stone-900 font-medium">{o.address?.city}, {o.address?.state}</span>
                            <span className="block text-[10px] font-mono text-stone-500">{o.address?.pincode}</span>
                          </td>
                          <td className="py-3.5 px-4 text-stone-600 max-w-[220px] truncate" title={td?.latestMessage || ""}>
                            {td?.latestMessage || "Delivered to consignee"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setViewingTrackingOrder(o)}
                                className="h-7 px-2.5 rounded bg-stone-100 text-stone-700 text-[11px] font-semibold hover:bg-stone-200 inline-flex items-center gap-1"
                                title="View complete shipment journey"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Journey</span>
                              </button>
                              <button
                                onClick={() => onOpenOrder(o)}
                                className="h-7 px-2.5 rounded bg-stone-900 text-white text-[11px] font-semibold hover:bg-stone-800"
                              >
                                Manage Order
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DELAYED PARCELS */}
      {subTab === "delayed" && (
        <div className="space-y-4">
          <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-rose-700" />
              <div>
                <h3 className="font-bold text-rose-950 text-sm">Delayed Parcels & SLA Exceptions</h3>
                <p className="text-xs text-rose-800/80">
                  Deterministic delay detection: OFD &gt;24 hours, in-transit &gt;7 days, or carrier-flagged delivery exception.
                </p>
              </div>
            </div>
            <span className="font-bold font-serif text-2xl text-rose-900">{delayedParcels.length}</span>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">AWB / Courier</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Current Status</th>
                    <th className="py-3 px-4">Delay Reason</th>
                    <th className="py-3 px-4">Current Location</th>
                    <th className="py-3 px-4">Last Sync</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {delayedParcels.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400">
                        <Check className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
                        <p className="font-semibold text-stone-700 text-sm">No delayed parcels</p>
                        <p className="text-xs mt-0.5">All active shipments are moving within standard delivery SLAs.</p>
                      </td>
                    </tr>
                  ) : (
                    delayedParcels.map((o) => {
                      const num = displayOrderNumber(o);
                      const delay = checkDelayRule(o);
                      const td = o.courierTrackingData;

                      return (
                        <tr key={o.id} className="hover:bg-stone-50/70 transition">
                          <td className="py-3.5 px-4 font-mono font-bold text-stone-900">#{num}</td>
                          <td className="py-3.5 px-4">
                            <CourierBadge courier={o.courier} provider={td?.provider} />
                            <span className="block font-mono text-[11px] text-stone-700 mt-0.5">{o.trackingId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-stone-900 block">{o.address?.name || "Customer"}</span>
                            <span className="text-[10px] text-stone-500">{o.address?.city}, {o.address?.state}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={getShipmentOperationalStatus(o)} />
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 font-semibold block text-[11px]">
                              {delay.reason}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-stone-800">{td?.currentLocation || "Unknown"}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-stone-500">
                            {formatRelativeTime(o.courierTrackingLastFetchedAt || td?.lastUpdated)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setViewingTrackingOrder(o)}
                                className="h-7 px-2 rounded bg-stone-100 text-stone-700 text-[11px] font-semibold hover:bg-stone-200 inline-flex items-center gap-1"
                                title="View complete shipment journey"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Journey</span>
                              </button>
                              <button
                                onClick={() => handleRefreshSingleTracking(o)}
                                disabled={refreshingOrderId === o.id}
                                className="h-7 px-2 rounded bg-stone-100 text-stone-700 text-[11px] font-semibold hover:bg-stone-200 disabled:opacity-50"
                              >
                                {refreshingOrderId === o.id ? "Refreshing..." : "Refresh"}
                              </button>
                              <button
                                onClick={() => onOpenOrder(o)}
                                className="h-7 px-2.5 rounded bg-stone-900 text-white text-[11px] font-semibold hover:bg-stone-800"
                              >
                                Manage
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RTO HUB */}
      {subTab === "rto" && (
        <div className="space-y-4">
          <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RotateCcw className="h-5 w-5 text-purple-700" />
              <div>
                <h3 className="font-bold text-purple-950 text-sm">Return to Origin (RTO) Hub</h3>
                <p className="text-xs text-purple-800/80">
                  Monitoring undeliverable shipments returning back to Shri Radha Govind Store warehouse.
                </p>
              </div>
            </div>
            <span className="font-bold font-serif text-2xl text-purple-900">{rtoOrders.length}</span>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">AWB / Courier</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">RTO Status</th>
                    <th className="py-3 px-4">Carrier Notes / Reason</th>
                    <th className="py-3 px-4">Last Carrier Update</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {rtoOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <Check className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
                        <p className="font-semibold text-stone-700 text-sm">Zero RTO Shipments</p>
                        <p className="text-xs mt-0.5">No parcels are currently flagged as returning to origin.</p>
                      </td>
                    </tr>
                  ) : (
                    rtoOrders.map(({ order: o, rto }) => {
                      const num = displayOrderNumber(o);
                      const td = o.courierTrackingData;

                      let rtoBadge = <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">RTO Initiated</span>;
                      if (rto === "in_transit") {
                        rtoBadge = <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-semibold">RTO In Transit</span>;
                      } else if (rto === "returned") {
                        rtoBadge = <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">RTO Returned</span>;
                      }

                      return (
                        <tr key={o.id} className="hover:bg-stone-50/70 transition">
                          <td className="py-3.5 px-4 font-mono font-bold text-stone-900">#{num}</td>
                          <td className="py-3.5 px-4">
                            <CourierBadge courier={o.courier} provider={td?.provider} />
                            <span className="block font-mono text-[11px] text-stone-700 mt-0.5">{o.trackingId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-stone-900 block">{o.address?.name || "Customer"}</span>
                            <span className="text-[10px] text-stone-500">{o.address?.city}, {o.address?.state}</span>
                          </td>
                          <td className="py-3.5 px-4">{rtoBadge}</td>
                          <td className="py-3.5 px-4 text-stone-700 max-w-[240px] truncate" title={td?.latestMessage || o.holdReason || ""}>
                            {td?.latestMessage || o.holdReason || "Undelivered by courier"}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-stone-500">
                            {formatRelativeTime(o.courierTrackingLastFetchedAt || td?.lastUpdated)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setViewingTrackingOrder(o)}
                                className="h-7 px-2.5 rounded bg-stone-100 text-stone-700 text-[11px] font-semibold hover:bg-stone-200 inline-flex items-center gap-1"
                                title="View complete shipment journey"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Journey</span>
                              </button>
                              <button
                                onClick={() => onOpenOrder(o)}
                                className="h-7 px-2.5 rounded bg-stone-900 text-white text-[11px] font-semibold hover:bg-stone-800"
                              >
                                Manage Order
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DAILY REPORTS */}
      {subTab === "reports" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
            <h3 className="font-serif text-lg font-bold text-stone-900">Daily Operations Summary</h3>
            <p className="text-xs text-stone-500 mt-0.5">Aggregated dispatch and delivery performance grouped by day.</p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Shipments Created</th>
                    <th className="py-3 px-4">In Transit</th>
                    <th className="py-3 px-4">Out for Delivery</th>
                    <th className="py-3 px-4">Delivered</th>
                    <th className="py-3 px-4">Exceptions</th>
                    <th className="py-3 px-4">RTO</th>
                    <th className="py-3 px-4 text-right">Delivery Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/70">
                  {dailyReports.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400">
                        <Calendar className="h-10 w-10 mx-auto text-stone-300 mb-2" />
                        <p className="font-semibold text-stone-700 text-sm">No daily analytics in range</p>
                      </td>
                    </tr>
                  ) : (
                    dailyReports.map((row) => {
                      const rate = row.created > 0 ? Math.round((row.delivered / row.created) * 100) : 0;
                      return (
                        <tr key={row.dateStr} className="hover:bg-stone-50/70 transition">
                          <td className="py-3 px-4 font-bold text-stone-900 font-mono">{row.dateStr}</td>
                          <td className="py-3 px-4 font-mono font-semibold">{row.created}</td>
                          <td className="py-3 px-4 font-mono text-sky-700">{row.shipped}</td>
                          <td className="py-3 px-4 font-mono text-amber-700">{row.ofd}</td>
                          <td className="py-3 px-4 font-mono text-emerald-700 font-bold">{row.delivered}</td>
                          <td className="py-3 px-4 font-mono text-rose-700">{row.exception}</td>
                          <td className="py-3 px-4 font-mono text-purple-700">{row.rto}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                            {rate}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Label Print Modal */}
      {isLabelModalOpen && (
        <ShippingLabelsModal
          orders={selectedOrdersForLabel}
          onClose={() => setIsLabelModalOpen(false)}
        />
      )}

      {/* Tracking Checkpoints Drawer Modal */}
      {viewingTrackingOrder && (
        <TrackingDrawerModal
          order={orders.find((x) => x.id === viewingTrackingOrder.id) || viewingTrackingOrder}
          onClose={() => setViewingTrackingOrder(null)}
          onOpenOrder={(o) => {
            setViewingTrackingOrder(null);
            onOpenOrder(o);
          }}
          onRefresh={(o) => handleRefreshSingleTracking(o)}
          isRefreshing={refreshingOrderId === viewingTrackingOrder.id}
        />
      )}
    </div>
  );
}
