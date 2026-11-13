import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Repeat,
  RotateCcw,
  Clock,
  AlertTriangle,
  CalendarCheck,
  Search,
  ShoppingCart,
  Building2,
  ExternalLink,
  Phone,
  MapPin,
  ArrowRight,
  LayoutList,
  Columns3,
  Calendar,
  History,
  Store,
} from 'lucide-react';
import { format } from 'date-fns';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { useTenancy } from '../contexts';
import { Customer, Sale, Item } from '../types';
import {
  calculateRepurchasePredictions,
  CustomerRepurchaseSummary,
  ProductRepurchasePrediction,
  getProductPurchaseHistory,
  ProductPurchaseTransaction,
  formatConsumptionRate,
} from '../utils/repurchasePrediction';
import { formatCurrency, formatStatCurrency } from '../utils/currency';
import { ProductPurchaseHistoryModal } from '../components/repurchase/ProductPurchaseHistoryModal';

type FilterType = 'all' | 'overdue' | 'due_today' | 'upcoming';
type ViewMode = 'rows' | 'columns';

interface ShopReorderData {
  customer: Customer;
  summary: CustomerRepurchaseSummary;
  sales: Sale[];
  salesCount: number;
  totalSalesValue: number;
  productHistories: Map<string, ProductPurchaseTransaction[]>;
}

export default function ReorderPage() {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useTenancy();
  const { customers, sales, items, loading } = useRealtimeData();

  const productCatalogMap = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('rows');
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{
    customer: Customer;
    prediction: ProductRepurchasePrediction;
  } | null>(null);

  // Compute reorder data for each shop
  const allShopsData: ShopReorderData[] = useMemo(() => {
    if (!customers || customers.length === 0) return [];

    return customers.map((cust) => {
      const custSales = (sales || []).filter((s) => s.customerId === cust.id && s.status !== 'cancelled');
      const summary = calculateRepurchasePredictions(custSales, productCatalogMap, cust.id, new Date());
      const totalSalesValue = custSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);

      // Precalculate history for each prediction
      const productHistories = new Map<string, ProductPurchaseTransaction[]>();
      for (const pred of summary.predictions) {
        productHistories.set(
          pred.itemId,
          getProductPurchaseHistory(custSales, cust.id, pred.itemId, pred.unit)
        );
      }

      return {
        customer: cust,
        summary,
        sales: custSales,
        salesCount: custSales.length,
        totalSalesValue,
        productHistories,
      };
    });
  }, [customers, sales, productCatalogMap]);

  // Available routes
  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    customers?.forEach((c) => {
      if (c.route && c.route.trim()) set.add(c.route.trim());
    });
    return Array.from(set).sort();
  }, [customers]);

  // Top summary KPIs
  const kpiStats = useMemo(() => {
    let totalTrackedShops = 0;
    let totalOverdueCount = 0;
    let totalDueTodayCount = 0;
    let totalUpcomingCount = 0;
    let shopsWithOverdue = 0;

    allShopsData.forEach((row) => {
      if (row.summary.totalTrackedProducts > 0) {
        totalTrackedShops++;
      }
      totalOverdueCount += row.summary.overdueCount;
      totalDueTodayCount += row.summary.dueTodayCount;
      totalUpcomingCount += row.summary.upcomingCount;
      if (row.summary.overdueCount > 0) {
        shopsWithOverdue++;
      }
    });

    return {
      totalTrackedShops,
      totalOverdueCount,
      totalDueTodayCount,
      totalUpcomingCount,
      shopsWithOverdue,
    };
  }, [allShopsData]);

  // Filtered rows
  const filteredShops = useMemo(() => {
    return allShopsData
      .filter((row) => {
        // Status Filter
        if (statusFilter === 'overdue' && row.summary.overdueCount === 0) return false;
        if (statusFilter === 'due_today' && row.summary.dueTodayCount === 0) return false;
        if (statusFilter === 'upcoming' && row.summary.upcomingCount === 0) return false;

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
        // Urgent first (overdue > due today > upcoming)
        const aUrgency = a.summary.overdueCount * 100 + a.summary.dueTodayCount * 10 + a.summary.upcomingCount;
        const bUrgency = b.summary.overdueCount * 100 + b.summary.dueTodayCount * 10 + b.summary.upcomingCount;
        if (aUrgency !== bUrgency) return bUrgency - aUrgency;

        const aName = a.customer.shopName || a.customer.name;
        const bName = b.customer.shopName || b.customer.name;
        return aName.localeCompare(bName);
      });
  }, [allShopsData, statusFilter, routeFilter, searchQuery]);

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500 font-medium">
        <RotateCcw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
        Loading shop reorder predictions...
      </div>
    );
  }

  return (
    <div className="space-y-5 font-sans pb-16">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900">
              Shop Reorder Timelines
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Consolidated repurchase history, consumption rates and next order predictions across all shops.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Row vs Column */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button
              type="button"
              onClick={() => setViewMode('rows')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'rows'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Single table with shop header row and product history columns below"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('columns')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'columns'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Shops as 1st row columns with history below"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Shop Columns</span>
            </button>
          </div>

          <Link
            to="/customers"
            className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
          >
            Customers
          </Link>
          <Link
            to="/sales/new"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-[0.98]"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </Link>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl border border-zinc-200 bg-white shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tracked Shops</span>
            <Building2 className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-1">{kpiStats.totalTrackedShops}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">of {customers?.length || 0} total</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'overdue'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/20'
              : 'border-zinc-200 bg-white hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">Overdue Orders</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">{kpiStats.totalOverdueCount}</p>
          <p className="text-[11px] text-rose-600/80 font-medium mt-0.5">
            across {kpiStats.shopsWithOverdue} shop{kpiStats.shopsWithOverdue === 1 ? '' : 's'}
          </p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'due_today' ? 'all' : 'due_today')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'due_today'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20'
              : 'border-zinc-200 bg-white hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10px] font-bold uppercase tracking-wider">Due Today</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-800 mt-1">{kpiStats.totalDueTodayCount}</p>
          <p className="text-[11px] text-amber-700/80 font-medium mt-0.5">Dispatch ready</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'upcoming' ? 'all' : 'upcoming')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'upcoming'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'border-zinc-200 bg-white hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-bold uppercase tracking-wider">Upcoming (7d)</span>
            <CalendarCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">{kpiStats.totalUpcomingCount}</p>
          <p className="text-[11px] text-emerald-600/80 font-medium mt-0.5">On schedule</p>
        </div>
      </div>

      {/* 3. Toolbar: Search, Filters */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 shadow-xs space-y-3">
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

          {availableRoutes.length > 0 && (
            <div className="shrink-0 flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-500">Route:</span>
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            All Shops ({allShopsData.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('overdue')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'overdue'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 text-rose-700 border border-rose-200/70 hover:bg-rose-100/70'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
            <span>Overdue Reorders ({allShopsData.filter((r) => r.summary.overdueCount > 0).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('due_today')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'due_today'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200/70 hover:bg-amber-100/70'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            <span>Due Today ({allShopsData.filter((r) => r.summary.dueTodayCount > 0).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('upcoming')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'upcoming'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 hover:bg-emerald-100/70'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>Upcoming ({allShopsData.filter((r) => r.summary.upcomingCount > 0).length})</span>
          </button>
        </div>
      </div>

      {/* 4. ONLY ONE TABLE ON THE PAGE */}
      {filteredShops.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500 space-y-2">
          <Building2 className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-800">No shops match the selected filter</p>
          <p className="text-xs text-zinc-400">Try clearing filters or searching with a different keyword.</p>
        </div>
      ) : viewMode === 'rows' ? (
        /* ========================================================================= */
        /* VIEW MODE 1: SINGLE UNIFIED TABLE                                         */
        /* 1st Row of each shop = Shop Name & details                                */
        /* Rows below the shop name = Product reorder history in columns             */
        /* ========================================================================= */
        <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[940px]">
              <thead>
                <tr className="bg-zinc-100/80 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-3.5 sticky left-0 bg-zinc-100/90 z-10 w-48 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                    Product / Item
                  </th>
                  <th className="py-2.5 px-3 w-32">Status</th>
                  <th className="py-2.5 px-3 w-36">Next Predicted Order</th>
                  <th className="py-2.5 px-3 w-28">Daily Consumption</th>
                  <th className="py-2.5 px-3 w-24">Avg Interval</th>
                  <th className="py-2.5 px-3 w-36">Last Purchase</th>
                  <th className="py-2.5 px-3 min-w-[340px]">Purchase Timelines & Cycles</th>
                  <th className="py-2.5 px-3.5 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
                {filteredShops.map((shopData) => {
                  const shopName = shopData.customer.shopName || shopData.customer.name;
                  const predictions = shopData.summary.predictions;

                  return (
                    <React.Fragment key={shopData.customer.id}>
                      {/* 1st ROW: SHOP NAME & DETAILS BANNER */}
                      <tr className="bg-zinc-50/90 border-t-2 border-zinc-200/80 hover:bg-zinc-100/60 transition-colors">
                        <td colSpan={8} className="py-2.5 px-3.5">
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
                                  title="Call customer"
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
                              {shopData.summary.overdueCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  <span>{shopData.summary.overdueCount} Overdue</span>
                                </span>
                              ) : shopData.summary.dueTodayCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  <span>{shopData.summary.dueTodayCount} Due Today</span>
                                </span>
                              ) : shopData.summary.upcomingCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>{shopData.summary.upcomingCount} Upcoming</span>
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              <span className={`text-[11px] font-extrabold font-mono px-2 py-0.5 rounded-lg ${
                                (shopData.customer.balance || 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                              }`}>
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

                      {/* ROWS BELOW SHOP NAME: PRODUCT REORDER HISTORY IN COLUMNS */}
                      {predictions.length === 0 ? (
                        <tr className="hover:bg-zinc-50/50">
                          <td colSpan={8} className="py-3 px-4 text-center text-zinc-400 text-xs italic">
                            No repurchase history yet (new shop or single order). Subsequent orders will automatically generate reorder timelines here.
                          </td>
                        </tr>
                      ) : (
                        predictions.map((pred) => {
                          const history = shopData.productHistories.get(pred.itemId) || [];

                          let badgeColor = 'bg-zinc-100 text-zinc-700 border-zinc-200';
                          let dotColor = 'bg-zinc-400';
                          if (pred.status === 'upcoming') {
                            badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            dotColor = 'bg-emerald-500';
                          } else if (pred.status === 'due_today') {
                            badgeColor = 'bg-amber-50 text-amber-900 border-amber-300';
                            dotColor = 'bg-amber-500';
                          } else if (pred.status === 'overdue') {
                            badgeColor = 'bg-rose-50 text-rose-800 border-rose-300';
                            dotColor = 'bg-rose-500';
                          }

                          return (
                            <tr
                              key={pred.itemId}
                              onClick={() =>
                                setSelectedProductForHistory({
                                  customer: shopData.customer,
                                  prediction: pred,
                                })
                              }
                              className="hover:bg-orange-50/20 transition-colors group cursor-pointer"
                            >
                              {/* 1. Product Name & Unit (Sticky on left) */}
                              <td className="py-2.5 px-3.5 sticky left-0 bg-white group-hover:bg-[#fffcf9] transition-colors z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.06)] pl-6">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-xs text-zinc-900 group-hover:text-orange-600 transition-colors">
                                    {pred.itemName}
                                  </span>
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 shrink-0">
                                    {pred.unit}
                                  </span>
                                </div>
                                {pred.sku && (
                                  <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                                    {pred.sku}
                                  </span>
                                )}
                              </td>

                              {/* 2. Status */}
                              <td className="py-2.5 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badgeColor}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                  <span>{pred.statusLabel}</span>
                                </span>
                              </td>

                              {/* 3. Next Predicted Order */}
                              <td className="py-2.5 px-3">
                                <span className="font-black text-zinc-900 block font-mono text-[11px]">
                                  {pred.predictedNextPurchaseDate
                                    ? format(new Date(pred.predictedNextPurchaseDate), 'dd MMM yyyy')
                                    : '—'}
                                </span>
                                <span className="text-[10px] text-zinc-500 block">
                                  {pred.estimatedDaysToNextPurchase !== null
                                    ? `~${Math.round(pred.estimatedDaysToNextPurchase)}d cycle`
                                    : ''}
                                </span>
                              </td>

                              {/* 4. Daily Consumption */}
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-zinc-800 font-mono text-xs">
                                  {formatConsumptionRate(pred.averageDailyConsumption, pred.unit)}
                                </span>
                              </td>

                              {/* 5. Avg Interval */}
                              <td className="py-2.5 px-3">
                                <span className="font-mono text-zinc-700 text-xs font-semibold">
                                  {pred.completedCyclesCount > 0
                                    ? `${(pred.totalCycleDays / pred.completedCyclesCount).toFixed(1)}d`
                                    : '—'}
                                </span>
                              </td>

                              {/* 6. Last Purchase */}
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-zinc-900 block text-[11px]">
                                  {format(new Date(pred.lastPurchaseDate), 'dd MMM yyyy')}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  {pred.lastPurchaseQuantity} {pred.unit}
                                </span>
                              </td>

                              {/* 7. Past Reorder Timeline Flow (Scrollable Horizontal Nodes) */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-[420px]">
                                  {history.length === 0 ? (
                                    <span className="text-zinc-400 text-[11px]">No purchases</span>
                                  ) : (
                                    history.map((h, i) => (
                                      <React.Fragment key={h.saleId + i}>
                                        {i > 0 && h.daysSincePrevious !== null && (
                                          <div className="flex items-center text-zinc-300 shrink-0">
                                            <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200/60 whitespace-nowrap">
                                              +{h.daysSincePrevious}d
                                            </span>
                                            <ArrowRight className="w-3 h-3 text-zinc-400 mx-0.5" />
                                          </div>
                                        )}
                                        <div className="shrink-0 p-1 rounded-md border border-zinc-200 bg-zinc-50 text-center min-w-[65px]">
                                          <div className="text-[9px] font-bold text-zinc-800 whitespace-nowrap">
                                            {format(new Date(h.timestamp), 'dd MMM')}
                                          </div>
                                          <div className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                                            {h.quantity} {pred.unit}
                                          </div>
                                        </div>
                                      </React.Fragment>
                                    ))
                                  )}
                                  {pred.predictedNextPurchaseDate && (
                                    <div className="flex items-center text-zinc-300 shrink-0">
                                      <ArrowRight className="w-3 h-3 text-orange-400 mx-0.5" />
                                      <div className="shrink-0 p-1 rounded-md border border-orange-300 bg-orange-50 text-center min-w-[65px]">
                                        <div className="text-[9px] font-bold text-orange-700 whitespace-nowrap">
                                          {format(new Date(pred.predictedNextPurchaseDate), 'dd MMM')}
                                        </div>
                                        <div className="text-[8px] font-semibold text-orange-600 whitespace-nowrap">
                                          Next Due
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 8. Action */}
                              <td className="py-2.5 px-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProductForHistory({
                                      customer: shopData.customer,
                                      prediction: pred,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 hover:border-orange-300 bg-white hover:bg-orange-50 text-zinc-700 hover:text-orange-700 text-[11px] font-bold shadow-2xs transition-colors"
                                  title="View complete purchase ledger and intervals"
                                >
                                  <History className="w-3 h-3 text-orange-600" />
                                  <span>History</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW MODE 2: SHOP COLUMNS TABLE                                           */
        /* 1st Row of columns = Shop Names                                           */
        /* In column below each shop name = their history                            */
        /* ========================================================================= */
        <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead>
                {/* 1st ROW: SHOP NAMES IN COLUMNS */}
                <tr className="bg-zinc-100 border-b-2 border-zinc-200 text-zinc-900">
                  {filteredShops.map((shopData) => {
                    const shopName = shopData.customer.shopName || shopData.customer.name;
                    return (
                      <th
                        key={shopData.customer.id}
                        className="py-3.5 px-4 min-w-[280px] max-w-[340px] align-top border-r border-zinc-200 last:border-r-0"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-black text-sm text-zinc-900 tracking-tight truncate" title={shopName}>
                              {shopName}
                            </span>
                            <Link
                              to={`/sales/new?customerId=${shopData.customer.id}`}
                              className="p-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                              title="Create sale for this shop"
                            >
                              <ShoppingCart className="w-3 h-3" />
                            </Link>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-500">
                            {shopData.customer.phone && (
                              <span className="flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5 text-zinc-400" />
                                <span>{shopData.customer.phone}</span>
                              </span>
                            )}
                            {shopData.customer.route && (
                              <span className="bg-zinc-200 px-1.5 py-0.2 rounded font-semibold text-zinc-700">
                                {shopData.customer.route}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-0.5">
                            {shopData.summary.overdueCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <span>{shopData.summary.overdueCount} Overdue</span>
                              </span>
                            ) : shopData.summary.dueTodayCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                <span>{shopData.summary.dueTodayCount} Due Today</span>
                              </span>
                            ) : shopData.summary.upcomingCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <span>{shopData.summary.upcomingCount} Upcoming</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-400">No active alerts</span>
                            )}
                            <span className={`text-[10px] font-extrabold font-mono ${
                              (shopData.customer.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                            }`}>
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
                {/* IN COLUMN: THEIR HISTORY BELOW THEIR SHOP NAME */}
                <tr className="align-top divide-x divide-zinc-200">
                  {filteredShops.map((shopData) => {
                    const predictions = shopData.summary.predictions;

                    return (
                      <td key={shopData.customer.id} className="p-3 space-y-2.5 bg-zinc-50/30">
                        {predictions.length === 0 ? (
                          <div className="p-4 text-center text-zinc-400 text-xs italic bg-white rounded-xl border border-zinc-200">
                            No repurchase history yet
                          </div>
                        ) : (
                          predictions.map((pred) => {
                            let badgeStyle = 'bg-zinc-100 text-zinc-700 border-zinc-200';
                            if (pred.status === 'upcoming') {
                              badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            } else if (pred.status === 'due_today') {
                              badgeStyle = 'bg-amber-50 text-amber-900 border-amber-300';
                            } else if (pred.status === 'overdue') {
                              badgeStyle = 'bg-rose-50 text-rose-800 border-rose-300';
                            }

                            return (
                              <div
                                key={pred.itemId}
                                onClick={() =>
                                  setSelectedProductForHistory({
                                    customer: shopData.customer,
                                    prediction: pred,
                                  })
                                }
                                className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:border-orange-300 hover:shadow-xs transition-all cursor-pointer group"
                                title="Click to view full purchase history & intervals"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-black text-xs text-zinc-900 group-hover:text-orange-600 transition-colors truncate">
                                      {pred.itemName}
                                    </span>
                                    <span className="text-[9px] font-bold px-1 rounded bg-zinc-100 text-zinc-600 shrink-0">
                                      {pred.unit}
                                    </span>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${badgeStyle}`}>
                                    {pred.statusLabel}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 text-[10px] text-zinc-600 pt-1 border-t border-zinc-100 mt-1.5 font-mono">
                                  <div>
                                    <span className="text-zinc-400 block text-[9px] uppercase font-sans">Next Due</span>
                                    <span className="font-black text-zinc-900">
                                      {pred.predictedNextPurchaseDate
                                        ? format(new Date(pred.predictedNextPurchaseDate), 'dd MMM yyyy')
                                        : '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-400 block text-[9px] uppercase font-sans">Consumption</span>
                                    <span className="font-bold text-zinc-800">
                                      {formatConsumptionRate(pred.averageDailyConsumption, pred.unit)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-400 block text-[9px] uppercase font-sans">Avg Interval</span>
                                    <span className="font-bold text-zinc-800">
                                      {pred.completedCyclesCount > 0
                                        ? `${(pred.totalCycleDays / pred.completedCyclesCount).toFixed(1)}d`
                                        : '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-400 block text-[9px] uppercase font-sans">Last Order</span>
                                    <span className="font-bold text-zinc-800">
                                      {format(new Date(pred.lastPurchaseDate), 'dd MMM')} ({pred.lastPurchaseQuantity} {pred.unit})
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Product Purchase History Drill-down Modal */}
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
