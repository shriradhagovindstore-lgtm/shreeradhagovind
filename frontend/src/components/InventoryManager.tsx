import React, { useState, useEffect, useCallback } from "react";
import {
  Boxes,
  Package,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  EyeOff,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Minus,
  SlidersHorizontal,
  History,
  Clock,
  BellRing,
  ArrowRight,
  X as XIcon,
  Loader2,
  Check,
  ChevronRight,
  Eye,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/store";
import { toast } from "sonner";

interface InventoryProduct {
  id: string;
  _id: string;
  name: string;
  slug?: string;
  category: string;
  price: number;
  stock: number;
  image?: string;
  isActive: boolean;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  outOfStockSince?: string | null;
  isHiddenFromStorefront: boolean;
  waitlistCount: number;
  updatedAt?: string;
}

interface InventoryMetrics {
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  hiddenFromStorefrontCount: number;
  lowStockThreshold: number;
  outOfStockWindowMs: number;
}

interface StockHistoryEntry {
  _id: string;
  productId: {
    _id: string;
    name: string;
    image?: string;
    price: number;
    category?: string;
  } | null;
  previousStock: number;
  newStock: number;
  delta: number;
  movementType:
    | "purchase"
    | "cancellation_restock"
    | "manual_adjustment"
    | "return_restock"
    | "admin_correction";
  reason: string;
  note?: string;
  actorType: "customer" | "admin" | "system" | "guest";
  actorId?: { _id: string; name?: string; email?: string } | null;
  orderNo?: number | null;
  createdAt: string;
}

interface WaitlistEntry {
  _id: string;
  productId: {
    _id: string;
    name: string;
    price: number;
    stock: number;
  };
  email: string;
  phone?: string;
  status: string;
  createdAt: string;
}

const VALID_REASONS = [
  "Received New Stock",
  "Physical Recount",
  "Damaged / Broken",
  "Return",
  "Correction",
  "Other",
] as const;

export function InventoryManager({ onStockUpdated }: { onStockUpdated?: () => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<InventoryMetrics>({
    totalProducts: 0,
    inStockCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    hiddenFromStorefrontCount: 0,
    lowStockThreshold: 5,
    outOfStockWindowMs: 24 * 60 * 60 * 1000,
  });
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_stock" | "low_stock" | "out_of_stock" | "hidden"
  >("all");
  const [sortOption, setSortOption] = useState<
    "stock_asc" | "stock_desc" | "name_asc" | "updated_desc"
  >("stock_asc");

  // Adjustment Modal State
  const [adjustModalProduct, setAdjustModalProduct] = useState<InventoryProduct | null>(null);
  const [adjustAction, setAdjustAction] = useState<"add" | "remove" | "set">("add");
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState<string>("Received New Stock");
  const [adjustNote, setAdjustNote] = useState<string>("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<InventoryProduct | null>(null);
  const [historyEntries, setHistoryEntries] = useState<StockHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Waitlist Demand Modal State
  const [waitlistModalProduct, setWaitlistModalProduct] = useState<InventoryProduct | null>(null);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sortOption);
      params.set("limit", "100");

      const res = await api<{
        metrics: InventoryMetrics;
        products: InventoryProduct[];
      }>(`/admin/inventory?${params.toString()}`);

      setMetrics(res.metrics);
      setProducts(res.products || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortOption]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Open adjustment modal
  const openAdjustModal = (product: InventoryProduct) => {
    setAdjustModalProduct(product);
    setAdjustAction("add");
    setAdjustQuantity(1);
    setAdjustReason("Received New Stock");
    setAdjustNote("");
  };

  // Submit stock adjustment
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalProduct) return;

    if (adjustQuantity < 0) {
      return toast.error("Quantity must be a positive number");
    }

    if (adjustReason === "Other" && !adjustNote.trim()) {
      return toast.error('Please provide an explanatory note when reason is "Other"');
    }

    setAdjustSubmitting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(
        "/admin/inventory/adjust",
        {
          method: "POST",
          body: {
            productId: adjustModalProduct.id || adjustModalProduct._id,
            action: adjustAction,
            quantity: Number(adjustQuantity),
            reason: adjustReason,
            note: adjustNote.trim(),
          },
        }
      );

      toast.success(res.message);
      setAdjustModalProduct(null);
      await fetchInventory();
      onStockUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || "Stock adjustment failed");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Open stock history ledger modal
  const openHistoryModal = async (product?: InventoryProduct) => {
    setHistoryProduct(product || null);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const q = product ? `?productId=${product.id || product._id}&limit=50` : "?limit=50";
      const res = await api<{ entries: StockHistoryEntry[] }>(`/admin/inventory/history${q}`);
      setHistoryEntries(res.entries || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load stock history");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open waitlist entries modal
  const openWaitlistModal = async (product: InventoryProduct) => {
    setWaitlistModalProduct(product);
    setLoadingWaitlist(true);
    try {
      const res = await api<{ waitlist: WaitlistEntry[] }>(
        `/admin/inventory/waitlist?productId=${product.id || product._id}`
      );
      setWaitlistEntries(res.waitlist || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load waiting list");
    } finally {
      setLoadingWaitlist(false);
    }
  };

  // Calculate projected new stock in adjustment modal
  const currentStock = adjustModalProduct ? Number(adjustModalProduct.stock ?? 0) : 0;
  let previewStock = currentStock;
  let previewDelta = 0;
  if (adjustAction === "add") {
    previewDelta = adjustQuantity;
    previewStock = currentStock + previewDelta;
  } else if (adjustAction === "remove") {
    previewDelta = -adjustQuantity;
    previewStock = Math.max(0, currentStock - adjustQuantity);
  } else if (adjustAction === "set") {
    previewStock = adjustQuantity;
    previewDelta = previewStock - currentStock;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-stone-900 flex items-center gap-2.5">
            <Boxes className="h-7 w-7 text-[#166F77]" />
            Inventory & Stock Management
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Real-time inventory levels, 24-hour storefront visibility rules, audit logs, and safe stock adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openHistoryModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs cursor-pointer"
          >
            <History className="h-4 w-4 text-stone-500" />
            Audit Ledger
          </button>
          <button
            onClick={fetchInventory}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#166F77] text-white text-xs font-semibold hover:bg-[#125A61] transition shadow-xs disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Products */}
        <div
          onClick={() => setStatusFilter("all")}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition ${
            statusFilter === "all" ? "ring-2 ring-[#166F77] border-transparent" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Products</span>
            <Package className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-900">{metrics.totalProducts}</p>
          <span className="text-[10px] text-stone-400">All catalog items</span>
        </div>

        {/* In Stock */}
        <div
          onClick={() => setStatusFilter("in_stock")}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition ${
            statusFilter === "in_stock" ? "ring-2 ring-emerald-600 border-transparent" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Stock</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-800">{metrics.inStockCount}</p>
          <span className="text-[10px] text-emerald-600">&gt; 5 units available</span>
        </div>

        {/* Low Stock */}
        <div
          onClick={() => setStatusFilter("low_stock")}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition ${
            statusFilter === "low_stock" ? "ring-2 ring-amber-500 border-transparent" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Low Stock</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-900">{metrics.lowStockCount}</p>
          <span className="text-[10px] text-amber-700">1 to 5 units remaining</span>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => setStatusFilter("out_of_stock")}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition ${
            statusFilter === "out_of_stock" ? "ring-2 ring-rose-600 border-transparent" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[11px] font-bold uppercase tracking-wider">Out of Stock</span>
            <AlertCircle className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-900">{metrics.outOfStockCount}</p>
          <span className="text-[10px] text-rose-600">0 units in stock</span>
        </div>

        {/* Hidden from Storefront */}
        <div
          onClick={() => setStatusFilter("hidden")}
          className={`p-4 rounded-xl border bg-white cursor-pointer transition col-span-2 sm:col-span-1 ${
            statusFilter === "hidden" ? "ring-2 ring-stone-600 border-transparent" : "border-stone-200 hover:border-stone-300"
          }`}
        >
          <div className="flex items-center justify-between text-stone-600">
            <span className="text-[11px] font-bold uppercase tracking-wider">Storefront Hidden</span>
            <EyeOff className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-stone-800">{metrics.hiddenFromStorefrontCount}</p>
          <span className="text-[10px] text-stone-500">Out of stock &gt; 24 hours</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search product name, category, or HSN code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#166F77]"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium whitespace-nowrap">Sort:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="h-9 px-2.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#166F77]"
            >
              <option value="stock_asc">Stock: Low to High</option>
              <option value="stock_desc">Stock: High to Low</option>
              <option value="name_asc">Product Name (A-Z)</option>
              <option value="updated_desc">Recently Updated</option>
            </select>
          </div>
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === "all"
                ? "bg-[#166F77] text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            All Products ({metrics.totalProducts})
          </button>
          <button
            onClick={() => setStatusFilter("in_stock")}
            className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === "in_stock"
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            In Stock ({metrics.inStockCount})
          </button>
          <button
            onClick={() => setStatusFilter("low_stock")}
            className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === "low_stock"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
            }`}
          >
            Low Stock ({metrics.lowStockCount})
          </button>
          <button
            onClick={() => setStatusFilter("out_of_stock")}
            className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === "out_of_stock"
                ? "bg-rose-700 text-white"
                : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
            }`}
          >
            Out of Stock ({metrics.outOfStockCount})
          </button>
          <button
            onClick={() => setStatusFilter("hidden")}
            className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer whitespace-nowrap ${
              statusFilter === "hidden"
                ? "bg-stone-700 text-white"
                : "bg-stone-100 text-stone-700 border border-stone-300 hover:bg-stone-200"
            }`}
          >
            Storefront Hidden ({metrics.hiddenFromStorefrontCount})
          </button>
        </div>
      </div>

      {/* Inventory Products Table & Mobile Cards */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        {/* Mobile Inventory Cards (visible on screens below md: breakpoint) */}
        <div className="block md:hidden divide-y divide-stone-100">
          {loading ? (
            <div className="p-8 text-center text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#166F77]" />
              Loading inventory data...
            </div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-xs">
              No products found matching the current search and filter criteria.
            </div>
          ) : (
            products.map((p) => {
              const currentStock = Number(p.stock ?? 0);
              const isLow = currentStock >= 1 && currentStock <= 5;
              const isOut = currentStock <= 0;
              const outSince = p.outOfStockSince ? new Date(p.outOfStockSince) : null;
              const elapsedMs = outSince ? Date.now() - outSince.getTime() : null;
              const elapsedHours = elapsedMs !== null ? Math.floor(elapsedMs / (1000 * 60 * 60)) : null;

              return (
                <div key={p.id || p._id} className="p-3.5 space-y-3 bg-white">
                  <div className="flex items-start gap-3">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt=""
                        className="h-12 w-12 rounded-lg object-contain bg-stone-50 border border-stone-200 shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                        <Package className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900 text-xs leading-snug line-clamp-2">{p.name}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                        <span className="font-mono">{p.category}</span>
                        <span>•</span>
                        <span className="font-bold text-stone-900">{formatINR(p.price)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-stone-50 border border-stone-200/80 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-500 font-medium">Stock:</span>
                      <span className="font-mono font-bold text-sm text-stone-900">{currentStock}</span>
                      {currentStock > 5 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          In Stock
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Low ({currentStock})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          Out
                        </span>
                      )}
                    </div>

                    <div>
                      {currentStock > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <Eye className="h-3 w-3" /> Live
                        </span>
                      ) : p.isHiddenFromStorefront ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-600 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded">
                          <EyeOff className="h-3 w-3 text-stone-500" /> Hidden (&gt;24h)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded">
                          <Clock className="h-3 w-3 text-amber-600" />
                          {elapsedHours !== null ? `${24 - Math.min(24, elapsedHours)}h left` : "<24h"}
                        </span>
                      )}
                    </div>
                  </div>

                  {p.waitlistCount > 0 && (
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-amber-800 font-medium">Customer Waitlist:</span>
                      <button
                        type="button"
                        onClick={() => openWaitlistModal(p)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full cursor-pointer"
                      >
                        <BellRing className="h-3.5 w-3.5 text-amber-700" />
                        {p.waitlistCount} waiting
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openAdjustModal(p)}
                      className="min-h-[44px] rounded-lg bg-[#166F77] hover:bg-[#125A61] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Adjust Stock</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openHistoryModal(p)}
                      className="min-h-[44px] rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      <History className="h-3.5 w-3.5 text-stone-500" />
                      <span>Stock History</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Inventory Products Table (preserved unchanged at md: and above) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="p-3.5">Product</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Price</th>
                <th className="p-3.5">Stock Level</th>
                <th className="p-3.5">Storefront Visibility (24h)</th>
                <th className="p-3.5">Out of Stock Since</th>
                <th className="p-3.5">Waitlist Demand</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#166F77]" />
                    Loading inventory data...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-stone-400">
                    No products found matching the current search and filter criteria.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const currentStock = Number(p.stock ?? 0);
                  const isLow = currentStock >= 1 && currentStock <= 5;
                  const isOut = currentStock <= 0;
                  const outSince = p.outOfStockSince ? new Date(p.outOfStockSince) : null;
                  const elapsedMs = outSince ? Date.now() - outSince.getTime() : null;
                  const elapsedHours = elapsedMs !== null ? Math.floor(elapsedMs / (1000 * 60 * 60)) : null;

                  return (
                    <tr key={p.id || p._id} className="hover:bg-stone-50/70 transition">
                      {/* Product Name & Image */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt=""
                              className="h-10 w-10 rounded-lg object-contain bg-stone-50 border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                              <Package className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-[220px]">
                            <p className="font-semibold text-stone-900 truncate" title={p.name}>
                              {p.name}
                            </p>
                            <span className="text-[10px] text-stone-400 font-mono">
                              ID: {(p.id || p._id).slice(-6)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5 text-stone-600">{p.category}</td>

                      {/* Price */}
                      <td className="p-3.5 font-medium text-stone-900">{formatINR(p.price)}</td>

                      {/* Stock Level with Badge */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-stone-900 w-7 text-right">
                            {currentStock}
                          </span>
                          {currentStock > 5 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              In Stock
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Low ({currentStock})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Out of Stock
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Storefront Visibility (24h rule) */}
                      <td className="p-3.5">
                        {currentStock > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <Eye className="h-3 w-3" /> Live &amp; Purchasable
                          </span>
                        ) : p.isHiddenFromStorefront ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-600 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded">
                            <EyeOff className="h-3 w-3 text-stone-500" /> Hidden (&gt;24h)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded">
                            <Clock className="h-3 w-3 text-amber-600" />
                            {elapsedHours !== null ? `${24 - Math.min(24, elapsedHours)}h left on Store` : "Visible (<24h)"}
                          </span>
                        )}
                      </td>

                      {/* Out of Stock Since */}
                      <td className="p-3.5 text-stone-500 text-[11px]">
                        {outSince ? (
                          <div>
                            <p>{outSince.toLocaleDateString("en-IN")}</p>
                            <p className="text-[10px] text-stone-400">
                              {outSince.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              {elapsedHours !== null && ` (${elapsedHours}h ago)`}
                            </p>
                          </div>
                        ) : isOut ? (
                          <span className="text-stone-400 italic">Pre-existing</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>

                      {/* Waitlist Demand */}
                      <td className="p-3.5">
                        {p.waitlistCount > 0 ? (
                          <button
                            onClick={() => openWaitlistModal(p)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-full transition cursor-pointer"
                          >
                            <BellRing className="h-3 w-3 text-amber-700" />
                            {p.waitlistCount} waiting
                          </button>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAdjustModal(p)}
                            className="px-2.5 py-1 rounded-lg bg-[#166F77]/10 text-[#166F77] hover:bg-[#166F77] hover:text-white font-semibold text-[11px] transition cursor-pointer"
                            title="Adjust product stock"
                          >
                            Adjust Stock
                          </button>
                          <button
                            onClick={() => openHistoryModal(p)}
                            className="p-1 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition cursor-pointer"
                            title="View stock movement history"
                          >
                            <History className="h-4 w-4" />
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

      {/* MODAL 1: Safe Stock Adjustment */}
      {adjustModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] [@supports(max-height:90dvh)]:max-h-[90dvh] flex flex-col shadow-xl border border-stone-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-stone-100 flex items-start justify-between gap-3 shrink-0 bg-white">
              <div className="min-w-0">
                <h3 className="font-display text-lg text-stone-900 flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-[#166F77] shrink-0" />
                  Adjust Product Stock
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Record an audited inventory change with required business rationale.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalProduct(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer shrink-0"
                aria-label="Close adjust modal"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 pt-4 space-y-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {/* Product Summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
                {adjustModalProduct.image ? (
                  <img
                    src={adjustModalProduct.image}
                    alt=""
                    className="h-12 w-12 rounded-lg object-contain bg-white border border-stone-200 shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs text-stone-900 truncate">{adjustModalProduct.name}</p>
                  <p className="text-[11px] text-stone-500">{adjustModalProduct.category} · {formatINR(adjustModalProduct.price)}</p>
                  <p className="text-[11px] font-semibold text-[#166F77] mt-0.5">
                    Current Stock: {currentStock} units
                  </p>
                </div>
              </div>

              <form onSubmit={handleAdjustSubmit} className="space-y-4">
                {/* Action Tabs: Add / Remove / Set */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Adjustment Type:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustAction("add")}
                      className={`min-h-[44px] py-2 px-2 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                        adjustAction === "add"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" /> Add Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction("remove")}
                      className={`min-h-[44px] py-2 px-2 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                        adjustAction === "remove"
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                      }`}
                    >
                      <Minus className="h-3.5 w-3.5 shrink-0" /> Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction("set")}
                      className={`min-h-[44px] py-2 px-2 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                        adjustAction === "set"
                          ? "bg-[#166F77] text-white shadow-xs"
                          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                      }`}
                    >
                      Set Stock
                    </button>
                  </div>
                </div>

                {/* Quantity Input */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {adjustAction === "set" ? "New Total Stock Quantity:" : "Quantity to Change:"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full h-11 px-3 rounded-lg border border-stone-200 text-base md:text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#166F77]"
                  />
                </div>

                {/* Projected Stock Preview */}
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 flex items-center justify-between text-xs gap-2">
                  <div>
                    <span className="text-teal-800 font-medium">Projected Stock:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-stone-500 font-semibold">{currentStock}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-teal-900 font-bold text-sm">{previewStock}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[11px] shrink-0 ${
                      previewDelta > 0
                        ? "bg-emerald-100 text-emerald-800"
                        : previewDelta < 0
                        ? "bg-rose-100 text-rose-800"
                        : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    Delta: {previewDelta > 0 ? `+${previewDelta}` : previewDelta}
                  </span>
                </div>

                {/* Mandatory Reason */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Adjustment Reason <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-stone-200 bg-white text-base md:text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#166F77]"
                  >
                    {VALID_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Explanatory Note */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Explanatory Note {adjustReason === "Other" && <span className="text-rose-500">* (Required)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={adjustReason === "Other" ? "Detailed explanation required..." : "Optional internal memo or PO reference..."}
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    required={adjustReason === "Other"}
                    className="w-full h-11 px-3 rounded-lg border border-stone-200 text-base md:text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#166F77]"
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setAdjustModalProduct(null)}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adjustSubmitting}
                    className="min-h-[44px] px-5 py-2 rounded-lg bg-[#166F77] hover:bg-[#125A61] text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    {adjustSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirm &amp; Record Adjustment
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Stock History / Audit Trail Ledger */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[85vh] flex flex-col animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg text-stone-900 flex items-center gap-2">
                  <History className="h-5 w-5 text-[#166F77]" />
                  {historyProduct ? `Stock History: ${historyProduct.name}` : "Storewide Stock Movement Ledger"}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Chronological audit trail of all purchases, cancellations, and administrative adjustments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                aria-label="Close history modal"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* History Table Container */}
            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px] font-bold sticky top-0">
                  <tr>
                    <th className="p-3">Date / Time</th>
                    {!historyProduct && <th className="p-3">Product</th>}
                    <th className="p-3">Movement</th>
                    <th className="p-3">Delta</th>
                    <th className="p-3">Transition</th>
                    <th className="p-3">Reason / Memo</th>
                    <th className="p-3">Actor / Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#166F77]" />
                        Loading ledger entries...
                      </td>
                    </tr>
                  ) : historyEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-400">
                        No stock movement entries recorded yet for this selection.
                      </td>
                    </tr>
                  ) : (
                    historyEntries.map((h) => {
                      const isPositive = h.delta > 0;
                      const dateObj = new Date(h.createdAt);

                      return (
                        <tr key={h._id} className="hover:bg-stone-50/70 transition">
                          <td className="p-3 text-stone-500 whitespace-nowrap">
                            <p className="font-medium text-stone-800">{dateObj.toLocaleDateString("en-IN")}</p>
                            <span className="text-[10px] text-stone-400">
                              {dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </td>

                          {!historyProduct && (
                            <td className="p-3">
                              <p className="font-semibold text-stone-900 truncate max-w-[150px]">
                                {h.productId?.name || "Product"}
                              </p>
                            </td>
                          )}

                          {/* Movement Type Badge */}
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                h.movementType === "purchase"
                                  ? "bg-rose-50 text-rose-800 border border-rose-200"
                                  : h.movementType === "cancellation_restock"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : h.movementType === "manual_adjustment"
                                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                                  : "bg-stone-100 text-stone-800 border border-stone-200"
                              }`}
                            >
                              {h.movementType.replace(/_/g, " ")}
                            </span>
                          </td>

                          {/* Delta */}
                          <td className="p-3 font-mono font-bold whitespace-nowrap">
                            <span className={isPositive ? "text-emerald-700" : "text-rose-700"}>
                              {isPositive ? `+${h.delta}` : h.delta}
                            </span>
                          </td>

                          {/* Transition: Prev -> New */}
                          <td className="p-3 whitespace-nowrap text-stone-600 font-mono text-[11px]">
                            {h.previousStock} &rarr; <strong className="text-stone-900">{h.newStock}</strong>
                          </td>

                          {/* Reason & Note */}
                          <td className="p-3">
                            <p className="font-medium text-stone-800">{h.reason}</p>
                            {h.note && <p className="text-[10px] text-stone-500 italic mt-0.5">{h.note}</p>}
                          </td>

                          {/* Actor & Order */}
                          <td className="p-3 whitespace-nowrap text-[11px] text-stone-600">
                            <p className="capitalize font-semibold text-stone-800">{h.actorType}</p>
                            {h.orderNo && <span className="text-[10px] text-[#166F77] font-mono">Order #{h.orderNo}</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-stone-500">
                Showing {historyEntries.length} most recent ledger transactions.
              </span>
              <button
                onClick={() => setHistoryModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Waitlist Demand Customers */}
      {waitlistModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[80vh] flex flex-col animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-base text-stone-900 flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-amber-700" />
                  Devotee Waiting List
                </h3>
                <p className="text-xs text-stone-500 mt-0.5 truncate max-w-[280px]">
                  {waitlistModalProduct.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWaitlistModalProduct(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
                aria-label="Close waitlist modal"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
              {loadingWaitlist ? (
                <div className="p-6 text-center text-stone-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#166F77]" />
                  Loading devotees...
                </div>
              ) : waitlistEntries.length === 0 ? (
                <div className="p-6 text-center text-stone-400 text-xs">
                  No active waiting requests for this product.
                </div>
              ) : (
                waitlistEntries.map((w) => (
                  <div key={w._id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-stone-900">{w.email}</p>
                      {w.phone && <p className="text-[11px] text-stone-500 font-mono">Phone: {w.phone}</p>}
                    </div>
                    <span className="text-[10px] text-stone-400">
                      {new Date(w.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-stone-500">
                {waitlistEntries.length} devotee{waitlistEntries.length === 1 ? "" : "s"} waiting for restock.
              </span>
              <button
                onClick={() => setWaitlistModalProduct(null)}
                className="px-4 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
