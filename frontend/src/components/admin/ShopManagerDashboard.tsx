import React from "react";
import {
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Tag,
} from "lucide-react";
import type { Order, Product } from "../../lib/store";

interface ShopManagerDashboardProps {
  orders: Order[];
  products: Product[];
  onNavigateTab: (tab: "dash" | "products" | "inventory" | "categories" | "orders" | "delivery") => void;
  onOpenOrder: (order: Order) => void;
}

export function ShopManagerDashboard({
  orders,
  products,
  onNavigateTab,
  onOpenOrder,
}: ShopManagerDashboardProps) {
  // Operational order metrics
  const awaitingProcessing = orders.filter(
    (o) => o.status === "Placed" || o.status === "Confirmed"
  ).length;
  const inProcessing = orders.filter((o) => o.status === "Processing").length;
  const readyToShip = orders.filter((o) => o.status === "Packed").length;
  const shippedInTransit = orders.filter((o) => o.status === "Shipped").length;

  // Inventory metrics
  const outOfStockItems = products.filter((p) => p.stock <= 0);
  const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= 5);

  // Operational orders list (active fulfillment queue)
  const activeOrders = orders.filter(
    (o) => o.status !== "Delivered" && o.status !== "Cancelled"
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-xl bg-white border border-stone-200 p-6 text-stone-900 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold uppercase tracking-wider">
                Store Operations
              </span>
              <span className="text-xs text-stone-400 font-medium">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <h1 className="font-serif text-3xl font-bold text-stone-900 mt-1">
              Shop Manager Console
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Manage product listings, stock counts, order packaging, and courier dispatches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigateTab("orders")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-semibold text-white hover:bg-teal-800 transition shadow-xs cursor-pointer"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Orders Queue ({activeOrders.length})</span>
            </button>
            <button
              onClick={() => onNavigateTab("inventory")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-xs cursor-pointer"
            >
              <Boxes className="h-3.5 w-3.5" />
              <span>Stock Adjustments</span>
            </button>
          </div>
        </div>
      </section>

      {/* Primary Operational Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Awaiting Processing */}
        <div
          onClick={() => onNavigateTab("orders")}
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:border-teal-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">Awaiting Confirmation</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-stone-900">{awaitingProcessing}</span>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              Needs confirm
            </span>
          </div>
        </div>

        {/* In Processing / Packing */}
        <div
          onClick={() => onNavigateTab("orders")}
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:border-teal-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">In Packing / Prep</span>
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-stone-900">{inProcessing}</span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Processing
            </span>
          </div>
        </div>

        {/* Ready to Ship */}
        <div
          onClick={() => onNavigateTab("orders")}
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:border-teal-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">Packed (Ready for AWB)</span>
            <Truck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-stone-900">{readyToShip}</span>
            <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
              Needs Courier/AWB
            </span>
          </div>
        </div>

        {/* Shipped In Transit */}
        <div
          onClick={() => onNavigateTab("delivery")}
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:border-teal-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-bold uppercase tracking-wider">Shipped / In Transit</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold font-mono text-stone-900">{shippedInTransit}</span>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Dispatched
            </span>
          </div>
        </div>
      </div>

      {/* Inventory & Catalog Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigateTab("products")}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs hover:border-stone-400 transition cursor-pointer flex items-center justify-between"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Total Products</p>
            <p className="text-2xl font-bold font-mono text-stone-900 mt-1">{products.length}</p>
          </div>
          <Tag className="h-8 w-8 text-stone-300" />
        </div>

        <div
          onClick={() => onNavigateTab("inventory")}
          className={`rounded-xl border p-4 shadow-xs transition cursor-pointer flex items-center justify-between ${
            lowStockItems.length > 0
              ? "border-amber-300 bg-amber-50/50 hover:bg-amber-50"
              : "border-stone-200 bg-white hover:border-stone-400"
          }`}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Low Stock (&le; 5 units)</p>
            <p className="text-2xl font-bold font-mono text-amber-950 mt-1">{lowStockItems.length}</p>
          </div>
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        </div>

        <div
          onClick={() => onNavigateTab("inventory")}
          className={`rounded-xl border p-4 shadow-xs transition cursor-pointer flex items-center justify-between ${
            outOfStockItems.length > 0
              ? "border-rose-300 bg-rose-50/50 hover:bg-rose-50"
              : "border-stone-200 bg-white hover:border-stone-400"
          }`}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-rose-900">Out of Stock</p>
            <p className="text-2xl font-bold font-mono text-rose-950 mt-1">{outOfStockItems.length}</p>
          </div>
          <Boxes className="h-8 w-8 text-rose-400" />
        </div>
      </div>

      {/* Operational Orders Queue Section */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Active Fulfillment Queue
            </p>
            <h2 className="font-serif text-xl font-bold text-stone-900">
              Orders Requiring Operations Action
            </h2>
          </div>
          <button
            onClick={() => onNavigateTab("orders")}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition cursor-pointer"
          >
            <span>View All Orders</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeOrders.length === 0 ? (
          <div className="text-center py-10 text-stone-500">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="font-semibold text-sm">All active orders have been fulfilled!</p>
            <p className="text-xs text-stone-400 mt-1">New customer orders will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-50 border-y border-stone-200 text-stone-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Customer & Destination</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3">Payment Type</th>
                  <th className="py-2.5 px-3">Courier / AWB</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activeOrders.slice(0, 10).map((o) => {
                  const isCod = o.payment?.method === "cod";
                  const totalUnits = (o.items || []).reduce((acc, i) => acc + (i.qty || 1), 0);
                  const orderNum = o.orderNo ? `#${o.orderNo}` : `#${o.id.slice(-6).toUpperCase()}`;

                  return (
                    <tr key={o.id} className="hover:bg-stone-50/70 transition">
                      <td className="py-3 px-3 font-mono font-bold text-stone-900">
                        {orderNum}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900">{o.address?.name || "Customer"}</div>
                        <div className="text-[11px] text-stone-500">
                          {[o.address?.city, o.address?.state].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-stone-700">
                          {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
                        </span>
                        <div className="text-[10px] text-stone-400 truncate max-w-[150px]">
                          {(o.items || []).map((i) => i.product?.name).filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {isCod ? (
                          <div className="inline-flex flex-col">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                              COD: Collect ₹{o.total}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                            Prepaid Online
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-stone-600">
                        {o.courier ? (
                          <div>
                            <span className="font-semibold text-stone-800">{o.courier}</span>
                            {o.trackingId && (
                              <span className="block text-[10px] text-teal-700 truncate max-w-[120px]">
                                {o.trackingId}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            o.status === "Placed"
                              ? "bg-stone-100 text-stone-700"
                              : o.status === "Confirmed"
                                ? "bg-amber-100 text-amber-800"
                                : o.status === "Processing"
                                  ? "bg-blue-100 text-blue-800"
                                  : o.status === "Packed"
                                    ? "bg-teal-100 text-teal-800"
                                    : o.status === "Shipped"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-stone-100 text-stone-700"
                          }`}
                        >
                          {o.status || "Placed"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onOpenOrder(o)}
                          className="px-2.5 py-1 rounded-md bg-stone-900 text-white hover:bg-stone-800 text-[11px] font-semibold transition cursor-pointer"
                        >
                          Process
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Attention Items if Any */}
      {(outOfStockItems.length > 0 || lowStockItems.length > 0) && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="font-serif text-lg font-bold text-stone-900">
                Stock Attention Needed ({outOfStockItems.length + lowStockItems.length} items)
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab("inventory")}
              className="text-xs font-semibold text-teal-800 hover:underline cursor-pointer"
            >
              Open Inventory &rarr;
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {[...outOfStockItems, ...lowStockItems].slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 bg-stone-50/50"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-stone-900 truncate">{p.name}</p>
                  <p className="text-[10px] text-stone-500 font-mono">{p.category}</p>
                </div>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                    p.stock <= 0
                      ? "bg-rose-100 text-rose-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {p.stock} units
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
