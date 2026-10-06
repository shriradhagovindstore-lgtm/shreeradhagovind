import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useStore,
  displayOrderNumber,
  formatINR,
  isRefundPending,
  isOrderRefunded,
  type Order,
  type Settings,
  type Courier,
  type RegisteredUser,
  type CourierEvent,
  type Category,
  type Blog,
  COURIERS,
} from "@/lib/store";
import { type Product } from "@/lib/products";
import { api, isApiEnabled, API_URL, getToken } from "@/lib/api";
import { getCourierTrackingUrl } from "@/lib/courier";
import { SimpleRichEditor, FormattedText } from "@/components/SimpleRichEditor";
import { DeliveryOperationsView } from "@/components/DeliveryOperationsView";
import { InventoryManager } from "@/components/InventoryManager";
import { ConversionAnalyticsPanel } from "@/components/admin/ConversionAnalyticsPanel";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { RetentionLoyaltyManager } from "@/components/admin/RetentionLoyaltyManager";
import { ReturnsManager } from "@/components/admin/ReturnsManager";
import { SupportManager } from "@/components/admin/SupportManager";
import { slugify } from "@/lib/seo";
import { toast } from "sonner";
import {
  Lock,
  LifeBuoy,
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  IndianRupee,
  TrendingUp,
  Users,
  Tag,
  Percent,
  CreditCard,
  Settings as SettingsIcon,
  Truck,
  Check,
  X as XIcon,
  ShieldOff,
  ShieldCheck,
  RefreshCw,
  Mail,
  Phone,
  UploadCloud,
  FileText,
  GripVertical,
  Search,
  ExternalLink,
  MapPin,
  Calendar,
  Eye,
  EyeOff,
  Copy,
  Download,
  ArrowLeft,
  ArrowUpRight,
  BookmarkCheck,
  Globe,
  AlertTriangle,
  History,
  Clock,
  Pause,
  Play,
  MessageCircle,
  Star,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Filter,
  ArrowRight,
  ChevronRight,
  Info,
  Layers,
  Send,
  Award,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminRoot,
  head: () => ({
    meta: [
      { title: "Admin  -  Shri Radha Govind Store" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type Tab =
  | "dash"
  | "products"
  | "inventory"
  | "orders"
  | "returns"
  | "support"
  | "delivery"
  | "categories"
  | "coupons"
  | "retention"
  | "blogs"
  | "users"
  | "finance"
  | "payments"
  | "analytics"
  | "reviews"
  | "settings";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
const getErrorMessage = errorMessage;

export { isRefundPending, isOrderRefunded };

function paymentBadgeClass(status: Order["payment"]["status"], o?: Order) {
  if (o && isRefundPending(o)) return "bg-amber-500/15 text-amber-800 border border-amber-300 font-semibold";
  if (status === "paid") return "bg-green-600/10 text-green-700";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  if (status === "refunded") return "bg-[var(--primary)]/10 text-[var(--primary)]";
  return "bg-amber-500/10 text-amber-700";
}

function getPaymentReasonDetails(o: Order) {
  const status = o.payment?.status;
  if (status === "refunded") {
    return {
      text: o.refund?.upiReference ? `Refunded (UPI Ref: ${o.refund.upiReference})` : "Refunded",
      className: "text-[var(--primary)] font-medium",
    };
  }
  if (isRefundPending(o)) {
    return {
      text: "Paid / Refund Pending",
      className: "text-amber-700 font-semibold",
    };
  }
  if (status === "paid") {
    return {
      text: o.payment?.method === "razorpay" ? "Paid / Captured" : "Paid",
      className: "text-green-700 font-medium",
    };
  }
  if (status === "failed") {
    const rawReason = o.payment?.failureReason?.trim();
    return {
      text: rawReason || "Payment failed — reason not provided by payment gateway",
      className: "text-destructive font-medium",
    };
  }
  return {
    text: "Awaiting payment confirmation",
    className: "text-amber-700 font-medium",
  };
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

async function downloadOrderInvoicePdf(order: Order) {
  try {
    const token = getToken();
    const orderNum = displayOrderNumber(order);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/admin/orders/${order.id}/invoice`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to download invoice (${res.status})`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice-${orderNum}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success(`Invoice for Order #${orderNum} downloaded`);
  } catch (err: any) {
    toast.error(err?.message || "Failed to download invoice");
  }
}

function generateOrderShippingPlainText(order: Order): string {
  const lines: string[] = [];
  const name = (order.address?.name || "").trim() || "Customer";
  lines.push(name);

  if (order.address?.line1?.trim()) {
    lines.push(order.address.line1.trim());
  }
  if (order.address?.line2?.trim()) {
    lines.push(order.address.line2.trim());
  }
  if (order.address?.postOffice?.trim()) {
    lines.push(order.address.postOffice.trim());
  }

  const city = (order.address?.city || "").trim();
  const pincode = (order.address?.pincode || "").trim();
  if (city && pincode) {
    lines.push(`${city} - ${pincode}`);
  } else if (city) {
    lines.push(city);
  } else if (pincode) {
    lines.push(pincode);
  }

  if (order.address?.state?.trim()) {
    lines.push(order.address.state.trim());
  }

  const phone = (order.address?.phone || "").trim();
  if (phone) {
    lines.push(`Phone: ${phone}`);
  }

  const altPhone = (order.address?.alternatePhone || order.alternatePhone || "").trim();
  if (altPhone && altPhone !== phone) {
    lines.push(`Alt No.: ${altPhone}`);
  }

  const num = displayOrderNumber(order);
  lines.push(`Order No. #${num}`);

  return lines.join("\n");
}

function formatOrderPaymentMethod(method?: string, status?: string) {
  const m = method
    ? method.toLowerCase() === "razorpay"
      ? "Razorpay"
      : method.toUpperCase()
    : "COD";
  const s = status
    ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
    : "Pending";
  return `${m} — ${s}`;
}

function normalizeIndianPhone(phone?: string | null): { valid: boolean; digits: string; reason?: string } {
  if (!phone || !phone.trim()) return { valid: false, digits: "", reason: "Phone number is missing" };
  const rawDigits = phone.replace(/\D/g, "");
  if (rawDigits.length === 10) {
    return { valid: true, digits: `91${rawDigits}` };
  }
  if (rawDigits.length === 11 && rawDigits.startsWith("0")) {
    return { valid: true, digits: `91${rawDigits.slice(1)}` };
  }
  if (rawDigits.length === 12 && rawDigits.startsWith("91")) {
    return { valid: true, digits: rawDigits };
  }
  return { valid: false, digits: "", reason: "Customer phone is not a valid 10-digit mobile number" };
}

function buildWhatsAppOrderUrl(order: Order, template?: string): { url?: string; disabledReason?: string } {
  const phoneCheck = normalizeIndianPhone(order.address?.phone || (order as any).phone);
  if (!phoneCheck.valid) {
    return { disabledReason: phoneCheck.reason };
  }

  const firstName = (order.address?.name || "Customer").trim().split(/\s+/)[0] || "Customer";
  const orderId = `#${displayOrderNumber(order)}`;
  const trackingId = order.trackingId || "Pending";
  const courierService = order.courier || "Standard Delivery";
  const PRODUCTION_DOMAIN = "https://www.shriradhagovindstore.com";
  const orderNumber = displayOrderNumber(order);
  const storeTrackingLink = `${PRODUCTION_DOMAIN}/track?order=${encodeURIComponent(orderNumber)}`;
  const trackingLink =
    order.courierTrackingUrl?.trim() ||
    (order.trackingId ? getCourierTrackingUrl(order.courier, order.trackingId) : "") ||
    storeTrackingLink;

  const defaultTpl =
    "🙏 Hare Krishna {{FIRST_NAME}},\n\n" +
    "Your order {{ORDER_ID}} has been shipped.\n\n" +
    "Tracking ID: {{TRACKING_ID}}\n" +
    "Courier: {{SHIPPING_SERVICE}}\n" +
    "Track: {{TRACKING_LINK}}\n\n" +
    "Thank you for shopping with Shri Radha Govind Store.\n\n" +
    "Hare Krishna 🙏";

  const raw = template && template.trim() ? template.trim() : defaultTpl;
  // Normalize Windows CRLF, carriage returns, and escaped \n to real newlines \n
  const normalizedTpl = raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const msg = normalizedTpl
    .replace(/{{FIRST_NAME}}/g, firstName)
    .replace(/{{ORDER_ID}}/g, orderId)
    .replace(/{{TRACKING_ID}}/g, trackingId)
    .replace(/{{SHIPPING_SERVICE}}/g, courierService)
    .replace(/{{TRACKING_LINK}}/g, trackingLink);

  return {
    url: `https://api.whatsapp.com/send?phone=${phoneCheck.digits}&text=${encodeURIComponent(msg)}`,
  };
}

function WhatsAppCustomerButton({
  order,
  template,
  variant = "sm",
}: {
  order: Order;
  template?: string;
  variant?: "sm" | "md";
}) {
  const res = buildWhatsAppOrderUrl(order, template);
  if (!res.url) {
    return (
      <span
        title={res.disabledReason || "No valid phone number available"}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground/60 text-xs font-semibold cursor-not-allowed opacity-60 ${
          variant === "md" ? "h-11 px-4" : "h-9 px-3"
        }`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>WhatsApp</span>
      </span>
    );
  }
  return (
    <a
      href={res.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-600/50 text-xs font-semibold transition shadow-sm ${
        variant === "md" ? "h-11 px-4" : "h-9 px-3"
      }`}
      title="Open WhatsApp chat with customer in new tab"
    >
      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
      <span>WhatsApp</span>
    </a>
  );
}

function AdminRoot() {
  const {
    adminAuthed,
    adminLogin,
    adminLogout,
    adminProducts,
    refreshProducts,
    refreshCategories,
    saveProduct,
    deleteProduct,
    orders,
    updateOrderTracking,
    categories,
    categoryDetails,
    categoryTree,
    adminCategoryTree,
    saveCategory,
    deleteCategory,
    reorderCategories,
    blogs,
    saveBlog,
    deleteBlog,
    registeredUsers,
    fetchRegisteredUsers,
    toggleUserBlock,
    fetchOrderEvents,
    settings,
    updateSettings,
    refreshOrders,
  } = useStore();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [tab, setTab] = useState<Tab>("dash");
  const [editing, setEditing] = useState<Product | null>(null);
  const [pickCat, setPickCat] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewUser, setViewUser] = useState<RegisteredUser | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [fulfillingInvoiceOrder, setFulfillingInvoiceOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (adminAuthed) {
      fetchProductsSafely();
      if (tab === "users") fetchRegisteredUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminAuthed, tab]);

  const fetchProductsSafely = () => {
    refreshProducts().catch(() => {});
    refreshCategories(true).catch(() => {});
  };

  if (!adminAuthed) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--primary)] text-white p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <img
              src="/brand-logo-large.png"
              alt="Shri Radha Govind Store"
              className="h-14 w-14 rounded-full object-cover ring-2 ring-accent/70"
            />
            <span className="font-display text-2xl">Store Admin</span>
          </div>
          <div className="bg-white text-[var(--foreground)] rounded-lg border border-border p-8 premium-shadow">
            <Lock className="h-8 w-8 text-primary mx-auto" />
            <h1 className="font-display text-2xl text-center mt-3">Secure Admin Access</h1>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Authorized personnel only
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const user = String(fd.get("user") ?? u).trim();
                const pass = String(fd.get("pass") ?? p);
                adminLogin(user, pass);
              }}
              className="space-y-3 mt-6"
            >
              <input
                name="user"
                autoComplete="username"
                value={u}
                onChange={(e) => setU(e.target.value)}
                placeholder="Email or username"
                className="w-full h-11 rounded-lg border px-3 bg-background focus:outline-none focus:border-primary"
              />
              <input
                name="pass"
                autoComplete="current-password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                type="password"
                placeholder="Password"
                className="w-full h-11 rounded-lg border px-3 bg-background focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium"
              >
                Sign in
              </button>
            </form>
            <Link
              to="/"
              className="block text-center text-xs text-muted-foreground mt-4 hover:text-primary"
            >
              Back to store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const revenue = (orders || []).reduce((s, o) => s + (Number(o?.total) || 0), 0);
  const pending = (orders || []).filter((o) => o?.status !== "Delivered").length;

  const openNewProduct = () => setPickCat("");

  const createWithCategory = (category: string) => {
    setPickCat(null);
    setEditing({
      id: "",
      name: "",
      category,
      price: 0,
      mrp: 0,
      rating: 5,
      reviews: 1,
      image: "",
      images: [],
      featuredDeal: false,
      description: "",
      details: [],
      stock: 100,
      hsnCode: "",
      gstRate: 0,
      gstInclusive: true,
      isTaxable: true,
      metaTitle: "",
      metaDescription: "",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f8f8] md:flex-row font-sans">
      <aside className="w-full bg-white border-r border-stone-200 text-stone-800 p-4 flex flex-col md:sticky md:top-0 md:h-screen md:w-64 md:p-5 shadow-xs z-20">
        <div className="flex items-center gap-3 mb-4 md:mb-8 pb-4 border-b border-stone-100">
          <img
            src="/brand-logo-large.png"
            alt="Shri Radha Govind Store"
            className="h-10 w-10 rounded-full object-cover ring-1 ring-stone-200"
          />
          <div>
            <span className="block font-serif text-base font-bold text-stone-900 leading-tight">Admin Console</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">
              Shri Radha Govind
            </span>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-2 md:block md:space-y-4 md:overflow-visible md:pb-0 md:flex-1">
          <div>
            <span className="hidden md:block px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              STORE
            </span>
            <div className="flex md:block space-x-1 md:space-x-0 md:space-y-1">
              <NavBtn active={tab === "dash"} onClick={() => setTab("dash")} icon={LayoutDashboard}>
                Dashboard
              </NavBtn>
              <NavBtn active={tab === "products"} onClick={() => setTab("products")} icon={Package}>
                Products
              </NavBtn>
              <NavBtn active={tab === "inventory"} onClick={() => setTab("inventory")} icon={Boxes}>
                Inventory
              </NavBtn>
              <NavBtn active={tab === "categories"} onClick={() => setTab("categories")} icon={Tag}>
                Categories
              </NavBtn>
              <NavBtn active={tab === "coupons"} onClick={() => setTab("coupons")} icon={Percent}>
                Coupons & Promos
              </NavBtn>
              <NavBtn active={tab === "orders"} onClick={() => setTab("orders")} icon={ShoppingCart}>
                Orders
              </NavBtn>
              <NavBtn active={tab === "returns"} onClick={() => setTab("returns")} icon={RotateCcw}>
                Returns & Refunds
              </NavBtn>
              <NavBtn active={tab === "support"} onClick={() => setTab("support")} icon={LifeBuoy}>
                Customer Support
              </NavBtn>
              <NavBtn active={tab === "delivery"} onClick={() => setTab("delivery")} icon={Truck}>
                Delivery Operations
              </NavBtn>
              <NavBtn active={tab === "users"} onClick={() => setTab("users")} icon={Users}>
                Customers
              </NavBtn>
              <NavBtn active={tab === "retention"} onClick={() => setTab("retention")} icon={Award}>
                Retention & Loyalty
              </NavBtn>
            </div>
          </div>

          <div>
            <span className="hidden md:block px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              CONTENT
            </span>
            <div className="flex md:block space-x-1 md:space-x-0 md:space-y-1">
              <NavBtn active={tab === "blogs"} onClick={() => setTab("blogs")} icon={FileText}>
                Blog
              </NavBtn>
              <NavBtn active={tab === "reviews"} onClick={() => setTab("reviews")} icon={Star}>
                Product Reviews
              </NavBtn>
            </div>
          </div>

          <div>
            <span className="hidden md:block px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              FINANCE
            </span>
            <div className="flex md:block space-x-1 md:space-x-0 md:space-y-1">
              <NavBtn active={tab === "finance"} onClick={() => setTab("finance")} icon={IndianRupee}>
                Finance & Analytics
              </NavBtn>
              <NavBtn active={tab === "payments"} onClick={() => setTab("payments")} icon={CreditCard}>
                Payments
              </NavBtn>
              <NavBtn active={tab === "analytics"} onClick={() => setTab("analytics")} icon={TrendingUp}>
                Conversion Analytics
              </NavBtn>
            </div>
          </div>

          <div>
            <span className="hidden md:block px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
              STORE SETTINGS
            </span>
            <div className="flex md:block space-x-1 md:space-x-0 md:space-y-1">
              <NavBtn
                active={tab === "settings"}
                onClick={() => setTab("settings")}
                icon={SettingsIcon}
              >
                Settings
              </NavBtn>
            </div>
          </div>
        </nav>
        <div className="mt-3 flex items-center gap-4 border-t border-stone-200 pt-3 md:block">
          <button
            onClick={adminLogout}
            className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 py-2 font-medium transition"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
          <Link
            to="/"
            className="text-xs text-stone-500 hover:text-stone-900 md:mt-1 md:block font-medium transition"
          >
            View storefront ↗
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10 overflow-x-hidden">
        {tab === "dash" && (
          <div>
            <section className="rounded-xl bg-white border border-stone-200 p-6 text-stone-900 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">
                Business Management Console
              </p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-serif text-3xl font-bold text-stone-900">Store Overview</h1>
                  <p className="mt-1 text-sm text-stone-500">
                    Manage your store, orders, products, finances, and customer activity.
                  </p>
                </div>
                <Link
                  to="/"
                  className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs"
                >
                  View storefront ↗
                </Link>
              </div>
            </section>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <Stat icon={IndianRupee} label="Total Sales" value={formatINR(revenue)} />
              <Stat icon={ShoppingCart} label="Orders" value={String(orders.length)} />
              <Stat icon={TrendingUp} label="Pending Orders" value={String(pending)} />
              <Stat icon={Package} label="Products" value={String(adminProducts.length)} />
            </div>
            <div className="mt-8 bg-white rounded-lg border border-border p-6 premium-shadow">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Operations
                  </p>
                  <h2 className="font-display text-2xl">Recent Orders</h2>
                </div>
                <button
                  onClick={() => setTab("orders")}
                  className="h-9 rounded-md border border-border px-3 text-sm font-semibold hover:border-primary"
                >
                  Manage orders
                </button>
              </div>
              {orders.slice(0, 5).length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-2">ID</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="py-3">#{displayOrderNumber(o)}</td>
                        <td>{o.address?.name || "Customer"}</td>
                        <td>{formatINR(o.total)}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {o.status || "Placed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "categories" && (
          <CategoryManager
            categories={categoryDetails}
            tree={adminCategoryTree}
            products={adminProducts}
            onSave={saveCategory}
            onDelete={deleteCategory}
            onReorder={reorderCategories}
          />
        )}

        {tab === "blogs" && <BlogManager blogs={blogs} onSave={saveBlog} onDelete={deleteBlog} />}

        {tab === "products" && (
          <div>
            <div className="flex items-center justify-between">
              <h1 className="font-display text-3xl">Products</h1>
              <button
                onClick={openNewProduct}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </div>
            <div className="mt-6 bg-white rounded-lg border border-border premium-shadow overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-muted-foreground text-xs uppercase tracking-wider bg-muted/40">
                  <tr>
                    <th className="p-4">Product</th>
                    <th>Category</th>
                    <th>Selling Price</th>
                    <th>Cost Price</th>
                    <th>HSN / GST</th>
                    <th>Stock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {adminProducts.map((pr) => (
                    <tr key={pr.id} className="border-t hover:bg-stone-50/50 transition">
                      <td className="p-4 flex items-center gap-3">
                        <img src={pr.image} className="h-12 w-12 rounded-lg object-cover" alt="" />
                        <span className="font-medium line-clamp-1 max-w-xs">{pr.name}</span>
                      </td>
                      <td>{pr.category}</td>
                      <td className="font-medium text-stone-900">{formatINR(pr.price)}</td>
                      <td className="text-xs text-stone-600 font-mono">
                        {pr.costPrice ? formatINR(pr.costPrice) : "₹0"}
                      </td>
                      <td className="text-xs">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-muted-foreground font-medium">
                            {pr.hsnCode ? pr.hsnCode : "-"}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-semibold">
                            {pr.gstRate !== undefined && pr.gstRate !== null ? `${pr.gstRate}%` : "0%"}
                          </span>
                        </div>
                      </td>
                      <td>{pr.stock}</td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditing(pr)}
                            className="p-2 hover:bg-muted rounded-lg"
                            title="Edit product"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Delete this product?")) deleteProduct(pr.id);
                            }}
                            className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg"
                            title="Delete product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pickCat !== null && (
              <CategoryPicker
                tree={adminCategoryTree}
                categories={categories}
                onPick={createWithCategory}
                onClose={() => setPickCat(null)}
              />
            )}
            {editing && (
              <ProductEditor
                product={editing}
                tree={adminCategoryTree}
                categories={categories}
                onClose={() => setEditing(null)}
                onSave={async (p) => {
                  await saveProduct(p);
                  setEditing(null);
                }}
              />
            )}
          </div>
        )}

        {tab === "inventory" && <InventoryManager onStockUpdated={fetchProductsSafely} />}

        {tab === "orders" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl">Orders</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Manage customer orders, assign real courier tracking IDs, update fulfillment statuses, and auto-notify customers.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {orders.length} Total Orders
                </span>
              </div>
            </div>

            {/* ---- Search & Filter Toolbar ---- */}
            <div className="mt-6 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search by Order #5001, Customer name, Phone, or Tracking ID / AWB..."
                  className="w-full h-11 pl-9 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:border-primary"
                />
                {orderSearch && (
                  <button
                    onClick={() => setOrderSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {["all", "Placed", "Confirmed", "Processing", "Hold", "Packed", "Shipped", "Out for delivery", "Delivered", "Cancelled"].map(
                  (st) => {
                    const active = orderStatusFilter === st;
                    const count = st === "all" ? orders.length : orders.filter((o) => o.status === st).length;
                    return (
                      <button
                        key={st}
                        onClick={() => setOrderStatusFilter(st)}
                        className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {st === "all" ? "All Orders" : st} ({count})
                      </button>
                    );
                  },
                )}
                {(() => {
                  const pendingInvoiceCount = orders.filter((o) => o.invoiceRequest?.status === "pending").length;
                  const active = orderStatusFilter === "invoice_requests";
                  return (
                    <button
                      key="invoice_requests"
                      onClick={() => setOrderStatusFilter("invoice_requests")}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition border flex items-center gap-1.5 ${
                        active
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : pendingInvoiceCount > 0
                          ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>Invoice Requests</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          active
                            ? "bg-white text-amber-900"
                            : pendingInvoiceCount > 0
                            ? "bg-amber-200 text-amber-900"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {pendingInvoiceCount}
                      </span>
                    </button>
                  );
                })()}
                {(() => {
                  const refundPendingCount = orders.filter(isRefundPending).length;
                  const active = orderStatusFilter === "refund_pending";
                  return (
                    <button
                      key="refund_pending"
                      onClick={() => setOrderStatusFilter("refund_pending")}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition border flex items-center gap-1.5 ${
                        active
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : refundPendingCount > 0
                          ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>Refund Pending</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          active
                            ? "bg-white text-amber-900"
                            : refundPendingCount > 0
                            ? "bg-amber-200 text-amber-900"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {refundPendingCount}
                      </span>
                    </button>
                  );
                })()}
                {(() => {
                  const refundedCount = orders.filter(isOrderRefunded).length;
                  const active = orderStatusFilter === "refunded";
                  return (
                    <button
                      key="refunded"
                      onClick={() => setOrderStatusFilter("refunded")}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition border flex items-center gap-1.5 ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : refundedCount > 0
                          ? "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
                          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>Refunded</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          active
                            ? "bg-white text-emerald-900"
                            : refundedCount > 0
                            ? "bg-emerald-200 text-emerald-900"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {refundedCount}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* ---- Orders List ---- */}
            <div className="mt-6 space-y-4">
              {(() => {
                const q = orderSearch.trim().toLowerCase().replace(/^#/, "");
                const filtered = (orders || []).filter((o) => {
                  if (orderStatusFilter === "invoice_requests") {
                    if (o.invoiceRequest?.status !== "pending") return false;
                  } else if (orderStatusFilter === "refund_pending") {
                    if (!isRefundPending(o)) return false;
                  } else if (orderStatusFilter === "refunded") {
                    if (!isOrderRefunded(o)) return false;
                  } else if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) {
                    return false;
                  }
                  if (!q) return true;
                  const numStr = displayOrderNumber(o).toLowerCase();
                  const nameStr = (o.address?.name || "").toLowerCase();
                  const phoneStr = (o.address?.phone || "").toLowerCase();
                  const trackingStr = (o.trackingId || "").toLowerCase();
                  const courierStr = (o.courier || "").toLowerCase();
                  return (
                    numStr.includes(q) ||
                    nameStr.includes(q) ||
                    phoneStr.includes(q) ||
                    trackingStr.includes(q) ||
                    courierStr.includes(q)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white rounded-lg border border-border p-12 text-center text-muted-foreground">
                      <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="font-medium text-base text-foreground">No orders matching your search</p>
                      <p className="text-xs mt-1">Try searching with a different order number, tracking ID, or filter.</p>
                    </div>
                  );
                }

                return filtered.map((o) => {
                  const customerName = o.address?.name || "Customer";
                  const dateStr = formatOrderPrintDate(o.createdAt);
                  const paymentMethodStr = o.payment?.method === "razorpay" ? "Online (Razorpay)" : "Cash on Delivery (COD)";
                  const paymentStatusStr = (o.payment?.status || "pending").toUpperCase();
                  const grandTotalStr = formatINR(o.total);

                  return (
                    <div
                      key={o.id}
                      className="bg-white rounded-xl border border-border p-4 sm:p-5 shadow-sm hover:border-primary/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans select-text"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold text-base sm:text-lg text-foreground">
                            Order #{displayOrderNumber(o)}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              o.status === "Delivered"
                                ? "bg-green-600/10 text-green-700"
                                : o.status === "Cancelled"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-primary/10 text-primary"
                            }`}
                          >
                            {o.status || "Placed"}
                          </span>
                          {o.invoiceRequest?.status === "pending" && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 shadow-2xs">
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              <span>Invoice Requested</span>
                            </span>
                          )}
                          {o.invoiceRequest?.status === "fulfilled" && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 inline-flex items-center gap-1 shadow-2xs">
                              <CheckCircle2 className="h-3 w-3 text-teal-600" />
                              <span>Invoice Sent</span>
                            </span>
                          )}
                          {isRefundPending(o) && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1 shadow-2xs font-sans">
                              <Clock className="h-3 w-3 text-amber-700" />
                              <span>Refund Pending {formatINR(o.total)}</span>
                            </span>
                          )}
                          {isOrderRefunded(o) && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1 shadow-2xs font-sans">
                              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                              <span>Refunded {formatINR(o.refund?.amount || o.refundedAmount || o.total)}</span>
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            • Placed on {dateStr}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div>
                            <span className="text-muted-foreground">Customer: </span>
                            <span className="font-semibold text-foreground">{customerName}</span>
                            {o.address?.phone && <span className="text-muted-foreground ml-1">({o.address.phone})</span>}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Payment: </span>
                            <span className="font-medium text-foreground">{paymentMethodStr}</span>
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-semibold ${paymentBadgeClass(o.payment?.status, o)}`}>
                              {paymentStatusStr}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Grand Total</div>
                          <div className="font-display font-bold text-base sm:text-xl text-primary">
                            {grandTotalStr}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {o.invoiceRequest?.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => setFulfillingInvoiceOrder(o)}
                              className="h-9 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm"
                              title="Fulfill invoice request and dispatch to customer"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>Send Invoice</span>
                            </button>
                          )}
                          <WhatsAppCustomerButton order={o} template={settings.whatsappTemplate} variant="sm" />
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const txt = generateOrderShippingPlainText(o);
                                navigator.clipboard.writeText(txt);
                                toast.success(`Order #${displayOrderNumber(o)} shipping details copied`);
                              } catch {
                                toast.error("Failed to copy order details");
                              }
                            }}
                            className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted text-foreground transition inline-flex items-center gap-1.5 shadow-sm"
                            title="Copy minimal shipping address & order label to clipboard"
                          >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Copy Order Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadOrderInvoicePdf(o)}
                            className="h-9 px-3 rounded-lg border border-border bg-white text-xs font-semibold hover:bg-stone-50 text-stone-700 transition inline-flex items-center gap-1.5 shadow-xs"
                            title="Download Tax Invoice PDF"
                          >
                            <Download className="h-3.5 w-3.5 text-stone-600" />
                            <span>Invoice</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingOrder(o)}
                            className="h-9 px-4 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition shadow-xs"
                          >
                            Manage Order
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {tab === "delivery" && (
          <DeliveryOperationsView
            orders={orders}
            onOpenOrder={(o) => setEditingOrder(o)}
            onRefreshOrders={() => refreshOrders(true)}
          />
        )}

        {tab === "payments" && (
          <div>
            <h1 className="font-display text-3xl">Payments</h1>
            <p className="text-sm text-muted-foreground">
              All transactions recorded against orders.
            </p>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
              <Stat
                icon={IndianRupee}
                label="Total Received"
                value={formatINR(
                  (orders || [])
                    .filter((o) => o?.payment?.status === "paid" && o?.status !== "Cancelled")
                    .reduce((s, o) => s + (Number(o?.total) || 0), 0),
                )}
              />
              <Stat
                icon={IndianRupee}
                label="Pending / Processing"
                value={formatINR(
                  (orders || [])
                    .filter((o) => o?.payment?.status === "pending")
                    .reduce((s, o) => s + (Number(o?.total) || 0), 0),
                )}
              />
              <Stat
                icon={XIcon}
                label="Failed"
                value={formatINR(
                  (orders || [])
                    .filter((o) => o?.payment?.status === "failed")
                    .reduce((s, o) => s + (Number(o?.total) || 0), 0),
                )}
              />
              <Stat icon={CreditCard} label="Transactions" value={String(orders.length)} />
            </div>
            <div className="mt-6 bg-card rounded-lg border border-border premium-shadow overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="text-left text-muted-foreground text-xs uppercase tracking-wider bg-muted/40">
                  <tr>
                    <th className="p-4">Txn ID</th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th className="pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No payments yet.
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => {
                    const reasonInfo = getPaymentReasonDetails(o);
                    return (
                      <tr key={o.id} className="border-t hover:bg-muted/15 transition-colors">
                        <td className="p-4 font-mono text-xs font-semibold text-foreground">
                          {o.payment?.razorpayPaymentId || `TXN${displayOrderNumber(o)}`}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setEditingOrder(o)}
                            className="font-semibold text-xs text-primary hover:underline"
                            title="View order details"
                          >
                            #{displayOrderNumber(o)}
                          </button>
                        </td>
                        <td className="text-xs font-medium text-foreground">{o.address?.name || "Customer"}</td>
                        <td className="uppercase text-xs font-semibold tracking-wider text-muted-foreground">
                          {o.payment?.method || "cod"}
                        </td>
                        <td className="font-medium text-xs text-foreground">{formatINR(o.total)}</td>
                        <td>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${paymentBadgeClass(o.payment?.status || "pending", o)}`}
                          >
                            {isRefundPending(o) ? "PAID (REFUND PENDING)" : (o.payment?.status || "pending")}
                          </span>
                        </td>
                        <td className="text-xs max-w-[280px]">
                          <span className={reasonInfo.className} title={reasonInfo.text}>
                            {reasonInfo.text}
                          </span>
                        </td>
                        <td className="text-xs text-muted-foreground whitespace-nowrap pr-4">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h1 className="font-display text-3xl">Users</h1>
                <p className="text-sm text-muted-foreground">
                  All registered accounts. Activate or block them and view full profile details.
                </p>
              </div>
              <button
                onClick={() => fetchRegisteredUsers()}
                className="h-10 px-4 rounded-full border text-sm inline-flex items-center gap-2 hover:border-primary"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mt-6">
              <Stat icon={Users} label="Total Users" value={String(registeredUsers.length)} />
              <Stat
                icon={ShieldCheck}
                label="Active"
                value={String(registeredUsers.filter((x) => !x.isBlocked).length)}
              />
              <Stat
                icon={ShieldOff}
                label="Blocked"
                value={String(registeredUsers.filter((x) => x.isBlocked).length)}
              />
            </div>
            <div className="mt-6 bg-white rounded-lg border border-border premium-shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-left text-muted-foreground text-xs uppercase tracking-wider bg-muted/40">
                  <tr>
                    <th className="p-4">User</th>
                    <th>Contact</th>
                    <th>Joined</th>
                    <th>Orders</th>
                    <th>Spent</th>
                    <th>Status</th>
                    <th className="text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No registered users yet.
                      </td>
                    </tr>
                  )}
                  {registeredUsers.map((ru) => (
                    <tr key={ru.id} className="border-t">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center font-medium">
                            {ru.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[180px]">{ru.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {ru.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs">
                        {ru.phone || <span className="text-muted-foreground">-</span>}
                        <p className="text-muted-foreground">
                          {ru.address?.city || ""}
                          {ru.address?.city && ru.address?.state ? ", " : ""}
                          {ru.address?.state || ""}
                        </p>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {ru.createdAt ? new Date(ru.createdAt).toLocaleDateString() : "-"}
                      </td>
                      <td>{ru.ordersCount ?? 0}</td>
                      <td className="font-medium">{formatINR(ru.totalSpent ?? 0)}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${ru.isBlocked ? "bg-destructive/10 text-destructive" : "bg-green-600/10 text-green-700"}`}
                        >
                          {ru.isBlocked ? "Blocked" : "Active"}
                        </span>
                      </td>
                      <td className="pr-4">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setViewUser(ru)}
                            className="px-3 h-8 rounded-md text-xs border hover:border-primary"
                          >
                            View
                          </button>
                          {ru.isBlocked ? (
                            <button
                              onClick={() => toggleUserBlock(ru.id, false)}
                              className="px-3 h-8 rounded-md text-xs bg-green-600/10 text-green-700 hover:bg-green-600/20 inline-flex items-center gap-1"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Activate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (confirm(`Block ${ru.name}? They will not be able to sign in.`))
                                  toggleUserBlock(ru.id, true);
                              }}
                              className="px-3 h-8 rounded-md text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex items-center gap-1"
                            >
                              <ShieldOff className="h-3.5 w-3.5" /> Block
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {viewUser && (
              <UserDetail
                user={viewUser}
                onClose={() => setViewUser(null)}
                onToggleBlock={(b) => toggleUserBlock(viewUser.id, b)}
              />
            )}
          </div>
        )}

        {tab === "settings" && <SettingsPanel settings={settings} onSave={updateSettings} />}
        {tab === "coupons" && <CouponsManager />}
        {tab === "retention" && <RetentionLoyaltyManager />}
        {tab === "returns" && <ReturnsManager onManageOrder={(o) => setEditingOrder(o)} />}
        {tab === "support" && <SupportManager />}
        {tab === "finance" && (
          <FinanceAnalyticsPanel
            orders={orders}
            onManageOrder={(o) => setEditingOrder(o)}
            onNavigateToOrders={() => setTab("orders")}
          />
        )}
        {tab === "analytics" && <ConversionAnalyticsPanel />}
        {tab === "reviews" && <ReviewsManager />}

        {editingOrder && (
          <OrderManager
            order={editingOrder}
            fetchEvents={fetchOrderEvents}
            onClose={() => setEditingOrder(null)}
            onSave={(patch) => {
              updateOrderTracking(editingOrder.id, patch);
              setEditingOrder(null);
            }}
            onSendInvoice={(o) => setFulfillingInvoiceOrder(o)}
            onRefundSuccess={(updatedOrder) => {
              setEditingOrder(updatedOrder);
              refreshOrders(true).catch(() => {});
            }}
          />
        )}
        {fulfillingInvoiceOrder && (
          <SendInvoiceDialog
            order={fulfillingInvoiceOrder}
            onClose={() => setFulfillingInvoiceOrder(null)}
            onSuccess={() => {
              refreshOrders(true).catch(() => {});
            }}
          />
        )}
      </main>
    </div>
  );
}

export function isOrderPaidForFinance(o: any): boolean {
  if (!o || o.status === "Cancelled") return false;
  const pStatus = o.payment?.status;
  if (pStatus === "failed" || pStatus === "refunded") return false;
  if (pStatus === "paid") return true;
  // For COD orders, cash is collected upon successful delivery
  if (o.payment?.method === "cod" && o.status === "Delivered") return true;
  return false;
}

function FinanceAnalyticsPanel({
  orders,
  onManageOrder,
  onNavigateToOrders,
}: {
  orders: Order[];
  onManageOrder?: (order: Order) => void;
  onNavigateToOrders?: () => void;
}) {
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [drilldown, setDrilldown] = useState<{
    title: string;
    periodLabel: string;
    metricName: string;
    orders: Order[];
  } | null>(null);

  // Valid orders only: paid and verified orders (cancelled, unpaid, and failed orders strictly excluded from Finance Analytics)
  const validOrders = useMemo(() => {
    return (orders || []).filter(isOrderPaidForFinance);
  }, [orders]);

  // Overall summary metrics
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalPackagingCost = 0;
    let totalCourierCharge = 0;
    let totalRazorpayFee = 0;
    let knownProductCost = 0;
    let knownNetProfit = 0;
    let ordersWithCostCount = 0;

    for (const o of validOrders) {
      const orderTotal = Number(o.total) || 0;
      const refunded = Number(o.refundedAmount) || 0;
      const realizedRevenue = Math.max(0, orderTotal - refunded);
      totalRevenue += realizedRevenue;

      const subtotal = Number(o.subtotal);
      const shipping = Number(o.shipping) || 0;
      const orderValue = !isNaN(subtotal) && subtotal > 0 ? subtotal : Math.max(0, orderTotal - shipping);
      const netOrderValue = Math.max(0, orderValue - refunded);
      const packCost =
        typeof o.packagingCost === "number" && o.packagingCost > 0
          ? o.packagingCost
          : Math.round(netOrderValue * 0.02 * 100) / 100;
      totalPackagingCost += packCost;

      const cCharge = typeof o.courierCharge === "number" ? o.courierCharge : 0;
      totalCourierCharge += cCharge;

      const isOnlinePaid = o.payment?.method === "razorpay" && o.payment?.status === "paid";
      const rFee =
        typeof o.razorpayFee === "number" && o.razorpayFee > 0
          ? o.razorpayFee
          : isOnlinePaid
            ? Math.round(orderTotal * 0.0236 * 100) / 100
            : 0;
      totalRazorpayFee += rFee;

      if (typeof o.productCost === "number" && o.productCost !== null) {
        knownProductCost += o.productCost;
        ordersWithCostCount++;
        if (typeof o.netProfit === "number" && o.netProfit !== null) {
          knownNetProfit += o.netProfit;
        } else {
          const exp = Math.round((o.productCost + packCost + cCharge + rFee) * 100) / 100;
          knownNetProfit += Math.round((realizedRevenue - exp) * 100) / 100;
        }
      }
    }

    const allCostAvailable = ordersWithCostCount === validOrders.length && validOrders.length > 0;
    const totalExpense = allCostAvailable
      ? Math.round((knownProductCost + totalPackagingCost + totalCourierCharge + totalRazorpayFee) * 100) / 100
      : null;
    const netProfit = allCostAvailable ? Math.round((totalRevenue - totalExpense!) * 100) / 100 : null;
    const profitMargin = allCostAvailable && totalRevenue > 0 ? ((netProfit! / totalRevenue) * 100).toFixed(1) : null;
    const aov = validOrders.length > 0 ? Math.round(totalRevenue / validOrders.length) : 0;

    return {
      totalOrders: validOrders.length,
      totalRevenue,
      totalProductCost: allCostAvailable ? knownProductCost : null,
      knownProductCost,
      totalPackagingCost,
      totalCourierCharge,
      totalRazorpayFee,
      totalExpense,
      netProfit,
      profitMargin,
      aov,
      allCostAvailable,
      ordersWithCostCount,
      missingCostCount: validOrders.length - ordersWithCostCount,
    };
  }, [validOrders]);

  // Periodic breakdown
  const periods = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        orders: Order[];
        orderCount: number;
        revenue: number;
        packagingCost: number;
        courierCharge: number;
        razorpayFee: number;
        knownProductCost: number;
        knownNetProfit: number;
        ordersWithCostCount: number;
        sortDate: number;
      }
    >();

    for (const o of validOrders) {
      const date = new Date(o.createdAt);
      let key = "";
      let label = "";
      let sortDate = date.getTime();

      if (timeframe === "daily") {
        key = date.toISOString().slice(0, 10);
        label = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      } else if (timeframe === "weekly") {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        d.setDate(diff);
        key = d.toISOString().slice(0, 10);
        label = `Week of ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
        sortDate = d.getTime();
      } else if (timeframe === "monthly") {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        label = date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        sortDate = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      } else if (timeframe === "yearly") {
        key = String(date.getFullYear());
        label = `Year ${date.getFullYear()}`;
        sortDate = new Date(date.getFullYear(), 0, 1).getTime();
      }

      const orderTotal = Number(o.total) || 0;
      const subtotal = Number(o.subtotal);
      const shipping = Number(o.shipping) || 0;
      const orderValue = !isNaN(subtotal) && subtotal > 0 ? subtotal : Math.max(0, orderTotal - shipping);
      const packCost =
        typeof o.packagingCost === "number" && o.packagingCost > 0
          ? o.packagingCost
          : Math.round(orderValue * 0.02 * 100) / 100;
      const cCharge = typeof o.courierCharge === "number" ? o.courierCharge : 0;
      const isOnlinePaid = o.payment?.method === "razorpay" && o.payment?.status === "paid";
      const rFee =
        typeof o.razorpayFee === "number" && o.razorpayFee > 0
          ? o.razorpayFee
          : isOnlinePaid
            ? Math.round(orderTotal * 0.0236 * 100) / 100
            : 0;

      const hasCost = typeof o.productCost === "number" && o.productCost !== null;
      const pCost = hasCost ? o.productCost! : 0;
      const nProfit = hasCost
        ? typeof o.netProfit === "number" && o.netProfit !== null
          ? o.netProfit
          : Math.round((orderTotal - (pCost + packCost + cCharge + rFee)) * 100) / 100
        : 0;

      const existing = map.get(key);
      if (existing) {
        existing.orders.push(o);
        existing.orderCount++;
        existing.revenue += orderTotal;
        existing.packagingCost += packCost;
        existing.courierCharge += cCharge;
        existing.razorpayFee += rFee;
        if (hasCost) {
          existing.knownProductCost += pCost;
          existing.knownNetProfit += nProfit;
          existing.ordersWithCostCount++;
        }
      } else {
        map.set(key, {
          key,
          label,
          orders: [o],
          orderCount: 1,
          revenue: orderTotal,
          packagingCost: packCost,
          courierCharge: cCharge,
          razorpayFee: rFee,
          knownProductCost: hasCost ? pCost : 0,
          knownNetProfit: hasCost ? nProfit : 0,
          ordersWithCostCount: hasCost ? 1 : 0,
          sortDate,
        });
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.sortDate - a.sortDate)
      .map((row) => {
        const allCostKnown = row.ordersWithCostCount === row.orders.length && row.orders.length > 0;
        const totalExpense = allCostKnown
          ? Math.round((row.knownProductCost + row.packagingCost + row.courierCharge + row.razorpayFee) * 100) / 100
          : null;
        const netProfit = allCostKnown ? Math.round((row.revenue - totalExpense!) * 100) / 100 : null;
        const margin = allCostKnown && row.revenue > 0 ? ((netProfit! / row.revenue) * 100).toFixed(1) : null;
        return {
          ...row,
          allCostKnown,
          productCost: allCostKnown ? row.knownProductCost : null,
          totalExpense,
          netProfit,
          margin,
        };
      });
  }, [validOrders, timeframe]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-900">Finance & Analytics</h1>
          <p className="text-xs text-stone-500 mt-1">
            Real-time profit & loss accounting, expense breakdowns, and margin tracking with interactive drill-down.
          </p>
        </div>

        {/* Timeframe selector */}
        <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200">
          {(["daily", "weekly", "monthly", "yearly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                timeframe === t
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {t === "daily" ? "Daily (30D)" : t === "weekly" ? "Weekly (12W)" : t === "monthly" ? "Monthly (12M)" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() =>
            setDrilldown({
              title: "All Timeframe Orders — Gross Revenue",
              periodLabel: "All Timeframe",
              metricName: "Gross Revenue",
              orders: validOrders,
            })
          }
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs hover:border-stone-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-stone-400 tracking-wider">Gross Revenue</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-stone-300 group-hover:text-stone-700 transition" />
          </div>
          <p className="font-serif text-2xl font-bold text-stone-900 mt-1">{formatINR(summary.totalRevenue)}</p>
          <span className="text-[11px] text-stone-500 mt-0.5 block group-hover:underline">
            {summary.totalOrders} paid/confirmed orders
          </span>
        </div>

        <div
          onClick={() =>
            setDrilldown({
              title: "All Timeframe Orders — Expenses",
              periodLabel: "All Timeframe",
              metricName: "Total Expenses",
              orders: validOrders,
            })
          }
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs hover:border-stone-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-stone-400 tracking-wider">Total Expenses</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-stone-300 group-hover:text-stone-700 transition" />
          </div>
          <p className="font-serif text-2xl font-bold text-stone-900 mt-1">
            {summary.allCostAvailable ? formatINR(summary.totalExpense!) : "Not Available"}
          </p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">
            {summary.allCostAvailable ? "COGS + Packaging + Gateway + Courier" : "Historical COGS not recorded"}
          </span>
        </div>

        <div
          onClick={() =>
            setDrilldown({
              title: "All Timeframe Orders — Net Profit",
              periodLabel: "All Timeframe",
              metricName: "Net Profit",
              orders: validOrders,
            })
          }
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs hover:border-stone-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-stone-400 tracking-wider">Net Profit</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-stone-300 group-hover:text-stone-700 transition" />
          </div>
          {summary.allCostAvailable ? (
            <>
              <p className={`font-serif text-2xl font-bold mt-1 ${summary.netProfit! >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {formatINR(summary.netProfit!)}
              </p>
              <span className={`text-[11px] font-semibold mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded ${summary.netProfit! >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {summary.profitMargin}% Net Margin
              </span>
            </>
          ) : (
            <>
              <p className="font-serif text-2xl font-bold text-stone-400 mt-1">Not Available</p>
              <span className="text-[11px] text-amber-700 font-medium mt-0.5 block">
                {summary.ordersWithCostCount > 0
                  ? `${summary.ordersWithCostCount}/${validOrders.length} orders tracked`
                  : "Historical cost basis not recorded"}
              </span>
            </>
          )}
        </div>

        <div
          onClick={() =>
            setDrilldown({
              title: "All Timeframe Orders — Average Order Value",
              periodLabel: "All Timeframe",
              metricName: "AOV",
              orders: validOrders,
            })
          }
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs hover:border-stone-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold text-stone-400 tracking-wider">Avg Order Value (AOV)</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-stone-300 group-hover:text-stone-700 transition" />
          </div>
          <p className="font-serif text-2xl font-bold text-stone-900 mt-1">{formatINR(summary.aov)}</p>
          <span className="text-[11px] text-stone-500 mt-0.5 block">Per confirmed order</span>
        </div>
      </div>

      {/* Detailed Expense Breakdown Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs">
        <div>
          <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Product Cost (COGS)</span>
          <p className="font-semibold text-stone-800 text-sm mt-0.5">
            {summary.allCostAvailable ? formatINR(summary.totalProductCost!) : "Not Available"}
          </p>
        </div>
        <div>
          <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Packaging Cost (2%)</span>
          <p className="font-semibold text-stone-800 text-sm mt-0.5">{formatINR(summary.totalPackagingCost)}</p>
        </div>
        <div>
          <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Gateway Fees (2.36%)</span>
          <p className="font-semibold text-stone-800 text-sm mt-0.5">{formatINR(summary.totalRazorpayFee)}</p>
        </div>
        <div>
          <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Courier Charges</span>
          <p className="font-semibold text-stone-800 text-sm mt-0.5">{formatINR(summary.totalCourierCharge)}</p>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm text-left">
          <thead className="bg-stone-50/80 border-b border-stone-200 text-xs text-stone-500 uppercase font-semibold">
            <tr>
              <th className="p-4">Period</th>
              <th className="p-4 text-center">Orders (Click to view)</th>
              <th className="p-4 text-right">Gross Revenue</th>
              <th className="p-4 text-right">Product Cost</th>
              <th className="p-4 text-right">Packaging</th>
              <th className="p-4 text-right">Gateway Fees</th>
              <th className="p-4 text-right">Courier</th>
              <th className="p-4 text-right">Total Expense</th>
              <th className="p-4 text-right">Net Profit</th>
              <th className="p-4 text-center">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {periods.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-stone-400 text-xs">
                  No confirmed orders recorded for this timeframe.
                </td>
              </tr>
            )}
            {periods.map((row) => (
              <tr key={row.key} className="hover:bg-stone-50/60 transition">
                <td className="p-4 font-semibold text-stone-900 whitespace-nowrap">{row.label}</td>
                <td className="p-4 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      setDrilldown({
                        title: `${row.label} — Orders List`,
                        periodLabel: row.label,
                        metricName: "Orders",
                        orders: row.orders,
                      })
                    }
                    className="inline-flex items-center gap-1 font-mono font-bold text-stone-900 bg-stone-100 hover:bg-stone-200 hover:text-stone-950 px-2.5 py-1 rounded-md transition cursor-pointer text-xs shadow-2xs"
                    title={`Click to view the ${row.orders.length} orders for ${row.label}`}
                  >
                    <span>{row.orderCount}</span>
                    <ArrowUpRight className="h-3 w-3 text-stone-400" />
                  </button>
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setDrilldown({
                        title: `${row.label} — Gross Revenue`,
                        periodLabel: row.label,
                        metricName: "Revenue",
                        orders: row.orders,
                      })
                    }
                    className="font-medium text-stone-900 hover:underline hover:text-stone-700 transition cursor-pointer"
                  >
                    {formatINR(row.revenue)}
                  </button>
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  {row.allCostKnown ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDrilldown({
                          title: `${row.label} — Product Cost`,
                          periodLabel: row.label,
                          metricName: "Product Cost",
                          orders: row.orders,
                        })
                      }
                      className="text-stone-600 hover:underline hover:text-stone-900 transition cursor-pointer"
                    >
                      {formatINR(row.productCost!)}
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                      Not Available
                    </span>
                  )}
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setDrilldown({
                        title: `${row.label} — Packaging Cost`,
                        periodLabel: row.label,
                        metricName: "Packaging Cost",
                        orders: row.orders,
                      })
                    }
                    className="text-stone-600 hover:underline hover:text-stone-900 transition cursor-pointer"
                  >
                    {formatINR(row.packagingCost)}
                  </button>
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setDrilldown({
                        title: `${row.label} — Gateway Fees`,
                        periodLabel: row.label,
                        metricName: "Gateway Fees",
                        orders: row.orders,
                      })
                    }
                    className="text-stone-600 hover:underline hover:text-stone-900 transition cursor-pointer"
                  >
                    {formatINR(row.razorpayFee)}
                  </button>
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setDrilldown({
                        title: `${row.label} — Courier Charges`,
                        periodLabel: row.label,
                        metricName: "Courier Charges",
                        orders: row.orders,
                      })
                    }
                    className="text-stone-600 hover:underline hover:text-stone-900 transition cursor-pointer"
                  >
                    {formatINR(row.courierCharge)}
                  </button>
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  {row.allCostKnown ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDrilldown({
                          title: `${row.label} — Total Expenses`,
                          periodLabel: row.label,
                          metricName: "Total Expenses",
                          orders: row.orders,
                        })
                      }
                      className="text-stone-600 font-medium hover:underline hover:text-stone-900 transition cursor-pointer"
                    >
                      {formatINR(row.totalExpense!)}
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                      Not Available
                    </span>
                  )}
                </td>
                <td className="p-4 text-right whitespace-nowrap">
                  {row.allCostKnown ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDrilldown({
                          title: `${row.label} — Net Profit`,
                          periodLabel: row.label,
                          metricName: "Net Profit",
                          orders: row.orders,
                        })
                      }
                      className={`font-bold hover:underline cursor-pointer ${
                        row.netProfit! >= 0 ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {formatINR(row.netProfit!)}
                    </button>
                  ) : (
                    <span className="text-stone-400 font-medium text-xs">Not Available</span>
                  )}
                </td>
                <td className="p-4 text-center">
                  {row.allCostKnown ? (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        Number(row.margin) >= 20
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : Number(row.margin) >= 0
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {row.margin}%
                    </span>
                  ) : (
                    <span className="text-stone-400 text-xs font-medium">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interactive Drill-Down Orders Modal */}
      {drilldown && (
        <div
          className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setDrilldown(null)}
        >
          <div
            className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-stone-900">{drilldown.title}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                    {drilldown.orders.length} {drilldown.orders.length === 1 ? "Order" : "Orders"}
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Showing actual verified orders contributing to {drilldown.metricName} for {drilldown.periodLabel}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldown(null)}
                className="h-8 w-8 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 grid place-items-center transition"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Orders Table */}
            <div className="border border-stone-200 rounded-xl overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="p-3">Order #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3 text-center">Items</th>
                    <th className="p-3 text-center">Payment</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Product Cost</th>
                    <th className="p-3 text-right">Net Profit</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {drilldown.orders.map((o) => {
                    const hasCost = typeof o.productCost === "number" && o.productCost !== null;
                    return (
                      <tr key={o.id} className="hover:bg-stone-50/70 transition">
                        <td className="p-3 font-mono font-bold text-stone-900">
                          #{displayOrderNumber(o)}
                        </td>
                        <td className="p-3 text-stone-600 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-stone-900">{o.address?.name || "Customer"}</div>
                          <div className="text-[10px] text-stone-400">{o.address?.city || o.address?.state || "-"}</div>
                        </td>
                        <td className="p-3 text-center font-mono text-stone-600">
                          {o.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              o.payment?.status === "paid"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {o.payment?.method === "razorpay" ? "Online" : "COD"} • {o.payment?.status || "pending"}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-800 border border-stone-200">
                            {o.status || "Placed"}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-stone-900 whitespace-nowrap">
                          {formatINR(o.total)}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {hasCost ? (
                            <span className="text-stone-700 font-medium">{formatINR(o.productCost!)}</span>
                          ) : (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded font-semibold">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {isOrderPaidForFinance(o) && hasCost && typeof o.netProfit === "number" && o.netProfit !== null ? (
                            <span className={`font-bold ${o.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {formatINR(o.netProfit)}
                            </span>
                          ) : (
                            <span className="text-stone-400 font-medium">N/A</span>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => downloadOrderInvoicePdf(o)}
                              className="h-7 px-2 rounded border border-stone-200 bg-white hover:bg-stone-50 text-[11px] font-semibold text-stone-700 transition inline-flex items-center gap-1 shadow-2xs"
                              title="Download Invoice PDF"
                            >
                              <Download className="h-3 w-3 text-stone-500" />
                              <span>PDF</span>
                            </button>
                            {onManageOrder && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDrilldown(null);
                                  onManageOrder(o);
                                }}
                                className="h-7 px-2.5 rounded bg-stone-900 hover:bg-stone-800 text-[11px] font-semibold text-white transition shadow-2xs"
                              >
                                Manage
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-200 text-xs">
              <div className="text-stone-500">
                Showing {drilldown.orders.length} real orders totaling{" "}
                <strong className="text-stone-900">
                  {formatINR(drilldown.orders.reduce((s, o) => s + (Number(o.total) || 0), 0))}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                {onNavigateToOrders && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrilldown(null);
                      onNavigateToOrders();
                    }}
                    className="h-9 px-4 rounded-lg border border-stone-300 hover:bg-stone-50 font-semibold text-stone-700 transition"
                  >
                    View in Orders Manager
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="h-9 px-4 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Package;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition md:w-full ${
        active
          ? "bg-stone-900 text-white shadow-xs"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-stone-400"}`} />
      <span>{children}</span>
    </button>
  );
}
function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-stone-100 text-stone-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mt-3">{label}</p>
      <p className="font-serif text-2xl font-bold mt-0.5 text-stone-900">{value}</p>
    </div>
  );
}

function CategoryPicker({
  tree,
  categories,
  onPick,
  onClose,
}: {
  tree: (Category & { children: Category[] })[];
  categories: string[];
  onPick: (c: string) => void;
  onClose: () => void;
}) {
  const [selectedParent, setSelectedParent] = useState<(Category & { children: Category[] }) | null>(null);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-border p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!selectedParent ? (
          <>
            <h2 className="font-display text-2xl mb-1">Select Main Category</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Choose the parent category for your new product.
            </p>
            {tree.length === 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => onPick(c)}
                    className="p-3.5 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 text-sm font-medium text-left transition"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto">
                {tree.map((parent) => (
                  <button
                    key={parent.id}
                    onClick={() => {
                      if (parent.children.length === 0) {
                        onPick(parent.name);
                      } else {
                        setSelectedParent(parent);
                      }
                    }}
                    className="p-3.5 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 text-sm font-semibold text-left transition flex flex-col justify-between group"
                  >
                    <span>{parent.name}</span>
                    <span className="text-[11px] text-muted-foreground mt-1 font-normal group-hover:text-primary">
                      {parent.children.length > 0 ? `${parent.children.length} subcategories →` : "Direct category"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setSelectedParent(null)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                ← Back to categories
              </button>
            </div>
            <h2 className="font-display text-2xl mb-1">Select Subcategory</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Parent Category: <strong className="text-foreground">{selectedParent.name}</strong>
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              <button
                onClick={() => onPick(selectedParent.name)}
                className="w-full p-3 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 text-sm font-medium text-left transition"
              >
                <span className="font-semibold">{selectedParent.name}</span>
                <span className="block text-xs text-muted-foreground">Directly in main category (No subcategory)</span>
              </button>
              {selectedParent.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onPick(child.name)}
                  className="w-full p-3 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 text-sm font-semibold text-left transition flex items-center justify-between"
                >
                  <span>{child.name}</span>
                  <span className="text-xs text-primary font-medium">Select →</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="h-10 px-5 rounded-full border text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductEditor({
  product,
  tree,
  categories,
  onClose,
  onSave,
}: {
  product: Product;
  tree: (Category & { children?: Category[] })[];
  categories: string[];
  onClose: () => void;
  onSave: (p: Product) => Promise<void> | void;
}) {
  const [p, setP] = useState<Product>(() => ({
    id: product?.id ?? "",
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "",
    price: Number(product?.price) || 0,
    mrp: Number(product?.mrp) || 0,
    costPrice: product?.costPrice !== undefined ? Number(product.costPrice) : 0,
    stock: Number(product?.stock ?? 100),
    rating: Number(product?.rating ?? 5),
    reviews: Number(product?.reviews ?? 1),
    image: product?.image ?? "",
    images: Array.isArray(product?.images) ? product.images : [],
    featuredDeal: Boolean(product?.featuredDeal),
    description: product?.description ?? "",
    details: Array.isArray(product?.details) ? product.details : [],
    hsnCode: product?.hsnCode ?? "",
    gstRate: product?.gstRate !== undefined && product?.gstRate !== null ? Number(product.gstRate) : 0,
    gstInclusive: product?.gstInclusive !== false,
    isTaxable: product?.isTaxable !== false,
    metaTitle: product?.metaTitle ?? "",
    metaDescription: product?.metaDescription ?? "",
    additionalImage: product?.additionalImage ?? "",
    additionalHeading: product?.additionalHeading ?? "",
    additionalContent: product?.additionalContent ?? "",
    codEligible: product?.codEligible !== false,
  }));
  const [comboComponents, setComboComponents] = useState<Array<{
    name: string;
    qty: number;
    hsnCode: string;
    gstRate: number;
    baseValue: number;
    gstInclusive: boolean;
    costPrice?: number;
  }>>(() => {
    return Array.isArray((product as any)?.comboComponents) && (product as any).comboComponents.length > 0
      ? (product as any).comboComponents.map((c: any) => ({
          name: c.name || "",
          qty: Number(c.qty) || 1,
          hsnCode: c.hsnCode || "",
          gstRate: Number(c.gstRate) || 0,
          baseValue: Number(c.baseValue) || 0,
          gstInclusive: c.gstInclusive !== false,
          costPrice: c.costPrice !== undefined ? Number(c.costPrice) : 0,
        }))
      : [];
  });
  const [saving, setSaving] = useState(false);

  const safeTree: (Category & { children?: Category[] })[] = useMemo(
    () => (Array.isArray(tree) ? tree : []),
    [tree]
  );

  // Find parent category for current product
  const initialParent = useMemo(() => {
    return (
      safeTree.find(
        (parent: Category & { children?: Category[] }) =>
          parent.name === p.category ||
          (Array.isArray(parent.children) && parent.children.some((child: Category) => child?.name === p.category))
      ) ||
      safeTree[0] ||
      null
    );
  }, [safeTree, p.category]);

  const [selectedParentId, setSelectedParentId] = useState<string>(initialParent?.id || "");

  const currentParent = useMemo(() => {
    return (
      safeTree.find((t: Category & { children?: Category[] }) => t.id === selectedParentId) ||
      initialParent ||
      safeTree[0] ||
      null
    );
  }, [safeTree, selectedParentId, initialParent]);

  const submit = async () => {
    const name = (p.name || "").trim();
    const category = (p.category || "").trim();
    if (!name) return toast.error("Product name is required");
    if (!category) return toast.error("Please choose a category");
    if (p.price < 0 || p.mrp < 0 || p.stock < 0) {
      return toast.error("Price, MRP and stock cannot be negative");
    }

    // Strict Combo Components Validation: Every active component must have a valid name and HSN code
    const activeComponents = comboComponents.filter((c) => c.name.trim().length > 0);
    for (let i = 0; i < activeComponents.length; i++) {
      const comp = activeComponents[i];
      if (!comp.hsnCode || comp.hsnCode.trim().length < 2) {
        return toast.error(`Component #${i + 1} ("${comp.name}") is missing a valid HSN code.`);
      }
      if (typeof comp.gstRate !== "number" || isNaN(comp.gstRate) || comp.gstRate < 0 || comp.gstRate > 28) {
        return toast.error(`Component #${i + 1} ("${comp.name}") has an invalid GST rate.`);
      }
    }

    setSaving(true);
    try {
      await onSave({
        ...p,
        name,
        category,
        price: Number(p.price) || 0,
        mrp: Number(p.mrp) || 0,
        costPrice: Number((p as any).costPrice) || 0,
        stock: Number(p.stock) || 0,
        hsnCode: (p.hsnCode || "").trim(),
        gstRate: Number(p.gstRate) || 0,
        gstInclusive: p.gstInclusive !== false,
        isTaxable: p.isTaxable !== false,
        metaTitle: (p.metaTitle || "").trim(),
        metaDescription: (p.metaDescription || "").trim(),
        additionalImage: (p.additionalImage || "").trim(),
        additionalHeading: (p.additionalHeading || "").trim(),
        additionalContent: (p.additionalContent || "").trim(),
        rating: Math.max(0, Math.min(5, Number(p.rating) || 0)),
        reviews: Math.max(0, Number(p.reviews) || 0),
        codEligible: p.codEligible !== false,
        comboComponents: activeComponents,
      });
    } finally {
      setSaving(false);
    }
  };

  const editPrice = Number(p.price) || 0;
  const editGstRate = Number(p.gstRate) || 0;
  const editGstInclusive = p.gstInclusive !== false;
  let taxablePreview = editPrice;
  let gstPreview = 0;
  if (editPrice > 0 && editGstRate > 0) {
    if (editGstInclusive) {
      taxablePreview = Math.round((editPrice / (1 + editGstRate / 100)) * 100) / 100;
      gstPreview = Math.round((editPrice - taxablePreview) * 100) / 100;
    } else {
      taxablePreview = editPrice;
      gstPreview = Math.round((editPrice * (editGstRate / 100)) * 100) / 100;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-border p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl mb-1">
          {product?.id ? "Edit Product" : "New Product"}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Current Category: <span className="font-semibold text-foreground">{p.category || "None"}</span>
        </p>

        <div className="space-y-6">
          {/* Section 1: Basic Information */}
          <div className="rounded-xl border border-border bg-[#FDFBF7] p-4 space-y-3 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[#166F77] block border-b border-border/60 pb-2">
              1. Basic Information (बुनियादी जानकारी)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm block">
                <span className="text-muted-foreground text-xs font-medium">Main Category (मुख्य श्रेणी)</span>
                <select
                  value={selectedParentId || (currentParent?.id ?? "")}
                  onChange={(e) => {
                    const newParentId = e.target.value;
                    setSelectedParentId(newParentId);
                    const newParent = safeTree.find((t: Category & { children?: Category[] }) => t.id === newParentId);
                    if (newParent) {
                      const firstSub =
                        newParent.children && newParent.children.length > 0
                          ? newParent.children[0].name
                          : newParent.name;
                      setP((prev) => ({ ...prev, category: firstSub }));
                    }
                  }}
                  className="mt-1 w-full h-11 rounded-lg border bg-white px-3 text-sm font-medium focus:outline-none focus:border-primary"
                >
                  {safeTree.length > 0 ? (
                    safeTree.map((parent: Category & { children?: Category[] }) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name} {!parent.isActive ? "(Hidden)" : ""}
                      </option>
                    ))
                  ) : (
                    categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="text-sm block">
                <span className="text-muted-foreground text-xs font-medium">Subcategory (उप श्रेणी)</span>
                <select
                  value={p.category}
                  onChange={(e) => setP((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 w-full h-11 rounded-lg border bg-white px-3 text-sm font-medium focus:outline-none focus:border-primary"
                >
                  {currentParent ? (
                    <>
                      <option value={currentParent.name}>
                        {currentParent.name} (Direct / Main Category)
                      </option>
                      {(currentParent.children || []).map((child: Category) => (
                        <option key={child.id} value={child.name}>
                          {child.name} {!child.isActive ? "(Hidden)" : ""}
                        </option>
                      ))}
                      {p.category &&
                        p.category !== currentParent.name &&
                        !(currentParent.children || []).some((c: Category) => c.name === p.category) && (
                          <option value={p.category}>{p.category} (Current)</option>
                        )}
                    </>
                  ) : (
                    categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <In
              label="Product Title / Name (स्टोरफ़्रंट शीर्षक - ग्राहकों को दिखने वाला नाम)"
              placeholder="e.g. Tulsi Kanthi Mala (3 Round) – Original Handmade"
              value={p.name}
              onChange={(v) => setP({ ...p, name: v })}
            />

            <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!p.featuredDeal}
                onChange={(event) => setP({ ...p, featuredDeal: event.target.checked })}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-[var(--foreground)]">
                  Mark as Best Seller
                </span>
                <span className="text-xs text-muted-foreground">
                  Shows the Best Seller badge and gives this item priority inside category sliders.
                </span>
              </span>
            </label>
          </div>

          {/* Section 2: Pricing & Inventory */}
          <div className="rounded-xl border border-border bg-[#FDFBF7] p-4 space-y-3 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[#166F77] block border-b border-border/60 pb-2">
              2. Pricing & Inventory (मूल्य एवं स्टॉक)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <In
                label="Selling Price (₹)"
                type="number"
                value={String(p.price ?? 0)}
                onChange={(v) => setP({ ...p, price: +v })}
              />
              <In
                label="MRP (₹)"
                type="number"
                value={String(p.mrp ?? 0)}
                onChange={(v) => setP({ ...p, mrp: +v })}
              />
              <In
                label="Cost Price (₹) [Admin Only]"
                type="number"
                value={String((p as any).costPrice ?? 0)}
                onChange={(v) => setP({ ...p, costPrice: +v } as any)}
              />
              {product?.id ? (
                <div>
                  <label className="text-xs font-semibold uppercase text-stone-500 tracking-wider">
                    Current Stock
                  </label>
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-stone-200 bg-stone-100/70 px-3.5 py-2">
                    <span className="font-mono text-sm font-bold text-stone-900">
                      {p.stock} units
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded shadow-2xs">
                      Managed in Inventory
                    </span>
                  </div>
                </div>
              ) : (
                <In
                  label="Initial Stock Quantity"
                  type="number"
                  value={String(p.stock ?? 0)}
                  onChange={(v) => setP({ ...p, stock: +v })}
                />
              )}
              <In
                label="Rating (0-5)"
                type="number"
                value={String(p.rating ?? 5)}
                onChange={(v) => setP({ ...p, rating: +v })}
              />
              <In
                label="Review Count"
                type="number"
                value={String(p.reviews ?? 0)}
                onChange={(v) => setP({ ...p, reviews: +v })}
              />
              <div className="col-span-full">
                <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200/60 rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="font-semibold text-stone-700">Tip:</span> Stock receipts, physical recounts, and damaged write-offs can also be adjusted with full audit history under the <span className="font-medium text-stone-900">Inventory</span> tab.
                </p>
              </div>

              {/* Cash on Delivery Eligibility */}
              <div className="rounded-lg border border-border bg-white p-3 space-y-1.5 col-span-full">
                <span className="block font-semibold text-xs text-[var(--foreground)] uppercase tracking-wider">
                  Cash on Delivery
                </span>
                <span className="text-xs text-muted-foreground block">
                  Allow COD for this product
                </span>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="codEligible"
                      checked={p.codEligible !== false}
                      onChange={() => setP({ ...p, codEligible: true })}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Enabled</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="codEligible"
                      checked={p.codEligible === false}
                      onChange={() => setP({ ...p, codEligible: false })}
                      className="text-primary focus:ring-primary"
                    />
                    <span>Disabled</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: GST & Tax Configuration */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-teal-200/80 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                3. GST & Tax Configuration (कर विवरण)
              </span>
              <span className="text-[11px] text-teal-700 font-medium">Reused on Invoices</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <In
                label="HSN Code"
                placeholder="e.g. 7117"
                value={p.hsnCode ?? ""}
                onChange={(v) => setP({ ...p, hsnCode: v })}
              />
              <label className="text-sm block">
                <span className="text-muted-foreground text-xs">GST Rate (%)</span>
                <select
                  value={String(p.gstRate ?? 0)}
                  onChange={(e) => setP({ ...p, gstRate: Number(e.target.value) || 0 })}
                  className="mt-1 w-full h-11 rounded-lg border bg-white px-3 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="0">0% (Nil / Exempt)</option>
                  <option value="3">3% (Precious beads / metals)</option>
                  <option value="5">5% (Essentials / Puja)</option>
                  <option value="12">12% (Standard rate - 12%)</option>
                  <option value="18">18% (Standard rate - 18%)</option>
                  <option value="28">28% (Luxury items - 28%)</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={p.gstInclusive !== false}
                onChange={(e) => setP({ ...p, gstInclusive: e.target.checked })}
                className="rounded border-border h-4 w-4 text-primary"
              />
              <span>GST Included in Selling Price (Customer pays exact selling price)</span>
            </label>

            {editPrice > 0 && editGstRate > 0 && (
              <div className="pt-2 border-t border-teal-200/80 text-[11px] text-teal-950 flex flex-wrap justify-between font-mono bg-white/80 p-2.5 rounded">
                <span>Taxable: ₹{taxablePreview.toFixed(2)}</span>
                <span>GST ({editGstRate}%): ₹{gstPreview.toFixed(2)}</span>
                <span className="font-bold">Final: ₹{(editGstInclusive ? editPrice : editPrice + gstPreview).toFixed(2)}</span>
              </div>
            )}

            {/* Combo / Kit Components Breakdown */}
            <div className="pt-3 border-t border-teal-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider">
                    Combo / Kit Components (Multi-Rate GST)
                  </h4>
                  <p className="text-[11px] text-teal-700">
                    If this item is a combo bundle with individual items having different GST rates/HSNs, add them below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setComboComponents((prev) => [
                      ...prev,
                      { name: "", qty: 1, hsnCode: "", gstRate: 5, baseValue: 100, gstInclusive: true },
                    ])
                  }
                  className="h-7 px-2.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition inline-flex items-center gap-1 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Component
                </button>
              </div>

              {comboComponents.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1.5 text-[10px] font-bold text-teal-900 uppercase tracking-wider px-1">
                    <span className="col-span-4">Component Name</span>
                    <span className="col-span-1 text-center">Qty</span>
                    <span className="col-span-2">HSN</span>
                    <span className="col-span-2 text-center">GST %</span>
                    <span className="col-span-2 text-right">Base (₹)</span>
                    <span className="col-span-1 text-center">Del</span>
                  </div>
                  {comboComponents.map((comp, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1.5 items-center bg-white/90 p-2 rounded-lg border border-teal-200">
                      <input
                        type="text"
                        placeholder="e.g. Radha Dress"
                        value={comp.name}
                        onChange={(e) => {
                          const updated = [...comboComponents];
                          updated[idx].name = e.target.value;
                          setComboComponents(updated);
                        }}
                        className="col-span-4 h-8 px-2 rounded border border-border text-xs focus:outline-none focus:border-primary"
                      />
                      <input
                        type="number"
                        min="1"
                        value={comp.qty}
                        onChange={(e) => {
                          const updated = [...comboComponents];
                          updated[idx].qty = Math.max(1, parseInt(e.target.value) || 1);
                          setComboComponents(updated);
                        }}
                        className="col-span-1 h-8 px-1 text-center rounded border border-border text-xs focus:outline-none focus:border-primary"
                      />
                      <input
                        type="text"
                        placeholder="HSN *"
                        value={comp.hsnCode}
                        onChange={(e) => {
                          const updated = [...comboComponents];
                          updated[idx].hsnCode = e.target.value;
                          setComboComponents(updated);
                        }}
                        className={`col-span-2 h-8 px-2 rounded border text-xs focus:outline-none focus:border-primary ${
                          !comp.hsnCode.trim() ? "border-amber-500 bg-amber-50/50" : "border-border"
                        }`}
                        title={!comp.hsnCode.trim() ? "HSN code is required" : undefined}
                      />
                      <select
                        value={comp.gstRate}
                        onChange={(e) => {
                          const updated = [...comboComponents];
                          updated[idx].gstRate = Number(e.target.value) || 0;
                          setComboComponents(updated);
                        }}
                        className="col-span-2 h-8 px-1 text-xs rounded border border-border bg-white focus:outline-none focus:border-primary"
                      >
                        <option value="0">0%</option>
                        <option value="3">3%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        placeholder="Base"
                        value={comp.baseValue}
                        onChange={(e) => {
                          const updated = [...comboComponents];
                          updated[idx].baseValue = Math.max(0, parseFloat(e.target.value) || 0);
                          setComboComponents(updated);
                        }}
                        className="col-span-2 h-8 px-2 text-right rounded border border-border text-xs focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setComboComponents(comboComponents.filter((_, i) => i !== idx))}
                        className="col-span-1 h-8 w-8 mx-auto grid place-items-center text-muted-foreground hover:text-destructive transition"
                        title="Remove component"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="text-[11px] text-teal-800 bg-teal-100/60 p-2 rounded flex justify-between font-mono">
                    <span>{comboComponents.length} component(s) defined</span>
                    <span>Total Base Value: ₹{comboComponents.reduce((sum, c) => sum + (c.baseValue * c.qty), 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Product Content */}
          <div className="rounded-xl border border-border bg-[#FDFBF7] p-4 space-y-3 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[#166F77] block border-b border-border/60 pb-2">
              4. Product Content (उत्पाद विवरण)
            </span>
            <SimpleRichEditor
              label="Product Description (विस्तृत विवरण - उत्पाद पेज पर दिखने वाला)"
              value={p.description || ""}
              onChange={(val) => setP({ ...p, description: val })}
              placeholder="Detailed description of the product, its spiritual benefits, dimensions, authenticity..."
              rows={6}
            />

            <div className="pt-4 border-t border-border/70 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#166F77]">
                    Additional Product Content & Visuals (वैकल्पिक अतिरिक्त विवरण एवं चित्र)
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Optional section rendered on customer product page if provided. Leave empty if not needed.
                  </p>
                </div>
              </div>

              <AdminImageUpload
                label="Additional Product Image (अतिरिक्त उत्पाद चित्र)"
                value={p.additionalImage || ""}
                onChange={(url) => setP((prev) => ({ ...prev, additionalImage: url }))}
              />

              <In
                label="Additional Section Heading (अतिरिक्त अनुभाग शीर्षक - उदा. About this Product)"
                placeholder="e.g. About this Sacred Essential"
                value={p.additionalHeading || ""}
                onChange={(val) => setP((prev) => ({ ...prev, additionalHeading: val }))}
              />

              <SimpleRichEditor
                label="Additional Section Content (अतिरिक्त अनुभाग विवरण)"
                value={p.additionalContent || ""}
                onChange={(val) => setP((prev) => ({ ...prev, additionalContent: val }))}
                placeholder="Enter rich details, craftsmanship story, spiritual context, or instructions..."
                rows={5}
              />
            </div>
          </div>

          {/* Section 5: SEO Configuration */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                5. SEO Configuration (सर्च इंजन सेटिंग्स)
              </span>
              <span className="text-[11px] text-indigo-700">Google Search Optimization</span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  SEO Meta Title (Google Search Title)
                </span>
                <span className={`text-[11px] font-mono ${(p.metaTitle || "").length > 60 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                  {(p.metaTitle || "").length} / 60 chars
                </span>
              </div>
              <input
                type="text"
                placeholder="e.g. Buy Original Tulsi Kanthi Mala Online | Shri Radha Govind Store"
                value={p.metaTitle ?? ""}
                onChange={(e) => setP({ ...p, metaTitle: e.target.value })}
                className="w-full h-11 rounded-lg border bg-white px-3 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  SEO Meta Description (Google Search Snippet)
                </span>
                <span className={`text-[11px] font-mono ${(p.metaDescription || "").length > 160 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                  {(p.metaDescription || "").length} / 160 chars
                </span>
              </div>
              <textarea
                value={p.metaDescription || ""}
                onChange={(e) => setP({ ...p, metaDescription: e.target.value })}
                rows={2}
                placeholder="Brief summary (up to 160 characters) displayed in Google search results."
                className="w-full rounded-lg border bg-white p-3 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Google Search Snippet Preview */}
            <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-1 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Google Search Preview
              </span>
              <p className="text-blue-700 text-sm font-medium hover:underline truncate">
                {p.metaTitle || p.name || "Product Title | Shri Radha Govind Store"}
              </p>
              <p className="text-emerald-700 text-[11px] truncate">
                https://shriradhagovindstore.com/product/{p.slug || "product-url"}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-tight">
                {p.metaDescription || p.description || "Authentic devotional products from Vrindavan Dham."}
              </p>
            </div>
          </div>

          {/* Section 6: Images & Gallery */}
          <div className="rounded-xl border border-border bg-[#FDFBF7] p-4 space-y-3 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[#166F77] block border-b border-border/60 pb-2">
              6. Images & Gallery (उत्पाद चित्र)
            </span>
            <AdminImageUpload
              label="Primary Product Image (मुख्य चित्र)"
              value={p.image || ""}
              onChange={(image) =>
                setP((current) => ({
                  ...current,
                  image,
                  images: [image, ...(current.images ?? []).filter((item) => item !== image)],
                }))
              }
            />
            <AdminGalleryUpload
              label="Product Gallery Photos (अतिरिक्त चित्र)"
              images={p.images ?? []}
              onChange={(images) =>
                setP((current) => ({
                  ...current,
                  images,
                  image: images[0] || current.image || "",
                }))
              }
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={onClose} className="h-10 px-5 rounded-full border text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm block">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-11 rounded-lg border px-3 bg-background focus:outline-none focus:border-primary"
      />
    </label>
  );
}

function AdminImageUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const uploadFile = async (file?: File) => {
    if (!file || uploading) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name))
      return toast.error("Please choose an image file");
    if (file.size > 12 * 1024 * 1024) return toast.error("Image must be smaller than 12 MB");
    if (!isApiEnabled())
      return toast.error("Connect the backend API to upload images from this device");
    const body = new FormData();
    body.append("file", file);
    setUploading(true);
    try {
      const result = await api<{
        url: string;
        publicId: string;
        format: "webp";
        originalBytes: number;
        optimizedBytes: number;
      }>("/uploads/image", { method: "POST", formData: body });
      onChange(result.url);
      const saved = result.originalBytes
        ? Math.max(0, Math.round((1 - result.optimizedBytes / result.originalBytes) * 100))
        : 0;
      toast.success(`Converted to WebP${saved ? `  -  ${saved}% smaller` : ""}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Image upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <label
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          uploadFile(event.dataTransfer.files[0]);
        }}
        className={`group relative flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-4 text-center transition ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/25 hover:border-primary hover:bg-primary/5"} ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Upload preview"
              className="absolute inset-0 h-full w-full object-contain bg-white/75"
            />
            <span className="glass-panel relative rounded-full px-4 py-2 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
              Replace image
            </span>
          </>
        ) : (
          <span>
            <UploadCloud
              className={`mx-auto h-8 w-8 text-primary ${uploading ? "animate-bounce" : ""}`}
            />
            <span className="mt-2 block text-sm font-semibold">
              {uploading ? "Optimizing and uploading..." : "Browse device or drop image here"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              PNG, JPG, WebP, HEIC - max 12 MB
              <br />
              Automatically resized and converted to WebP
            </span>
          </span>
        )}
        <input
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            uploadFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-primary">
          Advanced: use an existing image URL
        </summary>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
          className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-foreground"
        />
      </details>
    </div>
  );
}

function AdminGalleryUpload({
  label,
  images,
  onChange,
}: {
  label: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files?: FileList | File[]) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0 || uploading) return;
    const invalid = selected.find(
      (file) => !file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name),
    );
    if (invalid) return toast.error("Please choose image files only");
    const tooLarge = selected.find((file) => file.size > 12 * 1024 * 1024);
    if (tooLarge) return toast.error(`${tooLarge.name} is larger than 12 MB`);
    if (!isApiEnabled())
      return toast.error("Connect the backend API to upload images from this device");

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const body = new FormData();
        body.append("file", file);
        const result = await api<{ url: string }>("/uploads/image", {
          method: "POST",
          formData: body,
        });
        uploaded.push(result.url);
      }
      onChange([...images, ...uploaded.filter((url) => !images.includes(url))]);
      toast.success(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Gallery upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = (url: string) => {
    onChange([url, ...images.filter((image) => image !== url)]);
  };

  const removeImage = (url: string) => {
    onChange(images.filter((image) => image !== url));
  };

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <label className="flex min-h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/25 p-4 text-center transition hover:border-primary hover:bg-primary/5">
        <span>
          <UploadCloud
            className={`mx-auto h-7 w-7 text-primary ${uploading ? "animate-bounce" : ""}`}
          />
          <span className="mt-2 block text-sm font-semibold">
            {uploading ? "Uploading gallery..." : "Browse multiple photos from device"}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Select more than one product photo for the gallery
          </span>
        </span>
        <input
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            uploadFiles(event.target.files ?? undefined);
            event.target.value = "";
          }}
        />
      </label>
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {images.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className="group relative overflow-hidden rounded-md border bg-white"
            >
              <img src={image} alt="" className="aspect-square w-full object-contain p-1" />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--foreground)]">
                  Main
                </span>
              )}
              <div className="absolute inset-x-1 bottom-1 hidden gap-1 group-hover:flex">
                <button
                  type="button"
                  onClick={() => setPrimary(image)}
                  className="flex-1 rounded bg-white/95 px-1 py-1 text-[10px] font-semibold text-[var(--foreground)] shadow"
                >
                  Main
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(image)}
                  className="rounded bg-destructive px-1.5 py-1 text-[10px] font-semibold text-white shadow"
                >
                  X
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (p: Partial<Settings>) => void;
}) {
  const [s, setS] = useState<Settings>(settings);
  const [savingDevProfile, setSavingDevProfile] = useState(false);

  useEffect(() => {
    setS(settings);
  }, [settings]);
  return (
    <div>
      <h1 className="font-display text-3xl">Store Settings & CMS</h1>
      <p className="text-sm text-muted-foreground">
        Configure store information, homepage banners, shipping thresholds, and payment methods.
      </p>
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Section 1: Store Info & Contact */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="font-display text-xl text-[#166F77]">Store & Contact Info</h2>
            <span className="text-[11px] text-muted-foreground">Customer-facing details</span>
          </div>
          <In label="Store Name" value={s.siteName} onChange={(v) => setS({ ...s, siteName: v })} placeholder="Shri Radha Govind Store" />
          <In label="Tagline / Slogan" value={s.tagline} onChange={(v) => setS({ ...s, tagline: v })} placeholder="Made With Love From The Heart Of Vrindavan" />
          <div className="grid sm:grid-cols-2 gap-3">
            <In
              label="Support Email"
              value={s.supportEmail}
              onChange={(v) => setS({ ...s, supportEmail: v })}
              placeholder="support@shriradhagovindstore.com"
            />
            <In
              label="Support Phone"
              value={s.supportPhone}
              onChange={(v) => setS({ ...s, supportPhone: v })}
              placeholder="+91 7500533505"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <In
              label="WhatsApp Phone"
              value={s.whatsappPhone ?? ""}
              onChange={(v) => setS({ ...s, whatsappPhone: v })}
              placeholder="+91 7500533505"
            />
            <In
              label="GSTIN Number (optional)"
              value={s.gstin ?? ""}
              onChange={(v) => setS({ ...s, gstin: v })}
              placeholder="09AAAAA0000A1Z5"
            />
          </div>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Store Address</span>
            <textarea
              value={s.storeAddress ?? ""}
              onChange={(e) => setS({ ...s, storeAddress: e.target.value })}
              rows={2}
              placeholder="Vrindavan, Mathura, Uttar Pradesh, India - 281121"
              className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>
        </section>

        {/* Section 2: Homepage & CMS */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="font-display text-xl text-[#166F77]">Homepage & CMS Content</h2>
            <span className="text-[11px] text-muted-foreground">Banner & footer text</span>
          </div>
          <In
            label="Announcement Bar (Top Header)"
            value={s.announcement}
            onChange={(v) => setS({ ...s, announcement: v })}
            placeholder="॥ Radhe Radhe ॥  -  Free shipping on orders above ₹299"
          />
          <In
            label="Hero Banner Title"
            value={s.heroTitle ?? ""}
            onChange={(v) => setS({ ...s, heroTitle: v })}
            placeholder="Sacred Treasures From Vrindavan"
          />
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Hero Banner Subtitle</span>
            <textarea
              value={s.heroSubtitle ?? ""}
              onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })}
              rows={2}
              placeholder="Handcrafted Japa malas, authentic Tulsi, sacred idols..."
              className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Footer Brand Description</span>
            <textarea
              value={s.footerDescription ?? ""}
              onChange={(e) => setS({ ...s, footerDescription: e.target.value })}
              rows={2}
              placeholder="Shri Radha Govind Store brings authentic devotional items..."
              className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary"
            />
          </label>

          <div className="pt-3 border-t border-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Homepage Hero Banner Image</span>
              {Boolean(s.homeHeroImage) && (
                <button
                  type="button"
                  onClick={() => setS({ ...s, homeHeroImage: "" })}
                  className="text-[11px] text-destructive hover:underline"
                >
                  Reset to Default
                </button>
              )}
            </div>
            <AdminImageUpload
              label=""
              value={s.homeHeroImage || ""}
              onChange={(url) => setS({ ...s, homeHeroImage: url })}
            />
            <p className="text-[11px] text-muted-foreground">
              When unset, defaults to standard devotional hero banner (<code className="bg-slate-100 px-1 py-0.5 rounded">/home-devotional-hero.png</code>).
            </p>
          </div>

          <div className="pt-3 border-t border-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Homepage Hero Background Video URL (VIDEO 1)
              </span>
              {Boolean(s.homeHeroVideo) && (
                <button
                  type="button"
                  onClick={() => setS({ ...s, homeHeroVideo: "" })}
                  className="text-[11px] text-destructive hover:underline"
                >
                  Clear Video (Use Image Fallback)
                </button>
              )}
            </div>
            <In
              label=""
              placeholder="https://.../homepage-hero.mp4"
              value={s.homeHeroVideo || ""}
              onChange={(url) => setS({ ...s, homeHeroVideo: url.trim() })}
            />
            <p className="text-[11px] text-muted-foreground">
              MP4 or WebM video URL for the full-width homepage hero background banner. Autoplays muted on loop. If empty, the hero banner seamlessly displays the hero image above.
            </p>
            {Boolean(s.homeHeroVideo) && (
              <div className="mt-2 rounded-lg border border-stone-200 overflow-hidden bg-black/5 p-2">
                <p className="text-[10px] font-medium text-stone-600 mb-1">Live Video Preview:</p>
                <video
                  src={s.homeHeroVideo}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full max-h-48 object-cover rounded"
                />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Vrindavan Story Section Image ("A Little Piece of Vrindavan")</span>
              {Boolean(s.vrindavanStoryImage) && (
                <button
                  type="button"
                  onClick={() => setS({ ...s, vrindavanStoryImage: "" })}
                  className="text-[11px] text-destructive hover:underline"
                >
                  Reset to Default
                </button>
              )}
            </div>
            <AdminImageUpload
              label=""
              value={s.vrindavanStoryImage || ""}
              onChange={(url) => setS({ ...s, vrindavanStoryImage: url })}
            />
            <p className="text-[11px] text-muted-foreground">
              Displays in the devotional heritage section on the homepage. Defaults to authentic Vrindavan Krishna portrait.
            </p>
          </div>
        </section>

        {/* Section 3: Shipping & Delivery */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="font-display text-xl text-[#166F77]">Shipping & Delivery</h2>
            <span className="text-[11px] text-muted-foreground">Courier thresholds</span>
          </div>
          <In
            label="Free Shipping Above (₹)"
            type="number"
            value={String(s.freeShipThreshold)}
            onChange={(v) => setS({ ...s, freeShipThreshold: +v })}
          />
          <In
            label="Default Shipping Fee (₹)"
            type="number"
            value={String(s.shippingFee)}
            onChange={(v) => setS({ ...s, shippingFee: +v })}
          />
          <In
            label="Return Window Period (Hours)"
            type="number"
            value={String(s.returnWindowHours ?? 48)}
            onChange={(v) => {
              const val = parseInt(v, 10);
              setS({ ...s, returnWindowHours: isNaN(val) || val <= 0 ? 48 : val });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Allowable return window post-delivery for customer return claims. Default is 48 hours.
          </p>
        </section>

        {/* Section 4: Payments */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="font-display text-xl text-[#166F77]">Payments & Gateway</h2>
            <span className="text-[11px] text-muted-foreground">Razorpay & COD</span>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Razorpay Online Gateway (Server Environment Managed)
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Online payments are managed via backend environment variables (<code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">RAZORPAY_KEY_ID</code>). The secret key is stored securely on the server.
              </p>
            </div>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
              Active & Live
            </span>
          </div>
          <label className="flex items-center gap-3 text-sm pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={s.codEnabled}
              onChange={(e) => setS({ ...s, codEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary"
            />
            <span className="font-medium">Enable Cash on Delivery (COD)</span>
          </label>
        </section>

        {/* Section 5: About Us Page Media & Photos */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div>
              <h2 className="font-display text-xl text-[#166F77]">About Us Page Media & Photos (हमारे बारे में पेज के चित्र)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload and manage photos displayed on the public About Us page (/about), including team photos and holy Vrindavan imagery.
              </p>
            </div>
            <Link
              to="/about"
              target="_blank"
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
            >
              Preview About Page ↗
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* 1. About Hero Image */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900">About Page Hero / Top Banner</span>
                {Boolean(s.aboutHeroImage) && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, aboutHeroImage: "" })}
                    className="text-[11px] text-destructive hover:underline font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
              <AdminImageUpload
                label=""
                value={s.aboutHeroImage || ""}
                onChange={(url) => setS({ ...s, aboutHeroImage: url })}
              />
              <p className="text-[11px] text-muted-foreground">
                Main spiritual header visual for the About Us page. When unset, defaults to sacred Krishna artwork.
              </p>
            </div>

            {/* 2. Vrindavan Story Image */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900">Vrindavan Story Section Image</span>
                {Boolean(s.aboutStoryImage) && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, aboutStoryImage: "" })}
                    className="text-[11px] text-destructive hover:underline font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
              <AdminImageUpload
                label=""
                value={s.aboutStoryImage || ""}
                onChange={(url) => setS({ ...s, aboutStoryImage: url })}
              />
              <p className="text-[11px] text-muted-foreground">
                Featured image in the "Our Vrindavan Story" section.
              </p>
            </div>

            {/* 2B. Vrindavan Story Video */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900">Vrindavan Story Video URL (VIDEO 2)</span>
                {Boolean(s.aboutStoryVideo) && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, aboutStoryVideo: "" })}
                    className="text-[11px] text-destructive hover:underline font-medium"
                  >
                    Clear Video (Use Image Fallback)
                  </button>
                )}
              </div>
              <In
                label=""
                placeholder="https://.../vrindavan-story.mp4"
                value={s.aboutStoryVideo || ""}
                onChange={(url) => setS({ ...s, aboutStoryVideo: url.trim() })}
              />
              <p className="text-[11px] text-muted-foreground">
                MP4/WebM video URL for the Sacred History of Shri Radha Govind Dev Ji section on the About Us page. Autoplays muted on loop. If empty, falls back to the story image above.
              </p>
              {Boolean(s.aboutStoryVideo) && (
                <div className="mt-2 rounded-lg border border-stone-200 overflow-hidden bg-black/5 p-2">
                  <p className="text-[10px] font-medium text-stone-600 mb-1">Live Video Preview:</p>
                  <video
                    src={s.aboutStoryVideo}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full max-h-48 object-cover rounded"
                  />
                </div>
              )}
            </div>

            {/* 3. Manoj K. S. (Founder) Photo */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900">Manoj K. S. — Founder Photo</span>
                {Boolean(s.aboutManojImage) && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, aboutManojImage: "" })}
                    className="text-[11px] text-destructive hover:underline font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
              <AdminImageUpload
                label=""
                value={s.aboutManojImage || ""}
                onChange={(url) => setS({ ...s, aboutManojImage: url })}
              />
              <p className="text-[11px] text-muted-foreground">
                Founder · Operations & Logistics photo in the Meet Our Team section.
              </p>
            </div>

            {/* 4. Govind Brajwasi Photo */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900">Govind Brajwasi — Shop & Packing Photo</span>
                {Boolean(s.aboutGovindImage) && (
                  <button
                    type="button"
                    onClick={() => setS({ ...s, aboutGovindImage: "" })}
                    className="text-[11px] text-destructive hover:underline font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
              <AdminImageUpload
                label=""
                value={s.aboutGovindImage || ""}
                onChange={(url) => setS({ ...s, aboutGovindImage: url })}
              />
              <p className="text-[11px] text-muted-foreground">
                Packing & Offline Shop Seva photo in the Meet Our Team section.
              </p>
            </div>

            {/* 5. Developer Profile Control Card */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-3 sm:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">Developer Profile</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        s.showDeveloperProfile !== false
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-stone-100 text-stone-600 border-stone-300"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          s.showDeveloperProfile !== false ? "bg-emerald-500" : "bg-stone-400"
                        }`}
                      />
                      {s.showDeveloperProfile !== false ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Control whether the developer profile is displayed on the public About Us page.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={savingDevProfile}
                    onClick={async () => {
                      const updated = s.showDeveloperProfile === false;
                      setSavingDevProfile(true);
                      try {
                        setS((prev) => ({ ...prev, showDeveloperProfile: updated }));
                        await onSave({ showDeveloperProfile: updated });
                      } finally {
                        setSavingDevProfile(false);
                      }
                    }}
                    className={`inline-flex items-center justify-center gap-2 min-w-[140px] px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      s.showDeveloperProfile !== false
                        ? "bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
                        : "bg-[#166F77] hover:bg-[#12585f] text-white"
                    }`}
                  >
                    {savingDevProfile ? (
                      <span className="inline-flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving...
                      </span>
                    ) : s.showDeveloperProfile !== false ? (
                      "Disable Profile"
                    ) : (
                      "Enable Profile"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: WhatsApp Notification Template */}
        <section className="bg-white rounded-xl border border-border p-6 shadow-sm space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <h2 className="font-display text-xl text-[#166F77] flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp Notification Template
            </h2>
            <span className="text-[11px] text-muted-foreground">Click-to-chat order template</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Customise the message opened when clicking the "WhatsApp Customer" button on orders. Dynamic tags will be replaced automatically.
          </p>
          <div className="flex flex-wrap gap-1.5 py-1">
            {["{{FIRST_NAME}}", "{{ORDER_ID}}", "{{TRACKING_ID}}", "{{SHIPPING_SERVICE}}", "{{TRACKING_LINK}}"].map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono border border-slate-200 select-all">
                {tag}
              </span>
            ))}
          </div>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Message Template</span>
            <textarea
              value={s.whatsappTemplate ?? ""}
              onChange={(e) => setS({ ...s, whatsappTemplate: e.target.value })}
              rows={6}
              placeholder={`🙏 Hare Krishna {{FIRST_NAME}},\n\nYour order {{ORDER_ID}} has been shipped.\n\nTracking ID: {{TRACKING_ID}}\nCourier: {{SHIPPING_SERVICE}}\nTrack: {{TRACKING_LINK}}\n\nThank you for shopping with Shri Radha Govind Store.\n\nHare Krishna 🙏`}
              className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary font-mono leading-relaxed"
            />
          </label>
        </section>
      </div>
      <div className="flex justify-end mt-6">
        <button
          onClick={() => onSave(s)}
          className="h-11 px-8 rounded-full bg-primary text-primary-foreground font-medium shadow hover:bg-primary/90 transition"
        >
          Save All Settings
        </button>
      </div>
    </div>
  );
}

function SendInvoiceDialog({
  order,
  onClose,
  onSuccess,
}: {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [adminNote, setAdminNote] = useState(order.invoiceRequest?.adminNote || "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    oneTimeDownloadUrl: string;
    expiresAt: string;
    whatsAppUrl?: string | null;
    whatsAppDisabledReason?: string | null;
    message: string;
  } | null>(null);

  const customerName = order.address?.name || "Customer";
  const customerEmail = order.customerEmail || "";
  const orderNum = displayOrderNumber(order);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        order: any;
        oneTimeDownloadUrl: string;
        expiresAt: string;
        whatsAppUrl?: string | null;
        whatsAppDisabledReason?: string | null;
      }>(`/admin/orders/${order.id}/send-invoice`, {
        method: "POST",
        body: { adminNote: adminNote.trim() },
      });
      if (res?.ok) {
        toast.success(res.message || "Invoice sent successfully");
        setResult({
          oneTimeDownloadUrl: res.oneTimeDownloadUrl,
          expiresAt: res.expiresAt,
          whatsAppUrl: res.whatsAppUrl,
          whatsAppDisabledReason: res.whatsAppDisabledReason,
          message: res.message,
        });
        onSuccess();
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invoice");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] grid place-items-center p-4">
      <div
        className="bg-white text-foreground rounded-2xl border border-border p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2 text-primary">
            <FileText className="h-5 w-5" />
            <h3 className="font-bold text-lg text-foreground">Fulfill Invoice Request</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-stone-50/70 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order:</span>
                <span className="font-bold text-foreground">#{orderNum}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer Email:</span>
                <span className="font-semibold text-primary">{customerEmail || "Not provided"}</span>
              </div>
              {order.address?.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Phone:</span>
                  <span className="font-semibold text-foreground">{order.address.phone}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Clicking <b>Confirm & Send Invoice</b> will automatically generate the official PDF tax invoice, attach it to an email sent to <b>{customerEmail}</b>, generate a secure <b>48-hour single-use website download link</b>, and prepare a <b>pre-filled WhatsApp message</b>.
            </p>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">
                Admin Note / Audit Record (Optional)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={2}
                placeholder="e.g. Sent tax invoice upon customer request..."
                className="w-full rounded-lg border border-border p-2.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !customerEmail}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold inline-flex items-center gap-2 transition shadow-sm disabled:opacity-50"
              >
                {sending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {sending ? "Sending Invoice..." : "Confirm & Send Invoice"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-950 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-emerald-900 text-sm">Invoice Successfully Dispatched!</p>
                <p className="text-emerald-800">
                  The official tax invoice PDF was attached and emailed to <b>{customerEmail}</b>.
                </p>
                <p className="text-emerald-700 text-[11px]">
                  Valid for 48 hours until: {new Date(result.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">
                Single-Use Website Download Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={result.oneTimeDownloadUrl}
                  className="flex-1 rounded-lg border border-border p-2 text-xs font-mono bg-muted/30 text-foreground truncate"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.oneTimeDownloadUrl);
                    toast.success("Download link copied to clipboard");
                  }}
                  className="px-3 py-2 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted text-foreground transition inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This link allows one-time invoice download directly on the website without re-authentication.
              </p>
            </div>

            <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              {result.whatsAppUrl ? (
                <a
                  href={result.whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-emerald-600/30 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition shadow-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Send via WhatsApp</span>
                </a>
              ) : (
                <span
                  title={result.whatsAppDisabledReason || "Phone number not available"}
                  className="text-xs text-muted-foreground/70 italic"
                >
                  WhatsApp link unavailable ({result.whatsAppDisabledReason || "No phone"})
                </span>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderManager({
  order: initialOrder,
  fetchEvents,
  onClose,
  onSave,
  onSendInvoice,
  onRefundSuccess,
}: {
  order: Order;
  fetchEvents?: (id: string) => Promise<{ events: CourierEvent[]; order: Order } | null>;
  onClose: () => void;
  onSave: (patch: {
    trackingId?: string;
    courier?: Courier | null;
    courierTrackingUrl?: string;
    status?: Order["status"];
    holdReason?: string;
    note?: string;
  }) => void;
  onSendInvoice?: (order: Order) => void;
  onRefundSuccess?: (order: Order) => void;
}) {
  const { settings } = useStore();
  const [order, setOrder] = useState<Order>(initialOrder);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [trackingId, setTrackingId] = useState(initialOrder.trackingId ?? "");
  const [courier, setCourier] = useState<Courier | "">(initialOrder.courier ?? "");
  const [courierTrackingUrl, setCourierTrackingUrl] = useState(
    initialOrder.courierTrackingUrl ?? ""
  );
  const [status, setStatus] = useState<Order["status"]>(initialOrder.status);
  const [holdReason, setHoldReason] = useState<string>(initialOrder.holdReason ?? "");
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [pendingHoldReason, setPendingHoldReason] = useState<string>(initialOrder.holdReason ?? "");
  const [holdReasonError, setHoldReasonError] = useState("");
  const [showManualRefundModal, setShowManualRefundModal] = useState(false);
  const [note, setNote] = useState("");
  const [courierChargeInput, setCourierChargeInput] = useState<number>(initialOrder.courierCharge ?? 0);
  const [savingCourierCharge, setSavingCourierCharge] = useState(false);

  const saveCourierCharge = async () => {
    setSavingCourierCharge(true);
    try {
      const res = await api<{ order: any }>(`/admin/orders/${order.id}/courier-charge`, {
        method: "PATCH",
        body: { courierCharge: Number(courierChargeInput) || 0 },
      });
      if (res?.order) {
        setOrder((prev) => ({
          ...prev,
          courierCharge: res.order.courierCharge,
          packagingCost: res.order.packagingCost,
          razorpayFee: res.order.razorpayFee,
          productCost: typeof res.order.productCost === "number" ? res.order.productCost : undefined,
          totalExpense: typeof res.order.totalExpense === "number" ? res.order.totalExpense : undefined,
          netProfit: typeof res.order.netProfit === "number" ? res.order.netProfit : undefined,
        }));
        toast.success("Courier charge updated and finances recalculated");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update courier charge");
    } finally {
      setSavingCourierCharge(false);
    }
  };

  const STATUSES: Order["status"][] = [
    "Placed",
    "Confirmed",
    "Processing",
    "Hold",
    "Packed",
    "Shipped",
    "Out for delivery",
    "Delivered",
    "Cancelled",
  ];

  const ALLOWED_ADMIN_TRANSITIONS: Record<Order["status"], Order["status"][]> = {
    Placed: ["Confirmed", "Cancelled"],
    Confirmed: ["Processing", "Cancelled"],
    Processing: ["Hold", "Packed", "Cancelled"],
    Hold: ["Processing", "Cancelled"],
    Packed: ["Shipped", "Cancelled"],
    Shipped: ["Out for delivery", "Delivered", "Cancelled"],
    "Out for delivery": ["Delivered", "Cancelled"],
    Delivered: [],
    Cancelled: [],
  };

  // ---- Auto courier event sync (poll backend every 15s) ----
  useEffect(() => {
    if (!fetchEvents) return;
    let alive = true;
    const sync = async () => {
      setSyncing(true);
      const r = await fetchEvents(initialOrder.id);
      if (alive && r) {
        setEvents(r.events);
        setOrder(r.order);
        setLastSync(Date.now());
      }
      if (alive) setSyncing(false);
    };
    sync();
    const t = setInterval(sync, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [fetchEvents, initialOrder.id]);

  const manualRefresh = async () => {
    if (!fetchEvents) return;
    setSyncing(true);
    const r = await fetchEvents(initialOrder.id);
    if (r) {
      setEvents(r.events);
      setOrder(r.order);
      setLastSync(Date.now());
    }
    setSyncing(false);
  };

  const derivedUrl = courierTrackingUrl.trim() || getCourierTrackingUrl(courier, trackingId);

  const handleStatusSelect = (newStatus: Order["status"]) => {
    if (newStatus === "Hold") {
      setPendingHoldReason(holdReason || order.holdReason || "");
      setHoldReasonError("");
      setShowHoldModal(true);
    } else {
      setStatus(newStatus);
      if (status === "Hold" || order.status === "Hold") {
        setHoldReason("");
      }
    }
  };

  const confirmHold = () => {
    const cleanReason = pendingHoldReason.trim();
    if (!cleanReason) {
      setHoldReasonError("A specific hold reason is mandatory when placing an order on hold.");
      return;
    }
    setHoldReason(cleanReason);
    setStatus("Hold");
    setShowHoldModal(false);
    setHoldReasonError("");
  };

  const submit = () => {
    if (status === "Hold" && !holdReason.trim()) {
      setShowHoldModal(true);
      setHoldReasonError("A hold reason is mandatory when placing an order on hold.");
      return;
    }
    const patch: Parameters<typeof onSave>[0] = {
      status,
      holdReason: status === "Hold" ? holdReason.trim() : "",
      note: note.trim() || undefined,
    };
    if (trackingId.trim()) patch.trackingId = trackingId.trim().toUpperCase();
    patch.courier = (courier || null) as Courier | null;
    patch.courierTrackingUrl = courierTrackingUrl.trim() || derivedUrl;
    onSave(patch);
  };

  const allowedNextStatuses = ALLOWED_ADMIN_TRANSITIONS[order.status] || [];

  // ----- timeline derived from current status + timestamps -----
  const TIMELINE: Order["status"][] = [
    "Placed",
    "Confirmed",
    "Processing",
    "Packed",
    "Shipped",
    "Out for delivery",
    "Delivered",
  ];
  const isCancelled = order.status === "Cancelled" || status === "Cancelled";
  const isHold = order.status === "Hold" || status === "Hold";
  const currentIdx = isCancelled
    ? -1
    : isHold
      ? 2
      : Math.max(0, TIMELINE.indexOf(status || order.status));
  const fmt = (ts: number | string) =>
    new Date(ts).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const payBadge =
    order.payment?.status === "paid"
      ? "bg-green-600/10 text-green-700 border-green-600/20"
      : order.payment?.status === "failed"
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : "bg-amber-500/10 text-amber-700 border-amber-500/20";

  // Itemized calculations for table
  const enrichedItems = (order.items || []).map((item, idx) => {
    const pName = item.product?.name || "Product";
    const unitPrice = item.price ?? item.product?.price ?? 0;
    const qty = item.qty || 1;
    const itemTotal = unitPrice * qty;
    const hsn = item.hsnCode || item.product?.hsnCode || "-";
    const gstRate = typeof item.gstRate === "number" && item.gstRate > 0
      ? item.gstRate
      : (typeof item.product?.gstRate === "number" ? item.product.gstRate : 0);
    const isInclusive = item.product?.gstInclusive !== false;

    let taxable = item.taxableAmount;
    let gstAmt = item.gstAmount;

    if (taxable === undefined || gstAmt === undefined) {
      if (gstRate > 0) {
        if (isInclusive) {
          taxable = +(itemTotal / (1 + gstRate / 100)).toFixed(2);
          gstAmt = +(itemTotal - taxable).toFixed(2);
        } else {
          taxable = itemTotal;
          gstAmt = +((itemTotal * gstRate) / 100).toFixed(2);
        }
      } else {
        taxable = itemTotal;
        gstAmt = 0;
      }
    }

    return {
      idx: idx + 1,
      name: pName,
      image: item.product?.image,
      qty,
      unitPrice,
      hsn,
      gstRate,
      taxable,
      gstAmt,
      itemTotal,
    };
  });

  const computedSubtotal =
    order.subtotal ?? enrichedItems.reduce((sum, i) => sum + i.itemTotal, 0);
  const computedTaxableSubtotal =
    order.taxableAmount ?? enrichedItems.reduce((sum, i) => sum + i.taxable, 0);
  const computedGstTotal =
    order.gstTotal ?? enrichedItems.reduce((sum, i) => sum + i.gstAmt, 0);

  const customerState = (order.address?.state || "").trim().toLowerCase();
  const isIntraState =
    customerState.includes("uttar") || customerState === "up";

  const cgstVal = order.cgst !== undefined ? order.cgst : isIntraState ? +(computedGstTotal / 2).toFixed(2) : 0;
  const sgstVal = order.sgst !== undefined ? order.sgst : isIntraState ? +(computedGstTotal / 2).toFixed(2) : 0;
  const igstVal = order.igst !== undefined ? order.igst : !isIntraState ? computedGstTotal : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-3 sm:p-5 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white text-foreground rounded-2xl border border-border p-5 sm:p-7 w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Top Modal Header ---- */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-2xl font-bold text-primary">
                Order #{displayOrderNumber(order)}
              </h2>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-semibold ${
                  order.status === "Delivered"
                    ? "bg-green-600/10 text-green-700"
                    : order.status === "Cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : order.status === "Hold"
                        ? "bg-amber-500/15 text-amber-800 border border-amber-300 font-bold"
                        : "bg-primary/10 text-primary"
                }`}
              >
                {order.status || "Placed"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Placed on {fmt(order.createdAt)}</span>
              <span>•</span>
              <span className="font-semibold text-foreground">Grand Total: {formatINR(order.total)}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <WhatsAppCustomerButton order={order} template={settings.whatsappTemplate} variant="sm" />
            <button
              type="button"
              onClick={() => downloadOrderInvoicePdf(order)}
              className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted text-foreground transition inline-flex items-center gap-1.5 shadow-sm"
              title="Download Tax Invoice PDF"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Download Invoice (PDF)</span>
            </button>

            {fetchEvents && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-600/10 text-green-700 text-[11px] font-medium"
                title="Auto-syncs every 15s"
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-green-600 ${syncing ? "animate-pulse" : ""}`} />
                Live -{" "}
                {lastSync
                  ? new Date(lastSync).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "syncing..."}
              </div>
            )}
            {fetchEvents && (
              <button
                onClick={manualRefresh}
                disabled={syncing}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-50 border"
                aria-label="Refresh events"
                title="Refresh order events"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted border text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ---- Invoice Request Alert Banner ---- */}
        {order.invoiceRequest?.status === "pending" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-amber-900 flex items-center gap-2">
                  <span>Customer Requested Tax Invoice</span>
                  {order.invoiceRequest.requestedAt && (
                    <span className="text-xs font-normal text-amber-700">
                      (requested on {fmt(order.invoiceRequest.requestedAt)})
                    </span>
                  )}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Direct 7-day post-delivery download has expired. Customer has requested an official invoice.
                </p>
              </div>
            </div>
            {onSendInvoice && (
              <button
                type="button"
                onClick={() => onSendInvoice(order)}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition shadow-sm shrink-0 inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Invoice Now</span>
              </button>
            )}
          </div>
        )}

        {/* ---- Hold Alert Banner ---- */}
        {(status === "Hold" || order.status === "Hold") && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-amber-900 flex items-center gap-2">
                  <span>Order is ON HOLD</span>
                  {order.holdAt && (
                    <span className="text-xs font-normal text-amber-700">
                      (since {fmt(order.holdAt)})
                    </span>
                  )}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  <span className="font-semibold">Reason: </span>
                  {holdReason || order.holdReason || "Hold reason is mandatory before saving."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPendingHoldReason(holdReason || order.holdReason || "");
                  setShowHoldModal(true);
                }}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-sm"
              >
                Edit Reason
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus("Processing");
                  setHoldReason("");
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition shadow-sm"
              >
                Resume Processing
              </button>
            </div>
          </div>
        )}

        {/* ---- 2-Column Info Grid: Customer Information & Delivery Address ---- */}
        <div className="grid md:grid-cols-2 gap-4 text-xs">
          {/* Customer Information Card */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">
              Customer Information
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer Name:</span>
                <span className="font-bold text-foreground text-sm">{order.address?.name || "Customer"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Primary Phone:</span>
                <span className="font-semibold text-foreground font-mono">{order.address?.phone || "-"}</span>
              </div>
              {(order.address?.alternatePhone || order.alternatePhone) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Alternate Phone:</span>
                  <span className="font-semibold text-foreground font-mono">{order.address?.alternatePhone || order.alternatePhone}</span>
                </div>
              )}
              {order.customerEmail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email Address:</span>
                  <span className="font-medium text-foreground">{order.customerEmail}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Placed Date & Time:</span>
                <span className="text-foreground">{fmt(order.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Shipping & Delivery Address Card */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b pb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Shipping & Delivery Address
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    const txt = generateOrderShippingPlainText(order);
                    navigator.clipboard.writeText(txt);
                    toast.success(`Order #${displayOrderNumber(order)} shipping details copied`);
                  } catch {
                    toast.error("Failed to copy address");
                  }
                }}
                className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                title="Copy minimal shipping address label"
              >
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </button>
            </div>
            <div className="space-y-1 leading-relaxed text-foreground">
              {order.address?.line1 && <div>{order.address.line1}</div>}
              {order.address?.line2 && <div className="text-muted-foreground">{order.address.line2}</div>}
              {order.address?.postOffice && <div>Post Office (PO): {order.address.postOffice}</div>}
              <div className="font-semibold pt-0.5">
                {[order.address?.city, order.address?.state].filter(Boolean).join(", ")}
                {order.address?.pincode ? ` - ${order.address.pincode}` : ""}
              </div>
            </div>
            {(order.businessName || order.gstin) && (
              <div className="pt-2 border-t border-border/60 text-[11px] space-y-1">
                {order.businessName && (
                  <div>
                    <span className="text-muted-foreground">Business: </span>
                    <span className="font-semibold text-foreground">{order.businessName}</span>
                  </div>
                )}
                {order.gstin && (
                  <div>
                    <span className="text-muted-foreground">Customer GSTIN: </span>
                    <span className="font-mono font-semibold text-foreground">{order.gstin}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- Itemized Products Table with GST & HSN ---- */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b flex items-center justify-between text-xs font-bold text-foreground">
            <span>Itemized Products & Tax Details ({enrichedItems.length})</span>
            <span className="text-muted-foreground font-normal">Seller GSTIN: 09CHYPN5573J1Z9</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/20 border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">HSN Code</th>
                  <th className="p-3 text-center">GST Rate</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">Taxable Amt</th>
                  <th className="p-3 text-right">GST Amt</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {enrichedItems.map((item) => (
                  <tr key={item.idx} className="hover:bg-muted/10">
                    <td className="p-3 text-muted-foreground">{item.idx}</td>
                    <td className="p-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {item.image && (
                          <img
                            src={item.image}
                            alt=""
                            className="h-8 w-8 rounded object-cover bg-muted border shrink-0"
                          />
                        )}
                        <span className="max-w-xs truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">{item.hsn}</td>
                    <td className="p-3 text-center font-medium">{item.gstRate}%</td>
                    <td className="p-3 text-center font-bold">{item.qty}</td>
                    <td className="p-3 text-right">{formatINR(item.unitPrice)}</td>
                    <td className="p-3 text-right">{formatINR(item.taxable)}</td>
                    <td className="p-3 text-right">{formatINR(item.gstAmt)}</td>
                    <td className="p-3 text-right font-bold text-foreground">{formatINR(item.itemTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- 3-Column Info Grid: Amount Breakdown, Payment Details, & Order Finances ---- */}
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          {/* Financial & Tax Breakdown Card */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">
              Financial & GST Tax Breakdown
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span>Items Subtotal:</span>
                <span className="font-medium text-foreground">{formatINR(computedSubtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping Fee:</span>
                <span className="font-medium text-foreground">
                  {order.shipping === 0 ? "FREE" : order.shipping ? formatINR(order.shipping) : "FREE"}
                </span>
              </div>
              {order.codFee !== undefined && order.codFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>COD Handling Fee:</span>
                  <span className="font-medium text-foreground">{formatINR(order.codFee)}</span>
                </div>
              )}
              {order.packagingFee !== undefined && order.packagingFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Packaging Fee:</span>
                  <span className="font-medium text-foreground">{formatINR(order.packagingFee)}</span>
                </div>
              )}
              {order.discount !== undefined && order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span className="font-medium">-{formatINR(order.discount)}</span>
                </div>
              )}
              <div className="pt-1.5 border-t border-border/60 flex justify-between text-muted-foreground">
                <span>Taxable Amount (Base Value):</span>
                <span className="font-semibold text-foreground">{formatINR(computedTaxableSubtotal)}</span>
              </div>
              {igstVal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>IGST (Integrated Tax - Inter-State):</span>
                  <span className="font-semibold text-foreground">{formatINR(igstVal)}</span>
                </div>
              )}
              {cgstVal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>CGST (Central Tax - Intra-State):</span>
                  <span className="font-semibold text-foreground">{formatINR(cgstVal)}</span>
                </div>
              )}
              {sgstVal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>SGST (State Tax - Intra-State):</span>
                  <span className="font-semibold text-foreground">{formatINR(sgstVal)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Total GST (12%):</span>
                <span className="font-semibold text-foreground">{formatINR(computedGstTotal)}</span>
              </div>
              <div className="pt-2 border-t border-border flex items-baseline justify-between">
                <span className="font-bold text-sm text-foreground">Grand Total:</span>
                <span className="font-display font-bold text-lg text-primary">{formatINR(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Payment & Transaction Details Card */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">
              Payment & Transaction Details
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-bold text-foreground capitalize">
                  {order.payment?.method === "razorpay" ? "Online (Razorpay)" : "Cash on Delivery (COD)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payment Status:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${payBadge}`}>
                  {order.payment?.status || "pending"}
                </span>
              </div>
              {order.payment?.razorpayOrderId && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Razorpay Order ID:</span>
                  <span className="font-mono text-foreground">{order.payment.razorpayOrderId}</span>
                </div>
              )}
              {order.payment?.razorpayPaymentId && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Razorpay Payment ID:</span>
                  <span className="font-mono font-semibold text-foreground">{order.payment.razorpayPaymentId}</span>
                </div>
              )}
              {order.payment?.failureReason && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-[11px]">
                  <span className="font-semibold">Failure Reason: </span>
                  <span>{order.payment.failureReason}</span>
                </div>
              )}

              {/* Manual UPI Refund Section for Cancelled Online Orders */}
              {isRefundPending(order) && (
                <div className="mt-3 p-3.5 rounded-xl border border-amber-300 bg-amber-50/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs">
                    <Clock className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Refund Pending</span>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Customer paid <span className="font-semibold">{formatINR(order.total)}</span> via Razorpay.
                    This order is cancelled and requires a manual UPI refund.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowManualRefundModal(true)}
                    className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Record Manual Refund</span>
                  </button>
                </div>
              )}

              {isOrderRefunded(order) && (
                <div className="mt-3 p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/80 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-950 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>Manual Refund Processed</span>
                  </div>
                  <div className="flex justify-between text-emerald-900">
                    <span>Refunded Amount:</span>
                    <span className="font-bold">{formatINR(order.refund?.amount || order.refundedAmount || order.total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900">
                    <span>Method:</span>
                    <span className="font-semibold uppercase">UPI</span>
                  </div>
                  {order.refund?.upiReference && (
                    <div className="flex justify-between text-emerald-900">
                      <span>UPI Reference:</span>
                      <span className="font-mono font-semibold">{order.refund.upiReference}</span>
                    </div>
                  )}
                  {order.refund?.refundedAt && (
                    <div className="flex justify-between text-emerald-800 text-[11px]">
                      <span>Date:</span>
                      <span>{new Date(order.refund.refundedAt).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {order.refund?.refundedBy && (
                    <div className="flex justify-between text-emerald-800 text-[11px]">
                      <span>Recorded By:</span>
                      <span>{order.refund.refundedBy}</span>
                    </div>
                  )}
                  {order.refund?.notes && (
                    <div className="pt-1 border-t border-emerald-200 text-emerald-900 text-[11px]">
                      <span className="font-medium">Note: </span>
                      <span>{order.refund.notes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Order Financials & Net Profit (Admin Internal) */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-stone-200/80 pb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <IndianRupee className="h-3.5 w-3.5 text-stone-600" /> Order Financials
              </p>
              <span className="text-[10px] uppercase font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                Admin Only
              </span>
            </div>

            {(() => {
              const packCost = order.packagingCost ?? Math.round(computedSubtotal * 0.02 * 100) / 100;
              const isPaidOnline =
                order.payment?.method === "razorpay" &&
                (order.payment?.status === "paid" || order.status !== "Cancelled");
              const rFee =
                order.razorpayFee ?? (isPaidOnline ? Math.round(order.total * 0.0236 * 100) / 100 : 0);
              const cCharge = typeof order.courierCharge === "number" ? order.courierCharge : 0;
              const hasCost = typeof order.productCost === "number" && order.productCost !== null;
              const calcExpenses = hasCost
                ? Math.round((order.productCost! + packCost + rFee + cCharge) * 100) / 100
                : null;
              const calcProfit = calcExpenses !== null ? Math.round((order.total - calcExpenses) * 100) / 100 : null;

              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-stone-500">
                    <span>Product Subtotal:</span>
                    <span className="font-semibold text-stone-900">{formatINR(computedSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-stone-500">
                    <span>Shipping Charged:</span>
                    <span className="font-semibold text-stone-900">
                      {order.shipping === 0 ? "FREE (₹0)" : order.shipping ? formatINR(order.shipping) : "₹0"}
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-700 bg-stone-50 px-2 py-1 rounded border border-stone-200/60 font-medium">
                    <span>Total Revenue:</span>
                    <span className="font-bold text-stone-900">{formatINR(order.total)}</span>
                  </div>

                  <div className="pt-2 border-t border-stone-200/80 space-y-1.5">
                    <div className="flex justify-between text-stone-500">
                      <span>Product Cost (COGS):</span>
                      {hasCost ? (
                        <span className="font-medium text-stone-800">{formatINR(order.productCost!)}</span>
                      ) : (
                        <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">
                          Not Available
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-stone-500">
                      <span>Packaging Cost (2%):</span>
                      <span className="font-medium text-stone-800">{formatINR(packCost)}</span>
                    </div>
                    <div className="flex justify-between text-stone-500">
                      <span>Razorpay Fee (2.36%):</span>
                      <span className="font-medium text-stone-800">{formatINR(rFee)}</span>
                    </div>

                    {/* Editable Courier Charge */}
                    <div className="pt-2 border-t border-stone-200/80">
                      <label className="block">
                        <span className="text-stone-500 font-medium text-[11px]">Courier Charge (₹):</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="number"
                            min="0"
                            value={courierChargeInput}
                            onChange={(e) => setCourierChargeInput(Math.max(0, Number(e.target.value) || 0))}
                            className="h-8 w-24 rounded border border-stone-300 bg-white px-2 font-mono text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                          />
                          <button
                            type="button"
                            onClick={saveCourierCharge}
                            disabled={savingCourierCharge}
                            className="h-8 px-2.5 rounded bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-semibold transition disabled:opacity-60 cursor-pointer"
                          >
                            {savingCourierCharge ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </label>
                    </div>

                    {/* Total Expenses & Net Profit */}
                    <div className="pt-2 border-t border-stone-200/80 space-y-1">
                      <div className="flex justify-between text-stone-500">
                        <span>Total Expenses:</span>
                        {calcExpenses !== null ? (
                          <span className="font-semibold text-stone-900">{formatINR(calcExpenses)}</span>
                        ) : (
                          <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">
                            Not Available
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-dashed border-stone-200">
                        <span className="font-bold text-xs text-stone-900">Net Profit:</span>
                        <div className="text-right">
                          {calcProfit !== null ? (
                            <>
                              <span
                                className={`font-bold text-base ${
                                  calcProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                                }`}
                              >
                                {formatINR(calcProfit)}
                              </span>
                              {order.total > 0 && (
                                <span className="block text-[10px] font-semibold text-stone-400">
                                  {((calcProfit / order.total) * 100).toFixed(1)}% Margin
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-semibold text-stone-500 text-xs">
                                Not Available
                              </span>
                              <span className="block text-[10px] text-stone-400">
                                Historical cost data not recorded
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ---- Shipment & Tracking Management ---- */}
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-teal-700" /> Shipment & Tracking Setup
            </p>
            {derivedUrl && (
              <a
                href={derivedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 hover:underline"
              >
                Open Courier Tracker <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Quick Lifecycle Action Buttons */}
          {allowedNextStatuses.length > 0 && (
            <div className="pt-1 pb-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-900 mb-2">
                Allowed Lifecycle Actions:
              </p>
              <div className="flex flex-wrap gap-2">
                {allowedNextStatuses.map((nextSt) => (
                  <button
                    key={nextSt}
                    type="button"
                    onClick={() => handleStatusSelect(nextSt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm ${
                      nextSt === status
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                        : nextSt === "Hold"
                          ? "bg-amber-600 text-white hover:bg-amber-700"
                          : nextSt === "Cancelled"
                            ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                            : "bg-white border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {nextSt === "Hold" && <Pause className="h-3 w-3" />}
                    {nextSt === "Cancelled" && <XIcon className="h-3 w-3" />}
                    {nextSt !== "Hold" && nextSt !== "Cancelled" && <Check className="h-3 w-3" />}
                    <span>Move to {nextSt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3.5 pt-1">
            <label className="text-xs font-semibold text-foreground block">
              <span>Courier Partner</span>
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value as Courier | "")}
                className="mt-1 w-full h-11 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">- Not assigned -</option>
                {COURIERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-foreground block">
              <span>Tracking ID / AWB Number</span>
              <input
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder="e.g. U2000337996"
                className="mt-1 w-full h-11 rounded-lg border bg-background px-3 text-sm font-mono uppercase focus:outline-none focus:border-primary"
              />
            </label>

            <label className="text-xs font-semibold text-foreground block">
              <span>Fulfillment Status</span>
              <select
                value={status}
                onChange={(e) => handleStatusSelect(e.target.value as Order["status"])}
                className="mt-1 w-full h-11 rounded-lg border bg-background px-3 text-sm font-semibold focus:outline-none focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status === "Hold" && (
            <div className="space-y-1 pt-1">
              <label className="text-xs font-semibold text-amber-900 flex items-center justify-between">
                <span>Hold Reason <span className="text-destructive">*</span></span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingHoldReason(holdReason);
                    setShowHoldModal(true);
                  }}
                  className="text-[11px] text-amber-700 hover:underline font-medium"
                >
                  Edit in modal
                </button>
              </label>
              <input
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Mandatory reason for putting order on hold"
                className="w-full h-10 rounded-lg border border-amber-300 bg-amber-50/50 px-3 text-xs focus:outline-none focus:border-amber-600 text-amber-950 font-medium"
              />
            </div>
          )}

          <label className="text-xs font-semibold text-muted-foreground block">
            <span>Custom Courier Tracking URL (Optional - auto-derived if left empty)</span>
            <input
              value={courierTrackingUrl}
              onChange={(e) => setCourierTrackingUrl(e.target.value)}
              placeholder={derivedUrl ? `Auto-derived: ${derivedUrl}` : "https://courier.com/track/..."}
              className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:border-primary font-mono"
            />
          </label>
        </div>

        {/* ---- Timeline & Events Feed ---- */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Order Status Progress
          </p>
          {isCancelled ? (
            <div className="flex items-center gap-3 text-destructive bg-destructive/10 p-3 rounded-lg">
              <XIcon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Order cancelled</p>
                <p className="text-xs opacity-85">Customer was notified by email.</p>
              </div>
            </div>
          ) : (
            <ol className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {TIMELINE.map((step, i) => {
                const done = i <= currentIdx;
                const active = i === currentIdx;
                const stepIsHold = step === "Processing" && isHold;
                return (
                  <li
                    key={step}
                    className={`p-2.5 rounded-lg border text-center transition ${
                      stepIsHold
                        ? "border-amber-400 bg-amber-50 text-amber-900 font-bold shadow-sm ring-1 ring-amber-300"
                        : active
                          ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                          : done
                            ? "border-border bg-muted/30 text-foreground font-medium"
                            : "border-border/50 text-muted-foreground/60 opacity-70"
                    }`}
                  >
                    <div className="flex justify-center mb-1">
                      <span
                        className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold ${
                          stepIsHold
                            ? "bg-amber-600 text-white"
                            : done
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {stepIsHold ? <Pause className="h-3 w-3" /> : done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                    </div>
                    <p className="text-[11px] leading-tight truncate">
                      {stepIsHold ? "On Hold" : step}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Status History & Audit Trail */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-primary" /> Status History & Audit Trail
              </p>
              <ol className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {[...order.statusHistory].reverse().map((entry, i) => (
                  <li key={`${entry.changedAt}-${i}`} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        entry.status === "Hold"
                          ? "bg-amber-500 ring-2 ring-amber-300"
                          : entry.status === "Delivered"
                            ? "bg-emerald-500 ring-2 ring-emerald-300"
                            : entry.status === "Cancelled"
                              ? "bg-destructive ring-2 ring-destructive/30"
                              : i === 0
                                ? "bg-primary ring-2 ring-primary/30"
                                : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{entry.status}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono">
                          {entry.changedBy || "system"}
                        </span>
                      </div>
                      {entry.holdReason && (
                        <p className="text-amber-800 text-[11px] font-medium mt-0.5">
                          Hold reason: {entry.holdReason}
                        </p>
                      )}
                      {entry.note && (
                        <p className="text-muted-foreground text-[11px]">{entry.note}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{fmt(entry.changedAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Live synced event feed */}
          {events.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2.5">
                Courier Event Log (Live Synced)
              </p>
              <ol className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {[...events].reverse().map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        i === 0 ? "bg-primary ring-2 ring-primary/30" : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{ev.label}</p>
                      <p className="text-muted-foreground text-[11px]">{ev.description}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{fmt(ev.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* ---- Notice & Action Buttons ---- */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            Saving updates the Tracking ID and order status. A transactional notification email with the updated PDF invoice will be automatically sent to the customer.
          </p>

          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadOrderInvoicePdf(order)}
                className="h-11 px-5 rounded-xl border border-border text-xs font-semibold hover:bg-muted text-foreground transition inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4 text-primary" />
                <span>Download Invoice (PDF)</span>
              </button>
              {order.invoiceRequest?.status === "pending" && onSendInvoice && (
                <button
                  type="button"
                  onClick={() => onSendInvoice(order)}
                  className="h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition inline-flex items-center gap-2 shadow-sm"
                >
                  <Send className="h-4 w-4" />
                  <span>Send Invoice to Customer</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="h-11 px-6 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="h-11 px-7 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary/90 transition shadow-md"
              >
                <Truck className="h-4 w-4" /> Save & Notify Customer
              </button>
            </div>
          </div>
        </div>

        {/* ---- Hold Reason Modal Dialog ---- */}
        {showHoldModal && (
          <div className="fixed inset-0 bg-black/60 z-[60] grid place-items-center p-4">
            <div
              className="bg-white text-foreground rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5 text-amber-600 border-b pb-3">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-bold text-base text-foreground">Place Order on Hold</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the reason for placing this order on hold. This will be recorded in the order history and displayed to the customer on their tracking page.
              </p>
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Hold Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={pendingHoldReason}
                  onChange={(e) => {
                    setPendingHoldReason(e.target.value);
                    if (e.target.value.trim()) setHoldReasonError("");
                  }}
                  rows={3}
                  placeholder="e.g. Address verification needed / Stock awaiting dispatch / Customer requested delivery reschedule..."
                  className={`w-full rounded-lg border p-2.5 text-xs bg-background focus:outline-none focus:ring-2 ${
                    holdReasonError
                      ? "border-destructive focus:ring-destructive/30"
                      : "border-border focus:ring-primary/30"
                  }`}
                  autoFocus
                />
                {holdReasonError && (
                  <p className="text-[11px] text-destructive mt-1 font-medium">{holdReasonError}</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowHoldModal(false);
                    setHoldReasonError("");
                  }}
                  className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmHold}
                  className="px-5 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition shadow-sm"
                >
                  Apply Hold
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- Manual UPI Refund Dialog ---- */}
        {showManualRefundModal && (
          <RecordManualRefundDialog
            order={order}
            onClose={() => setShowManualRefundModal(false)}
            onSuccess={(updatedOrder) => {
              setOrder((prev) => ({
                ...prev,
                ...updatedOrder,
                payment: {
                  ...prev.payment,
                  ...(updatedOrder.payment || {}),
                  status: "refunded",
                },
                refundedAmount: updatedOrder.refundedAmount,
                refund: updatedOrder.refund,
              }));
              if (onRefundSuccess) onRefundSuccess(updatedOrder);
            }}
          />
        )}
      </div>
    </div>
  );
}

function RecordManualRefundDialog({
  order,
  onClose,
  onSuccess,
}: {
  order: Order;
  onClose: () => void;
  onSuccess: (updatedOrder: Order) => void;
}) {
  const [upiReference, setUpiReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refundableAmount = Math.max(
    0,
    (Number(order.total) || 0) - (Number(order.codFee) || 0) - (Number(order.refundedAmount) || 0)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = upiReference.trim();
    if (!cleanRef || cleanRef.length < 6) {
      toast.error("Please enter a valid UPI Reference / Transaction ID (minimum 6 characters).");
      return;
    }
    try {
      setSubmitting(true);
      const res = await api<{ ok: boolean; message: string; order: any }>(
        `/admin/orders/${order.id}/refund`,
        {
          method: "POST",
          body: {
            upiReference: cleanRef,
            notes: notes.trim() || undefined,
          },
        }
      );
      if (res?.ok && res.order) {
        toast.success(res.message || "Manual UPI refund recorded successfully!");
        onSuccess(res.order);
        onClose();
      } else {
        toast.error("Failed to record manual refund");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to record manual refund");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] grid place-items-center p-4">
      <div
        className="bg-white text-foreground rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2 text-amber-700">
            <RotateCcw className="h-5 w-5" />
            <h3 className="font-bold text-base text-foreground">Record Manual UPI Refund</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <span>Order #{displayOrderNumber(order)}</span>
              <span>•</span>
              <span>Refund Pending</span>
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              This records a manual UPI refund only. The website will not send money through Razorpay. Ensure you have transferred the funds via your banking/UPI app before recording.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
              <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">
                Refund Amount
              </span>
              <span className="font-bold text-base text-emerald-700 mt-0.5 block">
                {formatINR(refundableAmount)}
              </span>
              <span className="text-[10px] text-stone-400">Authoritative balance</span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
              <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">
                Refund Method
              </span>
              <span className="font-bold text-base text-stone-900 mt-0.5 block">
                UPI
              </span>
              <span className="text-[10px] text-stone-400">Manual transfer</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              UPI Reference / Transaction ID <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={upiReference}
              onChange={(e) => setUpiReference(e.target.value)}
              placeholder="e.g. 628192837192 or UPI-TXN-123456"
              className="w-full h-10 rounded-xl border border-stone-300 bg-white px-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 uppercase"
              required
              autoFocus
            />
            <span className="text-[10px] text-stone-500 mt-1 block">
              Reference number from your banking/UPI confirmation SMS or app
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Internal Audit Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Refunded to customer's Google Pay / PhonePe directly"
              rows={2}
              className="w-full rounded-xl border border-stone-300 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border text-xs font-semibold hover:bg-stone-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !upiReference.trim()}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm Manual Refund</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserDetail({
  user,
  onClose,
  onToggleBlock,
}: {
  user: RegisteredUser;
  onClose: () => void;
  onToggleBlock: (b: boolean) => void;
}) {
  const a = user.address ?? {};
  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg border border-border p-6 w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center text-lg font-medium">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2 className="font-display text-xl">{user.name}</h2>
              <p className="text-xs text-muted-foreground">
                {user.role.toUpperCase()} - {user.provider ?? "password"} - joined{" "}
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> {user.email}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />{" "}
            {user.phone || <span className="text-muted-foreground">No phone</span>}
          </p>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
            <p className="uppercase tracking-wider text-muted-foreground mb-1">Shipping Address</p>
            {a.line1 || a.city || a.pincode ? (
              <p>
                {a.line1}
                {a.line1 ? ", " : ""}
                {a.city}
                {a.state ? `, ${a.state}` : ""} {a.pincode}
              </p>
            ) : (
              <p className="text-muted-foreground">No address saved.</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat icon={ShoppingCart} label="Orders" value={String(user.ordersCount ?? 0)} />
            <Stat icon={IndianRupee} label="Spent" value={formatINR(user.totalSpent ?? 0)} />
            <Stat
              icon={user.isBlocked ? ShieldOff : ShieldCheck}
              label="Status"
              value={user.isBlocked ? "Blocked" : "Active"}
            />
          </div>
          {user.lastLoginAt && (
            <p className="text-[11px] text-muted-foreground">
              Last login: {new Date(user.lastLoginAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={onClose} className="h-10 px-5 rounded-full border text-sm">
            Close
          </button>
          {user.isBlocked ? (
            <button
              onClick={() => {
                onToggleBlock(false);
                onClose();
              }}
              className="h-10 px-5 rounded-full bg-green-600 text-white text-sm font-medium inline-flex items-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" /> Activate
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm(`Block ${user.name}? They will not be able to sign in.`)) {
                  onToggleBlock(true);
                  onClose();
                }
              }}
              className="h-10 px-5 rounded-full bg-destructive text-destructive-foreground text-sm font-medium inline-flex items-center gap-2"
            >
              <ShieldOff className="h-4 w-4" /> Block User
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryManager({
  categories,
  tree,
  products,
  onSave,
  onDelete,
  onReorder,
}: {
  categories: Category[];
  tree: (Category & { children: Category[] })[];
  products: Product[];
  onSave: (category: Partial<Category> & { name: string; id?: string }) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
  onReorder: (
    items: { id: string; sortOrder: number; parentId?: string | null }[],
  ) => Promise<void> | void;
}) {
  const empty = (): Partial<Category> & { name: string } => ({
    name: "",
    parentId: null,
    description: "",
    image: "",
    isActive: true,
    sortOrder: categories.length,
  });
  const [editing, setEditing] = useState<(Partial<Category> & { name: string }) | null>(null);
  const [dragging, setDragging] = useState<Category | null>(null);

  const move = (category: Category, direction: -1 | 1) => {
    const siblings = categories
      .filter((item) => (item.parentId ?? null) === (category.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === category.id);
    const target = siblings[index + direction];
    if (!target) return;
    onReorder([
      { id: category.id, sortOrder: target.sortOrder, parentId: category.parentId },
      { id: target.id, sortOrder: category.sortOrder, parentId: target.parentId },
    ]);
  };

  const dropBefore = (target: Category) => {
    if (
      !dragging ||
      dragging.id === target.id ||
      (dragging.parentId ?? null) !== (target.parentId ?? null)
    )
      return;
    const siblings = categories
      .filter((item) => (item.parentId ?? null) === (target.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = siblings.filter((item) => item.id !== dragging.id);
    reordered.splice(
      reordered.findIndex((item) => item.id === target.id),
      0,
      dragging,
    );
    onReorder(
      reordered.map((item, sortOrder) => ({ id: item.id, sortOrder, parentId: item.parentId })),
    );
    setDragging(null);
  };

  const handleToggleVisibility = async (category: Category) => {
    await onSave({
      id: category.id,
      name: category.name,
      isActive: !category.isActive,
    });
    toast.success(`${category.name} is now ${!category.isActive ? "Visible" : "Hidden"}`);
  };

  const handleAddSubcategory = (parentId: string) => {
    setEditing({
      ...empty(),
      parentId,
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Categories & Subcategories</h1>
          <p className="text-sm text-muted-foreground">
            Manage your store hierarchy. Subcategories remain under their parents even when hidden.
          </p>
        </div>
        <button
          onClick={() => setEditing(empty())}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Main Category
        </button>
      </div>
      <div className="mt-6 space-y-4">
        {tree.length === 0 && (
          <div className="rounded-lg bg-card p-8 text-center text-sm text-muted-foreground premium-shadow">
            No categories yet.
          </div>
        )}
        {tree.map((parent) => (
          <section key={parent.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <CategoryRow
              category={parent}
              count={parent.productCount}
              onEdit={() => setEditing(parent)}
              onDelete={onDelete}
              onMove={move}
              onToggleActive={() => handleToggleVisibility(parent)}
              onAddSubcategory={() => handleAddSubcategory(parent.id)}
              onDragStart={setDragging}
              onDrop={dropBefore}
            />
            {parent.children.length > 0 && (
              <div className="border-t border-border/70 bg-muted/20 pl-4 sm:pl-10 divide-y divide-border/40">
                {parent.children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    count={child.productCount}
                    onEdit={() => setEditing(child)}
                    onDelete={onDelete}
                    onMove={move}
                    onToggleActive={() => handleToggleVisibility(child)}
                    onDragStart={setDragging}
                    onDrop={dropBefore}
                    child
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      {editing && (
        <CategoryEditor
          category={editing}
          parents={categories.filter((item) => !item.parentId && item.id !== editing.id)}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            void Promise.resolve(onSave(value)).then(() => setEditing(null));
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({
  category,
  count,
  child = false,
  onEdit,
  onDelete,
  onMove,
  onToggleActive,
  onAddSubcategory,
  onDragStart,
  onDrop,
}: {
  category: Category;
  count: number;
  child?: boolean;
  onEdit: () => void;
  onDelete: (name: string) => Promise<void> | void;
  onMove: (category: Category, direction: -1 | 1) => void;
  onToggleActive: () => void;
  onAddSubcategory?: () => void;
  onDragStart: (category: Category) => void;
  onDrop: (category: Category) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(category)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(category)}
      className="flex flex-wrap items-center gap-3 p-3.5 sm:p-4 hover:bg-muted/10 transition"
    >
      <GripVertical
        className="h-5 w-5 cursor-grab text-muted-foreground/60 hover:text-foreground"
        aria-label={`Drag ${category.name} to sort`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold ${child ? "text-sm text-foreground" : "font-display text-base sm:text-lg text-foreground"}`}>
            {category.name}
          </p>
          {category.isActive ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Visible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Hidden
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {count} products • slug: <span className="font-mono text-[11px]">{category.slug || "auto"}</span>
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {!child && onAddSubcategory && (
          <button
            type="button"
            onClick={onAddSubcategory}
            className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15 transition mr-1"
          >
            <Plus className="h-3.5 w-3.5" /> Subcategory
          </button>
        )}

        <button
          type="button"
          onClick={onToggleActive}
          className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition"
          title={category.isActive ? "Click to Hide from storefront" : "Click to Show in storefront"}
          aria-label={`Toggle visibility of ${category.name}`}
        >
          {category.isActive ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-amber-600" />}
        </button>

        <button
          type="button"
          onClick={() => onMove(category, -1)}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted font-mono"
          aria-label={`Move ${category.name} up`}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(category, 1)}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted font-mono"
          aria-label={`Move ${category.name} down`}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition"
          aria-label={`Edit ${category.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${category.name}? Products in it will be hidden.`))
              onDelete(category.name);
          }}
          className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 transition"
          aria-label={`Delete ${category.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CategoryEditor({
  category,
  parents,
  onClose,
  onSave,
}: {
  category: Partial<Category> & { name: string };
  parents: Category[];
  onClose: () => void;
  onSave: (category: Partial<Category> & { name: string }) => Promise<void> | void;
}) {
  const [value, setValue] = useState(category);
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = value.name.trim();
          if (!name) return toast.error("Category name is required");
          setSaving(true);
          void Promise.resolve(onSave({ ...value, name })).finally(() => setSaving(false));
        }}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-card p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 className="font-display text-2xl">
            {category.id ? "Edit Category" : "New Category"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize main categories and subcategories for the storefront navigation.
          </p>
        </div>
        <In
          label="Category name *"
          value={value.name}
          onChange={(name) => setValue({ ...value, name })}
          placeholder="e.g. Tulsi Mala or Japa Mala"
        />
        <In
          label="SEO slug (optional - auto-generated if empty)"
          value={value.slug ?? ""}
          onChange={(slug) => setValue({ ...value, slug })}
          placeholder="e.g. tulsi-mala"
        />
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Parent Category</span>
          <select
            value={value.parentId ?? ""}
            onChange={(event) => setValue({ ...value, parentId: event.target.value || null })}
            className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm font-medium focus:outline-none focus:border-primary"
          >
            <option value="">None (Top level / Main Category)</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} {!parent.isActive ? "(Hidden)" : ""}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            Choose a parent to make this a subcategory, or leave as &quot;None&quot; for a main category.
          </span>
        </label>
        <AdminImageUpload
          label="Category banner / icon image"
          value={value.image ?? ""}
          onChange={(image) => setValue({ ...value, image })}
        />
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <textarea
            value={value.description ?? ""}
            onChange={(event) => setValue({ ...value, description: event.target.value })}
            rows={3}
            placeholder="Devotional description for this category..."
            className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary"
          />
        </label>
        <In
          label="Meta title (SEO)"
          value={value.metaTitle ?? ""}
          onChange={(metaTitle) => setValue({ ...value, metaTitle })}
          placeholder="e.g. Buy Original Tulsi Mala Online | Shri Radha Govind Store"
        />
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Meta description (SEO)</span>
          <textarea
            value={value.metaDescription ?? ""}
            onChange={(event) => setValue({ ...value, metaDescription: event.target.value })}
            rows={2}
            placeholder="Brief Google snippet (up to 160 chars)..."
            className="mt-1 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={value.isActive ?? true}
            onChange={(event) => setValue({ ...value, isActive: event.target.checked })}
            className="h-4 w-4 rounded border-border text-primary"
          />
          <span>Visible in storefront (Unchecking hides it from navigation)</span>
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full border px-5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            {saving ? "Saving..." : "Save Category"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BlogEditorFullPage({
  blog,
  onClose,
  onSave,
}: {
  blog: Blog;
  onClose: () => void;
  onSave: (blog: Blog) => void;
}) {
  const [value, setValue] = useState<Blog>(blog);
  const [showPreview, setShowPreview] = useState(false);

  const effectiveSlug = value.slug.trim() || slugify(value.title || "post");

  const handleSaveDraft = () => {
    if (!value.title.trim()) {
      toast.error("Please enter a blog title before saving draft");
      return;
    }
    onSave({
      ...value,
      title: value.title.trim(),
      slug: effectiveSlug,
      isPublished: false,
    });
  };

  const handlePublish = () => {
    if (!value.title.trim()) {
      toast.error("Please enter a blog title before publishing");
      return;
    }
    onSave({
      ...value,
      title: value.title.trim(),
      slug: effectiveSlug,
      isPublished: true,
      publishedAt: value.publishedAt || new Date().toISOString(),
    });
  };

  const handleUnpublish = () => {
    onSave({
      ...value,
      isPublished: false,
    });
  };

  return (
    <div className="space-y-6">
      {/* Sticky Top Action Bar */}
      <div className="sticky top-0 z-20 -mx-4 -mt-6 px-4 py-3 sm:py-4 bg-background/95 backdrop-blur-md border-b border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition inline-flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Blogs</span>
          </button>
          <div className="h-5 w-px bg-border/80 hidden sm:block shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-foreground truncate max-w-xs md:max-w-md">
              {value.title.trim() || "Untitled Post"}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  value.isPublished
                    ? "bg-green-600/10 text-green-700 border border-green-600/20"
                    : "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                }`}
              >
                {value.isPublished ? "Published" : "Draft"}
              </span>
              {value.publishedAt && (
                <span>
                  • {new Date(value.publishedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition inline-flex items-center gap-1.5 shadow-xs"
            title="Preview how article looks on store"
          >
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="h-9 px-3.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition inline-flex items-center gap-1.5 shadow-xs"
            title="Save as Draft"
          >
            <BookmarkCheck className="h-3.5 w-3.5 text-amber-600" />
            <span>Save Draft</span>
          </button>

          {value.isPublished ? (
            <>
              <button
                type="button"
                onClick={handleUnpublish}
                className="h-9 px-3 rounded-lg border border-amber-500/30 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition inline-flex items-center gap-1.5"
                title="Revert published post to draft"
              >
                <EyeOff className="h-3.5 w-3.5" />
                <span>Unpublish</span>
              </button>
              <button
                type="button"
                onClick={handlePublish}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Update Post</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              className="h-9 px-4 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition shadow-sm inline-flex items-center gap-1.5"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Publish Post</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Full-Page Editor Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Post Content (8 cols on desktop) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Post Title & Slug Card */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                Article Title *
              </label>
              <input
                value={value.title}
                onChange={(e) => setValue({ ...value, title: e.target.value })}
                placeholder="Enter post title (e.g. The Sacred Significance of Tulsi Mala in Daily Sadhana)..."
                className="w-full text-xl sm:text-2xl font-serif font-bold text-foreground bg-transparent border-0 border-b border-border/80 pb-2.5 focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
              />
            </div>

            {/* URL Slug Preview / Edit */}
            <div className="pt-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Permanent URL Slug
              </label>
              <div className="flex items-center rounded-lg border bg-muted/20 px-3 text-xs text-muted-foreground focus-within:border-primary focus-within:bg-background focus-within:text-foreground">
                <span className="font-mono text-muted-foreground/70 shrink-0">https://shriradhagovind.com/blog/</span>
                <input
                  value={value.slug}
                  onChange={(e) => setValue({ ...value, slug: e.target.value })}
                  placeholder={slugify(value.title || "post-slug")}
                  className="w-full bg-transparent py-2 px-1 font-mono text-xs text-foreground focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                Leave blank to automatically derive from title: <code className="bg-muted px-1 rounded">{effectiveSlug}</code>
              </p>
            </div>
          </div>

          {/* Excerpt / Summary Card */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Short Excerpt / Devotional Summary
              </label>
              <span className="text-[11px] text-muted-foreground">
                {value.excerpt.length} characters
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Brief summary displayed on the blog list cards, search snippets, and social sharing cards.
            </p>
            <textarea
              value={value.excerpt}
              onChange={(e) => setValue({ ...value, excerpt: e.target.value })}
              rows={3}
              placeholder="Write a 1-3 sentence summary explaining the spiritual essence and key takeaways of this article..."
              className="w-full rounded-xl border bg-background p-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 leading-relaxed font-sans"
            />
          </div>

          {/* Full Article Content Editor */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Full Article Content *
              </label>
              <span className="text-[11px] text-muted-foreground">
                Rich text formatting supported
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Format your text using Headings (H2, H3), Blockquotes, Font Family (Serif / Sans), Text Alignment, Bullet & Numbered lists, Bold, Italic, and Underline.
            </p>
            <SimpleRichEditor
              value={value.content}
              onChange={(content) => setValue({ ...value, content })}
              rows={20}
              extended={true}
              placeholder="Start writing the full devotional article..."
            />
          </div>
        </div>

        {/* Right Column: Publishing Sidebar (4 cols on desktop) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Publishing Settings Card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Publishing Details
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  value.isPublished
                    ? "bg-green-600/10 text-green-700 border border-green-600/20"
                    : "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                }`}
              >
                {value.isPublished ? "Live / Published" : "Draft (Hidden)"}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground block mb-1">Author Name</label>
                <input
                  value={value.author}
                  onChange={(e) => setValue({ ...value, author: e.target.value })}
                  placeholder="Shri Radha Govind Store"
                  className="w-full h-10 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground block mb-1">Publish Date</label>
                <input
                  type="date"
                  value={
                    value.publishedAt
                      ? new Date(value.publishedAt).toISOString().split("T")[0]
                      : new Date().toISOString().split("T")[0]
                  }
                  onChange={(e) => {
                    const d = e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString();
                    setValue({ ...value, publishedAt: d });
                  }}
                  className="w-full h-10 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-2 border-t flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="w-full h-9 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-foreground transition inline-flex items-center justify-center gap-1.5"
                >
                  <BookmarkCheck className="h-3.5 w-3.5 text-amber-600" />
                  <span>Save as Draft</span>
                </button>

                {value.isPublished ? (
                  <button
                    type="button"
                    onClick={handlePublish}
                    className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition inline-flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Update Published Post</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePublish}
                    className="w-full h-9 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition inline-flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Publish Post Now</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Featured Cover Image Card */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground border-b pb-2">
              Featured Cover Image
            </h3>
            <p className="text-xs text-muted-foreground">
              Main cover image displayed at the header of the article and in blog category listings.
            </p>
            <AdminImageUpload
              label="Upload cover image"
              value={value.image}
              onChange={(image) => setValue({ ...value, image })}
            />
          </div>

          {/* SEO & Search Engine Preview Card */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-indigo-200/70 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-indigo-700" /> SEO & Google Search Snippet
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-indigo-900 block mb-1">SEO Meta Title</label>
                <input
                  value={value.metaTitle ?? ""}
                  onChange={(e) => setValue({ ...value, metaTitle: e.target.value })}
                  placeholder={value.title || "Sacred Benefits of Tulsi Mala | Shri Radha Govind Store"}
                  className="w-full h-10 rounded-lg border border-indigo-200 bg-white px-3 text-xs focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="font-semibold text-indigo-900">SEO Meta Description</label>
                  <span className="text-[10px] text-indigo-700 font-mono">
                    {(value.metaDescription ?? "").length}/160
                  </span>
                </div>
                <textarea
                  value={value.metaDescription ?? ""}
                  onChange={(e) => setValue({ ...value, metaDescription: e.target.value })}
                  rows={2}
                  maxLength={160}
                  placeholder={value.excerpt || "Discover the authentic spiritual benefits and proper care of sacred malas from Vrindavan..."}
                  className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs focus:outline-none focus:border-indigo-600 leading-relaxed"
                />
              </div>

              {/* Realistic Google Snippet Preview */}
              <div className="mt-3 pt-3 border-t border-indigo-200/70">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-900/80 mb-1.5">
                  Google Search Result Preview
                </p>
                <div className="p-3 bg-white rounded-lg border border-indigo-200/80 text-left font-sans space-y-1 select-none">
                  <p className="text-[11px] text-[#202124] truncate">
                    https://shriradhagovind.com <span className="text-[#5f6368]">› blog › {effectiveSlug}</span>
                  </p>
                  <p className="text-sm text-[#1a0dab] font-medium hover:underline truncate">
                    {value.metaTitle?.trim() || value.title?.trim() || "Untitled Post | Shri Radha Govind Store"}
                  </p>
                  <p className="text-[11px] text-[#4d5156] line-clamp-2 leading-relaxed">
                    {value.metaDescription?.trim() || value.excerpt?.trim() || "Read authentic devotional guides, product care tips, and Vrindavan insights from Shri Radha Govind Store."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Live Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white text-foreground rounded-2xl border border-border w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-6 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Modal Header */}
            <div className="p-4 sm:px-6 border-b flex items-center justify-between bg-muted/20 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">Live Storefront Preview</span>
                <span className="text-xs text-muted-foreground">(/blog/{effectiveSlug})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Simulated Storefront Article Container */}
            <div className="p-6 sm:p-10 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">Shri Radha Govind Devotional Blog</p>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-foreground leading-tight">
                  {value.title || "Untitled Post Title"}
                </h1>
                <p className="text-xs text-muted-foreground pt-1 flex items-center gap-2">
                  <span>By {value.author || "Shri Radha Govind Store"}</span>
                  <span>•</span>
                  <span>
                    {value.publishedAt
                      ? new Date(value.publishedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : new Date().toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                  </span>
                </p>
              </div>

              {value.image && (
                <div className="rounded-xl overflow-hidden border max-h-[380px] bg-muted">
                  <img src={value.image} alt={value.title} className="w-full h-full object-cover" />
                </div>
              )}

              {value.excerpt && (
                <div className="p-4 rounded-xl bg-muted/30 border-l-4 border-primary text-sm italic text-muted-foreground">
                  {value.excerpt}
                </div>
              )}

              <div className="pt-2 text-foreground leading-relaxed">
                <FormattedText content={value.content || value.excerpt || "No article content written yet."} />
              </div>
            </div>

            <div className="p-4 border-t bg-muted/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlogManager({
  blogs,
  onSave,
  onDelete,
}: {
  blogs: Blog[];
  onSave: (blog: Blog) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const blank = (): Blog => ({
    id: "",
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    image: "",
    author: "Shri Radha Govind Store",
    isPublished: true,
    sortOrder: blogs.length,
    publishedAt: new Date().toISOString(),
  });

  const [editing, setEditing] = useState<Blog | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (editing) {
    return (
      <BlogEditorFullPage
        blog={editing}
        onClose={() => setEditing(null)}
        onSave={async (saved) => {
          await onSave(saved);
          setEditing(null);
        }}
      />
    );
  }

  const filteredBlogs = blogs.filter((b) => {
    if (statusFilter === "published" && !b.isPublished) return false;
    if (statusFilter === "draft" && b.isPublished) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (b.title || "").toLowerCase().includes(q);
      const matchAuthor = (b.author || "").toLowerCase().includes(q);
      const matchSlug = (b.slug || "").toLowerCase().includes(q);
      return matchTitle || matchAuthor || matchSlug;
    }
    return true;
  });

  const publishedCount = blogs.filter((b) => b.isPublished).length;
  const draftCount = blogs.filter((b) => !b.isPublished).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Blog CMS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Write, manage, and publish devotional articles, product care tips, and Vrindavan stories.
          </p>
        </div>
        <button
          onClick={() => setEditing(blank())}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="h-4 w-4" /> New Blog Post
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles by title, author, or slug..."
            className="w-full h-11 pl-9 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`h-11 px-4 rounded-lg text-xs font-semibold transition border ${
              statusFilter === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            All Articles ({blogs.length})
          </button>
          <button
            onClick={() => setStatusFilter("published")}
            className={`h-11 px-4 rounded-lg text-xs font-semibold transition border ${
              statusFilter === "published"
                ? "bg-green-600 text-white border-green-600 shadow-xs"
                : "bg-card text-muted-foreground border-border hover:border-green-600/50 hover:text-foreground"
            }`}
          >
            Published ({publishedCount})
          </button>
          <button
            onClick={() => setStatusFilter("draft")}
            className={`h-11 px-4 rounded-lg text-xs font-semibold transition border ${
              statusFilter === "draft"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-card text-muted-foreground border-border hover:border-amber-600/50 hover:text-foreground"
            }`}
          >
            Drafts ({draftCount})
          </button>
        </div>
      </div>

      {/* Blog Cards Grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredBlogs.length === 0 && (
          <div className="col-span-full rounded-xl bg-card p-12 text-center border border-border">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium text-base text-foreground">No blog posts found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search query or filter."
                : "Click '+ New Blog Post' to publish your first devotional guide."}
            </p>
          </div>
        )}

        {filteredBlogs.map((blog) => (
          <article
            key={blog.id}
            className="overflow-hidden rounded-xl bg-card border border-border hover:border-primary/40 transition shadow-xs flex flex-col justify-between group"
          >
            <div>
              {blog.image ? (
                <div className="h-44 w-full bg-muted overflow-hidden relative">
                  <img
                    src={blog.image}
                    alt={blog.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute top-3 right-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-xs ${
                        blog.isPublished
                          ? "bg-green-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {blog.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-28 w-full bg-muted/40 p-4 flex items-start justify-between border-b">
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      blog.isPublished
                        ? "bg-green-600/10 text-green-700 border border-green-600/20"
                        : "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                    }`}
                  >
                    {blog.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
              )}

              <div className="p-5 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{blog.author || "Shri Radha Govind Store"}</span>
                  <span>
                    {blog.publishedAt
                      ? new Date(blog.publishedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Unscheduled"}
                  </span>
                </div>

                <h2 className="font-serif text-lg font-bold text-foreground leading-snug line-clamp-2">
                  {blog.title}
                </h2>

                <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                  {blog.excerpt || "No summary excerpt provided."}
                </p>
              </div>
            </div>

            <div className="p-5 pt-0 border-t border-border/40 mt-4 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-muted-foreground/70 truncate max-w-[140px]">
                /blog/{blog.slug || slugify(blog.title)}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(blog)}
                  className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition inline-flex items-center gap-1"
                  aria-label={`Edit ${blog.title}`}
                >
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${blog.title}"? This cannot be undone.`)) onDelete(blog.id);
                  }}
                  className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition grid place-items-center"
                  aria-label={`Delete ${blog.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ReviewsManager() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  const loadReviews = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/reviews/admin`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load reviews");
      const data = await res.json();
      setReviews(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Could not fetch reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/reviews/admin/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update status");
      }
      toast.success(`Review marked as ${status}`);
      setReviews((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status } : r))
      );
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    }
  };

  const deleteReview = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this review?")) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/reviews/admin/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete review");
      toast.success("Review deleted");
      setReviews((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      toast.error(err.message || "Deletion failed");
    }
  };

  const filtered = reviews.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.customerName || "").toLowerCase().includes(q) ||
      (r.productName || "").toLowerCase().includes(q) ||
      (r.comment || "").toLowerCase().includes(q) ||
      String(r.orderNo || "").includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Product Reviews Moderation</h1>
          <p className="text-sm text-muted-foreground">
            Moderate genuine customer feedback before publishing to product pages. Only real purchasers can submit.
          </p>
        </div>
        <button
          onClick={loadReviews}
          disabled={loading}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-white text-xs font-semibold hover:bg-muted transition shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {(["all", "pending", "approved", "rejected"] as const).map((st) => {
            const count = st === "all" ? reviews.length : reviews.filter((r) => r.status === st).length;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                  statusFilter === st
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {st === "all" ? "All Reviews" : st.charAt(0).toUpperCase() + st.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search reviews..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 w-full rounded-lg border bg-white text-xs focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Loading reviews...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center text-muted-foreground">
          <Star className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-foreground">No reviews found</p>
          <p className="text-xs mt-1">There are no reviews matching the selected filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border text-xs text-muted-foreground uppercase tracking-wider text-left">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3 min-w-[200px]">Review Comment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50/70 transition">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {r.productImage && (
                        <img src={r.productImage} alt="" className="w-9 h-9 object-cover rounded border" />
                      )}
                      <div>
                        <div className="line-clamp-1 font-semibold">{r.productName || "Product"}</div>
                        {r.orderNo && (
                          <span className="text-[11px] text-muted-foreground">Order #{r.orderNo}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.customerName || "Customer"}</div>
                    {r.customerEmail && (
                      <div className="text-[11px] text-muted-foreground">{r.customerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center text-amber-500 gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${
                            s <= (r.rating || 5) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 leading-relaxed max-w-sm">
                    {r.comment}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        r.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : r.status === "rejected"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {r.status !== "approved" && (
                        <button
                          onClick={() => updateStatus(r._id, "approved")}
                          className="h-8 px-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                          title="Approve Review"
                        >
                          Approve
                        </button>
                      )}
                      {r.status !== "rejected" && (
                        <button
                          onClick={() => updateStatus(r._id, "rejected")}
                          className="h-8 px-2.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition"
                          title="Reject Review"
                        >
                          Reject
                        </button>
                      )}
                      <button
                        onClick={() => deleteReview(r._id)}
                        className="h-8 w-8 rounded border border-border hover:bg-rose-50 hover:border-rose-200 text-muted-foreground hover:text-rose-600 grid place-items-center transition"
                        title="Delete Review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
