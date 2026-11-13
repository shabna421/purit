import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Building2,
  ExternalLink,
  Phone,
  MapPin,
  Calendar,
  History,
  Store,
  Package,
  Receipt,
  RotateCcw,
  LayoutList,
  Columns3,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { useTenancy } from '../contexts';
import { Customer, Sale, Item } from '../types';
import { formatCurrency, formatStatCurrency } from '../utils/currency';
import { ProductPurchaseHistoryModal } from '../components/repurchase/ProductPurchaseHistoryModal';
import { ProductRepurchasePrediction } from '../utils/repurchasePrediction';

type ViewMode = 'columns' | 'table';
type HistoryGrouping = 'orders' | 'products';

interface PastOrderItem {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface PastOrder {
  id: string;
  invoiceNumber: string;
  timestamp: number;
  dateFormatted: string;
  timeAgo: string;
  totalAmount: number;
  paidAmount: number;
  paymentType: 'cash' | 'credit';
  items: PastOrderItem[];
}

interface ProductBoughtRecord {
  itemId: string;
  itemName: string;
  unit: string;
  totalQuantity: number;
  orderCount: number;
  lastPurchaseDate: number;
  lastDateFormatted: string;
  lastTimeAgo: string;
  lastQuantity: number;
  purchases: {
    saleId: string;
    invoiceNumber: string;
    timestamp: number;
    dateFormatted: string;
    timeAgo: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}

interface ShopHistoryData {
  customer: Customer;
  orders: PastOrder[];
  products: ProductBoughtRecord[];
  totalOrdersCount: number;
  totalSpent: number;
  lastOrderDate: number | null;
  lastOrderTimeAgo: string;
}

export default function ReorderPage() {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useTenancy();
  const { customers, sales, items, loading } = useRealtimeData();

  const productCatalogMap = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('purity_reorder_view_mode');
      if (saved === 'table' || saved === 'columns') return saved;
    } catch {}
    return 'columns';
  });

  const [historyGrouping, setHistoryGrouping] = useState<HistoryGrouping>('orders');
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{
    customer: Customer;
    prediction: ProductRepurchasePrediction;
  } | null>(null);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('purity_reorder_view_mode', mode);
    } catch {}
  };

  // Compute past purchase history for every shop
  const allShopsHistory: ShopHistoryData[] = useMemo(() => {
    if (!customers || customers.length === 0) return [];

    return customers.map((cust) => {
      // 1. Get all completed/non-cancelled sales for this customer, sorted newest first
      const custSales = (sales || [])
        .filter((s) => s.customerId === cust.id && s.status !== 'cancelled')
        .sort((a, b) => b.timestamp - a.timestamp);

      let totalSpent = 0;

      // 2. Map sales to structured PastOrder records
      const orders: PastOrder[] = custSales.map((s) => {
        totalSpent += s.totalAmount || 0;
        const orderItems: PastOrderItem[] = (s.items || [])
          .filter((line) => line && Number(line.quantity) > 0)
          .map((line) => {
            const product = productCatalogMap.get(line.itemId);
            return {
              itemId: line.itemId,
              itemName: product?.name || 'Unknown Product',
              unit: product?.unit || 'unit',
              quantity: Number(line.quantity) || 0,
              unitPrice: Number(line.unitPrice) || 0,
              subtotal: Number(line.subtotal) || (Number(line.quantity) * Number(line.unitPrice)) || 0,
            };
          });

        return {
          id: s.id,
          invoiceNumber: s.gstBillNumber || s.id.slice(-6).toUpperCase(),
          timestamp: s.timestamp,
          dateFormatted: format(new Date(s.timestamp), 'dd MMM yyyy, hh:mm a'),
          timeAgo: formatDistanceToNow(new Date(s.timestamp), { addSuffix: true }),
          totalAmount: s.totalAmount || 0,
          paidAmount: s.paidAmount || 0,
          paymentType: s.paymentType,
          items: orderItems,
        };
      });

      // 3. Map to product-wise bought history
      const productMap = new Map<string, ProductBoughtRecord>();

      // Iterate chronologically (oldest to newest) to track past purchases
      const chronologicalSales = [...custSales].reverse();
      for (const s of chronologicalSales) {
        const inv = s.gstBillNumber || s.id.slice(-6).toUpperCase();
        for (const line of s.items || []) {
          const qty = Number(line.quantity) || 0;
          if (qty <= 0) continue;

          const product = productCatalogMap.get(line.itemId);
          const price = Number(line.unitPrice) || 0;
          const subtotal = Number(line.subtotal) || qty * price;

          if (!productMap.has(line.itemId)) {
            productMap.set(line.itemId, {
              itemId: line.itemId,
              itemName: product?.name || 'Unknown Product',
              unit: product?.unit || 'unit',
              totalQuantity: 0,
              orderCount: 0,
              lastPurchaseDate: s.timestamp,
              lastDateFormatted: format(new Date(s.timestamp), 'dd MMM yyyy'),
              lastTimeAgo: formatDistanceToNow(new Date(s.timestamp), { addSuffix: true }),
              lastQuantity: qty,
              purchases: [],
            });
          }

          const record = productMap.get(line.itemId)!;
          record.totalQuantity += qty;
          record.orderCount += 1;
          record.lastPurchaseDate = s.timestamp;
          record.lastDateFormatted = format(new Date(s.timestamp), 'dd MMM yyyy');
          record.lastTimeAgo = formatDistanceToNow(new Date(s.timestamp), { addSuffix: true });
          record.lastQuantity = qty;

          record.purchases.push({
            saleId: s.id,
            invoiceNumber: inv,
            timestamp: s.timestamp,
            dateFormatted: format(new Date(s.timestamp), 'dd MMM yyyy'),
            timeAgo: formatDistanceToNow(new Date(s.timestamp), { addSuffix: true }),
            quantity: qty,
            unitPrice: price,
            subtotal,
          });
        }
      }

      // Sort products by most recently bought first
      const products = Array.from(productMap.values()).sort(
        (a, b) => b.lastPurchaseDate - a.lastPurchaseDate
      );

      const lastOrder = orders.length > 0 ? orders[0] : null;

      return {
        customer: cust,
        orders,
        products,
        totalOrdersCount: orders.length,
        totalSpent,
        lastOrderDate: lastOrder ? lastOrder.timestamp : null,
        lastOrderTimeAgo: lastOrder ? lastOrder.timeAgo : 'No orders yet',
      };
    });
  }, [customers, sales, productCatalogMap]);

  // Unique routes
  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    customers?.forEach((c) => {
      if (c.route && c.route.trim()) set.add(c.route.trim());
    });
    return Array.from(set).sort();
  }, [customers]);

  // Filtered shops
  const filteredShops = useMemo(() => {
    return allShopsHistory
      .filter((row) => {
        // Route Filter
        if (routeFilter !== 'all' && (row.customer.route || '').trim() !== routeFilter) return false;

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const shop = (row.customer.shopName || '').toLowerCase();
          const name = (row.customer.name || '').toLowerCase();
          const phone = (row.customer.phone || '').toLowerCase();
          const route = (row.customer.route || '').toLowerCase();
          if (!shop.includes(q) && !name.includes(q) && !phone.includes(q) && !route.includes(q)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Shops with most recent orders first, then alphabetical
        if (a.lastOrderDate && b.lastOrderDate) {
          return b.lastOrderDate - a.lastOrderDate;
        }
        if (a.lastOrderDate && !b.lastOrderDate) return -1;
        if (!a.lastOrderDate && b.lastOrderDate) return 1;

        const aName = a.customer.shopName || a.customer.name;
        const bName = b.customer.shopName || b.customer.name;
        return aName.localeCompare(bName);
      });
  }, [allShopsHistory, routeFilter, searchQuery]);

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500 font-medium">
        <RotateCcw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
        Loading shop purchase histories...
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans pb-16">
      {/* 1. Clean Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900">
            Shop Previous Purchase History
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* History Mode Switcher: By Orders vs By Products */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
            <button
              type="button"
              onClick={() => setHistoryGrouping('orders')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                historyGrouping === 'orders'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="View previous bought history order by order"
            >
              <Receipt className="w-3.5 h-3.5 text-orange-600" />
              <span>Past Orders</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryGrouping('products')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                historyGrouping === 'products'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="View previous bought history product by product"
            >
              <Package className="w-3.5 h-3.5 text-orange-600" />
              <span>By Product</span>
            </button>
          </div>

          {/* View Mode Toggle: Shop Columns vs Table */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
            <button
              type="button"
              onClick={() => handleViewModeChange('columns')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'columns'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Shops as 1st row columns with past bought history below"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Shop Columns</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Single table with shop header row and previous purchase items below"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <Link
            to="/customers"
            className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
          >
            Customers
          </Link>
          <Link
            to="/sales/new"
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-[0.98]"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </Link>
        </div>
      </div>

      {/* 2. Toolbar: Search & Route Filter */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by shop name, customer name, phone, or route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-600 shrink-0">
              {filteredShops.length} Shop{filteredShops.length === 1 ? '' : 's'}
            </span>

            {availableRoutes.length > 0 && (
              <div className="shrink-0 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-500">Route:</span>
                <select
                  value={routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="all">All Routes ({availableRoutes.length})</option>
                  {availableRoutes.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. MAIN CONTENT: SHOP COLUMNS OR UNIFIED TABLE */}
      {filteredShops.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500 space-y-2">
          <Building2 className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-800">No shops match the search</p>
          <p className="text-xs text-zinc-400">Try clearing filters or searching with a different keyword.</p>
        </div>
      ) : viewMode === 'columns' ? (
        /* ========================================================================= */
        /* MODE A: SHOP COLUMNS (DEFAULT)                                            */
        /* 1st Row = Shop Names                                                      */
        /* In Column = Actual Previous Bought Histories (Past Orders & Products)    */
        /* ========================================================================= */
        <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                {/* 1st ROW: SHOP NAMES ACROSS COLUMNS */}
                <tr className="bg-zinc-100 border-b-2 border-zinc-200 text-zinc-900">
                  {filteredShops.map((shopData) => {
                    const shopName = shopData.customer.shopName || shopData.customer.name;
                    return (
                      <th
                        key={shopData.customer.id}
                        className="py-3 px-3.5 min-w-[280px] max-w-[340px] align-top border-r border-zinc-200 last:border-r-0"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-black text-sm text-zinc-900 tracking-tight truncate" title={shopName}>
                              {shopName}
                            </span>
                            <Link
                              to={`/sales/new?customerId=${shopData.customer.id}`}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold shrink-0 transition-colors"
                              title="Create new sale for this shop"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>Sale</span>
                            </Link>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-500">
                            {shopData.customer.phone && (
                              <a
                                href={`tel:${shopData.customer.phone}`}
                                className="flex items-center gap-0.5 hover:text-orange-600 transition-colors"
                              >
                                <Phone className="w-2.5 h-2.5 text-zinc-400" />
                                <span>{shopData.customer.phone}</span>
                              </a>
                            )}
                            {shopData.customer.route && (
                              <span className="bg-zinc-200/80 px-1.5 py-0.2 rounded font-semibold text-zinc-700">
                                {shopData.customer.route}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                            <span className="text-zinc-500 font-medium">
                              {shopData.totalOrdersCount} past order{shopData.totalOrdersCount === 1 ? '' : 's'}
                            </span>
                            <span
                              className={`font-black font-mono ${
                                (shopData.customer.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                              }`}
                            >
                              Bal: {formatStatCurrency(shopData.customer.balance || 0, currentOrg?.settings.currency)}
                            </span>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* IN COLUMN: PREVIOUS BOUGHT HISTORIES BELOW SHOP NAME */}
                <tr className="align-top divide-x divide-zinc-200">
                  {filteredShops.map((shopData) => {
                    const orders = shopData.orders;
                    const products = shopData.products;

                    return (
                      <td key={shopData.customer.id} className="p-2.5 space-y-2.5 bg-zinc-50/40">
                        {orders.length === 0 ? (
                          <div className="p-4 text-center text-zinc-400 text-xs italic bg-white rounded-xl border border-dashed border-zinc-200">
                            No previous purchases recorded yet.
                          </div>
                        ) : historyGrouping === 'orders' ? (
                          /* ------------------------------------------------------------- */
                          /* PAST ORDERS LIST (CHRONOLOGICAL PREVIOUS BOUGHT BILLS)        */
                          /* ------------------------------------------------------------- */
                          orders.map((order) => (
                            <div
                              key={order.id}
                              className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-2xs hover:border-orange-300 transition-all space-y-2"
                            >
                              {/* Order Date & Invoice Header */}
                              <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5 text-[11px]">
                                <div className="flex items-center gap-1.5 text-zinc-800 font-extrabold">
                                  <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                  <span>{format(new Date(order.timestamp), 'dd MMM yyyy')}</span>
                                  <span className="text-[10px] font-normal text-zinc-400">
                                    ({order.timeAgo})
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded">
                                  #{order.invoiceNumber}
                                </span>
                              </div>

                              {/* Items Bought in this Order */}
                              <div className="space-y-1 pt-0.5">
                                {order.items.map((item, idx) => (
                                  <div
                                    key={item.itemId + idx}
                                    className="flex items-center justify-between text-xs py-0.5"
                                  >
                                    <div className="min-w-0 flex-1 pr-2">
                                      <span className="font-bold text-zinc-900 block truncate" title={item.itemName}>
                                        {item.itemName}
                                      </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="font-black text-zinc-900 font-mono text-xs">
                                        {item.quantity} {item.unit}
                                      </span>
                                      <span className="text-[10px] text-zinc-400 block font-mono">
                                        @{formatCurrency(item.unitPrice, currentOrg?.settings.currency)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Order Total & Reorder Button */}
                              <div className="flex items-center justify-between pt-1.5 border-t border-zinc-100 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-zinc-900">
                                    {formatCurrency(order.totalAmount, currentOrg?.settings.currency)}
                                  </span>
                                  <span className={`text-[9px] font-bold uppercase px-1 rounded ${
                                    order.paymentType === 'cash' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                  }`}>
                                    {order.paymentType}
                                  </span>
                                </div>

                                <Link
                                  to={`/sales/new?customerId=${shopData.customer.id}`}
                                  className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 hover:underline"
                                  title="Repeat order for this shop"
                                >
                                  <span>Reorder</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </Link>
                              </div>
                            </div>
                          ))
                        ) : (
                          /* ------------------------------------------------------------- */
                          /* PRODUCT-WISE PREVIOUS BOUGHT HISTORY                          */
                          /* ------------------------------------------------------------- */
                          products.map((prod) => (
                            <div
                              key={prod.itemId}
                              className="rounded-xl border border-zinc-200/90 bg-white p-2.5 shadow-2xs hover:border-orange-300 transition-all space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-black text-xs text-zinc-900 truncate" title={prod.itemName}>
                                    {prod.itemName}
                                  </span>
                                  <span className="text-[9px] font-bold px-1 rounded bg-zinc-100 text-zinc-600 shrink-0">
                                    {prod.unit}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 border border-orange-200/60 px-1.5 py-0.2 rounded shrink-0">
                                  Total: {prod.totalQuantity} {prod.unit}
                                </span>
                              </div>

                              <div className="text-[10px] text-zinc-500 font-medium">
                                Last bought: <span className="font-bold text-zinc-800">{prod.lastDateFormatted}</span> ({prod.lastQuantity} {prod.unit}) • {prod.lastTimeAgo}
                              </div>

                              {/* All Previous Purchases List */}
                              <div className="pt-1 border-t border-zinc-100 space-y-1">
                                <span className="text-[9px] uppercase font-bold text-zinc-400 block tracking-wider">
                                  Purchase Records ({prod.purchases.length}):
                                </span>
                                {prod.purchases.map((p, idx) => (
                                  <div
                                    key={p.saleId + idx}
                                    className="flex items-center justify-between text-[11px] font-mono py-0.5 bg-zinc-50 px-2 rounded-md"
                                  >
                                    <span className="text-zinc-700 font-sans">{p.dateFormatted}</span>
                                    <span className="font-bold text-zinc-900">
                                      {p.quantity} {prod.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE B: SINGLE TABLE VIEW                                                 */
        /* 1st Row = Shop Name Header                                                */
        /* Rows Below = Previous purchases / bought history items                    */
        /* ========================================================================= */
        <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead>
                <tr className="bg-zinc-100/90 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-4 w-44">Date / Time</th>
                  <th className="py-2.5 px-3 w-32">Invoice #</th>
                  <th className="py-2.5 px-3 min-w-[280px]">Items & Quantities Bought</th>
                  <th className="py-2.5 px-3 w-28 text-right">Order Amount</th>
                  <th className="py-2.5 px-3 w-24 text-center">Payment</th>
                  <th className="py-2.5 px-4 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
                {filteredShops.map((shopData) => {
                  const shopName = shopData.customer.shopName || shopData.customer.name;
                  const orders = shopData.orders;

                  return (
                    <React.Fragment key={shopData.customer.id}>
                      {/* 1st ROW: SHOP NAME BANNER */}
                      <tr className="bg-zinc-50/90 border-t-2 border-zinc-200/80 hover:bg-zinc-100/60 transition-colors">
                        <td colSpan={6} className="py-2.5 px-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <Store className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-black text-sm text-zinc-900 tracking-tight">
                                {shopName}
                              </span>
                              {shopData.customer.shopName && shopData.customer.name && (
                                <span className="text-xs text-zinc-500 font-medium">
                                  ({shopData.customer.name})
                                </span>
                              )}
                              {shopData.customer.phone && (
                                <a
                                  href={`tel:${shopData.customer.phone}`}
                                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-orange-600 bg-white border border-zinc-200/70 px-2 py-0.5 rounded-lg transition-colors"
                                >
                                  <Phone className="w-3 h-3 text-zinc-400" />
                                  <span>{shopData.customer.phone}</span>
                                </a>
                              )}
                              {shopData.customer.route && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 bg-zinc-200/70 px-2 py-0.5 rounded-lg">
                                  <MapPin className="w-2.5 h-2.5" />
                                  <span>{shopData.customer.route}</span>
                                </span>
                              )}
                              <span className="text-[11px] text-zinc-500 font-semibold bg-white px-2 py-0.5 rounded-lg border border-zinc-200">
                                {shopData.totalOrdersCount} previous purchase{shopData.totalOrdersCount === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              <span
                                className={`text-[11px] font-extrabold font-mono px-2 py-0.5 rounded-lg ${
                                  (shopData.customer.balance || 0) > 0
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-emerald-50 text-emerald-600'
                                }`}
                              >
                                Bal: {formatStatCurrency(shopData.customer.balance || 0, currentOrg?.settings.currency)}
                              </span>
                              <Link
                                to={`/sales/new?customerId=${shopData.customer.id}`}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold shadow-2xs transition-colors"
                                title="Create new sale for this shop"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Sale</span>
                              </Link>
                              <Link
                                to={`/customers/${shopData.customer.id}`}
                                className="p-1 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-800 bg-white hover:bg-zinc-50 transition-colors"
                                title="Open Customer Profile & Ledger"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* ROWS BELOW SHOP NAME: PREVIOUS ORDERS / BOUGHT HISTORY */}
                      {orders.length === 0 ? (
                        <tr className="hover:bg-zinc-50/50">
                          <td colSpan={6} className="py-3 px-4 text-center text-zinc-400 text-xs italic">
                            No previous purchases found for this shop.
                          </td>
                        </tr>
                      ) : (
                        orders.map((order) => (
                          <tr key={order.id} className="hover:bg-orange-50/20 transition-colors">
                            {/* Date */}
                            <td className="py-2.5 px-4 font-mono">
                              <span className="font-bold text-zinc-900 block font-sans text-xs">
                                {format(new Date(order.timestamp), 'dd MMM yyyy')}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-sans">
                                {order.timeAgo}
                              </span>
                            </td>

                            {/* Invoice # */}
                            <td className="py-2.5 px-3">
                              <span className="font-mono text-xs font-bold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                                #{order.invoiceNumber}
                              </span>
                            </td>

                            {/* Items Bought */}
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {order.items.map((item, idx) => (
                                  <span
                                    key={item.itemId + idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-medium text-zinc-800"
                                  >
                                    <span className="font-bold">{item.itemName}:</span>
                                    <span className="font-black font-mono text-orange-700">
                                      {item.quantity} {item.unit}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Total Amount */}
                            <td className="py-2.5 px-3 text-right">
                              <span className="font-black text-zinc-900 font-mono text-xs">
                                {formatCurrency(order.totalAmount, currentOrg?.settings.currency)}
                              </span>
                            </td>

                            {/* Payment Method */}
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                                  order.paymentType === 'cash'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                {order.paymentType}
                              </span>
                            </td>

                            {/* Action */}
                            <td className="py-2.5 px-4 text-right">
                              <Link
                                to={`/sales/new?customerId=${shopData.customer.id}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 hover:border-orange-300 bg-white hover:bg-orange-50 text-zinc-700 hover:text-orange-700 text-[11px] font-bold shadow-2xs transition-colors"
                              >
                                <span>Reorder</span>
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Product Purchase History Drill-down Modal (if needed) */}
      {selectedProductForHistory && (
        <ProductPurchaseHistoryModal
          isOpen={Boolean(selectedProductForHistory)}
          onClose={() => setSelectedProductForHistory(null)}
          customer={selectedProductForHistory.customer}
          prediction={selectedProductForHistory.prediction}
          sales={sales || []}
          currency={currentOrg?.settings?.currency}
        />
      )}
    </div>
  );
}
