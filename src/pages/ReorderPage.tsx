import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Repeat,
  RotateCcw,
  Clock,
  AlertTriangle,
  CalendarCheck,
  Search,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Package,
  Building2,
  User,
  ArrowRight,
  Filter,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Phone,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { useTenancy } from '../contexts';
import { Customer, Sale, Item } from '../types';
import {
  calculateRepurchasePredictions,
  CustomerRepurchaseSummary,
  ProductRepurchasePrediction,
  formatConsumptionRate,
} from '../utils/repurchasePrediction';
import { formatCurrency, formatStatCurrency } from '../utils/currency';
import { CustomerReorderTimelineTable } from '../components/repurchase/CustomerReorderTimelineTable';
import { ProductPurchaseHistoryModal } from '../components/repurchase/ProductPurchaseHistoryModal';

type FilterType = 'all' | 'overdue' | 'due_today' | 'upcoming' | 'stocked';

interface ShopReorderRow {
  customer: Customer;
  summary: CustomerRepurchaseSummary;
  salesCount: number;
  totalSalesValue: number;
  mostUrgentProduct?: ProductRepurchasePrediction;
}

export default function ReorderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentOrg } = useTenancy();
  const { customers, sales, items, loading } = useRealtimeData();

  const productCatalogMap = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [expandedShopIds, setExpandedShopIds] = useState<Record<string, boolean>>({});
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{
    customer: Customer;
    prediction: ProductRepurchasePrediction;
  } | null>(null);

  // Compute reorder summaries for all shops
  const allShopRows: ShopReorderRow[] = useMemo(() => {
    if (!customers || customers.length === 0) return [];

    return customers.map((cust) => {
      const custSales = (sales || []).filter((s) => s.customerId === cust.id && s.status !== 'cancelled');
      const summary = calculateRepurchasePredictions(custSales, productCatalogMap, cust.id, new Date());
      const totalSalesValue = custSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);

      // Most urgent product: top item after sorting by urgency in calculateRepurchasePredictions
      const mostUrgentProduct = summary.predictions.length > 0 ? summary.predictions[0] : undefined;

      return {
        customer: cust,
        summary,
        salesCount: custSales.length,
        totalSalesValue,
        mostUrgentProduct,
      };
    });
  }, [customers, sales, productCatalogMap]);

  // Unique routes for filtering
  const availableRoutes = useMemo(() => {
    const set = new Set<string>();
    customers?.forEach((c) => {
      if (c.route && c.route.trim()) set.add(c.route.trim());
    });
    return Array.from(set).sort();
  }, [customers]);

  // Top summary KPIs across all shops
  const kpiStats = useMemo(() => {
    let totalTrackedShops = 0;
    let totalOverdueCount = 0;
    let totalDueTodayCount = 0;
    let totalUpcomingCount = 0;
    let shopsWithOverdue = 0;

    allShopRows.forEach((row) => {
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
  }, [allShopRows]);

  // Filtered rows
  const filteredShopRows = useMemo(() => {
    return allShopRows.filter((row) => {
      // 1. Status Filter
      if (statusFilter === 'overdue' && row.summary.overdueCount === 0) return false;
      if (statusFilter === 'due_today' && row.summary.dueTodayCount === 0) return false;
      if (statusFilter === 'upcoming' && row.summary.upcomingCount === 0) return false;
      if (statusFilter === 'stocked' && (row.summary.overdueCount > 0 || row.summary.dueTodayCount > 0)) return false;

      // 2. Route Filter
      if (routeFilter !== 'all' && (row.customer.route || '').trim() !== routeFilter) return false;

      // 3. Search Query
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
    }).sort((a, b) => {
      // Primary sort: shops with overdue orders first, then due today, then upcoming
      const aUrgency = a.summary.overdueCount * 100 + a.summary.dueTodayCount * 10 + a.summary.upcomingCount;
      const bUrgency = b.summary.overdueCount * 100 + b.summary.dueTodayCount * 10 + b.summary.upcomingCount;
      if (aUrgency !== bUrgency) return bUrgency - aUrgency;

      const aName = a.customer.shopName || a.customer.name;
      const bName = b.customer.shopName || b.customer.name;
      return aName.localeCompare(bName);
    });
  }, [allShopRows, statusFilter, routeFilter, searchQuery]);

  // Selected shop row for the dedicated history table model below all shops table
  const selectedShopRow = useMemo(() => {
    if (selectedShopId) {
      const found = filteredShopRows.find((r) => r.customer.id === selectedShopId);
      if (found) return found;
    }
    return filteredShopRows.length > 0 ? filteredShopRows[0] : null;
  }, [filteredShopRows, selectedShopId]);

  // Sync selected shop & auto-expand if customerId passed in searchParams or if top overdue
  useEffect(() => {
    const custId = searchParams.get('customerId');
    if (custId) {
      setSelectedShopId(custId);
      setExpandedShopIds((prev) => ({ ...prev, [custId]: true }));
    } else if (filteredShopRows.length > 0 && !selectedShopId) {
      const firstActive = filteredShopRows.find((r) => r.summary.totalTrackedProducts > 0);
      if (firstActive) {
        setSelectedShopId(firstActive.customer.id);
        setExpandedShopIds({ [firstActive.customer.id]: true });
      } else {
        setSelectedShopId(filteredShopRows[0].customer.id);
      }
    }
  }, [searchParams, filteredShopRows, selectedShopId]);

  const toggleShopExpand = (customerId: string) => {
    setExpandedShopIds((prev) => ({
      ...prev,
      [customerId]: !prev[customerId],
    }));
  };

  const handleExpandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    filteredShopRows.forEach((r) => {
      allExpanded[r.customer.id] = true;
    });
    setExpandedShopIds(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedShopIds({});
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500 font-medium">
        <RotateCcw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
        Loading reorder prediction timelines...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900">
                Shop Reorder Hub
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
                Rolling repurchase predictions, past timelines & consumption intervals across all shops.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/customers"
            className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
          >
            Manage Customers
          </Link>
          <Link
            to="/sales/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all active:scale-[0.98]"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>New Sale</span>
          </Link>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Shops */}
        <div className="p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 bg-white shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tracked Shops</span>
            <Building2 className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-1">
            {kpiStats.totalTrackedShops}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            of {customers?.length || 0} total registered
          </p>
        </div>

        {/* Card 2: Overdue Orders */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'overdue'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/20'
              : 'border-zinc-200/80 bg-white hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">Overdue Orders</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
            {kpiStats.totalOverdueCount}
          </p>
          <p className="text-[11px] text-rose-600/80 font-medium mt-0.5">
            across {kpiStats.shopsWithOverdue} shop{kpiStats.shopsWithOverdue === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 3: Due Today */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'due_today' ? 'all' : 'due_today')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'due_today'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20'
              : 'border-zinc-200/80 bg-white hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10px] font-bold uppercase tracking-wider">Due Today</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-800 mt-1">
            {kpiStats.totalDueTodayCount}
          </p>
          <p className="text-[11px] text-amber-700/80 font-medium mt-0.5">
            Reorder dispatch ready
          </p>
        </div>

        {/* Card 4: Upcoming */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'upcoming' ? 'all' : 'upcoming')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'upcoming'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'border-zinc-200/80 bg-white hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-bold uppercase tracking-wider">Upcoming (7d)</span>
            <CalendarCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
            {kpiStats.totalUpcomingCount}
          </p>
          <p className="text-[11px] text-emerald-600/80 font-medium mt-0.5">
            Expected on schedule
          </p>
        </div>
      </div>

      {/* 3. Toolbar: Search, Filters & Expand Controls */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
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

          {/* Route Filter Dropdown if routes available */}
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

          {/* Expand / Collapse All */}
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-[11px] font-semibold text-zinc-700 transition-colors"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-[11px] font-semibold text-zinc-700 transition-colors"
            >
              Collapse All
            </button>
          </div>
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
            All Shops ({allShopRows.length})
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
            <span>Overdue Reorders ({allShopRows.filter((r) => r.summary.overdueCount > 0).length})</span>
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
            <span>Due Today ({allShopRows.filter((r) => r.summary.dueTodayCount > 0).length})</span>
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
            <span>Upcoming ({allShopRows.filter((r) => r.summary.upcomingCount > 0).length})</span>
          </button>
        </div>
      </div>

      {/* 4. Master Table Model: All Shops with Expandable History Table Below */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xs overflow-hidden">
        {filteredShopRows.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 space-y-2">
            <Building2 className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-zinc-800">No shops match the selected filter</p>
            <p className="text-xs text-zinc-400">Try clearing filters or searching with a different keyword.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[880px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="py-3 px-3.5 w-10 text-center">#</th>
                  <th className="py-3 px-3.5 min-w-[220px]">Shop & Customer</th>
                  <th className="py-3 px-3 min-w-[160px]">Reorder Status</th>
                  <th className="py-3 px-3 min-w-[180px]">Most Urgent Product Due</th>
                  <th className="py-3 px-3 text-center w-28">Tracked Items</th>
                  <th className="py-3 px-3 text-right w-32">Balance Due</th>
                  <th className="py-3 px-3.5 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 font-medium text-zinc-700">
                {filteredShopRows.map((row, index) => {
                  const isExpanded = Boolean(expandedShopIds[row.customer.id]);
                  const isSelected = selectedShopRow?.customer.id === row.customer.id;
                  const custSales = (sales || []).filter(
                    (s) => s.customerId === row.customer.id && s.status !== 'cancelled'
                  );

                  return (
                    <React.Fragment key={row.customer.id}>
                      {/* Master Shop Row */}
                      <tr
                        onClick={() => {
                          setSelectedShopId(row.customer.id);
                        }}
                        className={`hover:bg-orange-50/20 transition-all cursor-pointer select-none ${
                          isSelected ? 'bg-orange-50/50 ring-1 ring-inset ring-orange-300' : isExpanded ? 'bg-orange-50/30' : ''
                        }`}
                      >
                        {/* Expand Icon */}
                        <td className="py-3.5 px-3.5 text-center text-zinc-400">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedShopId(row.customer.id);
                              toggleShopExpand(row.customer.id);
                            }}
                            className="p-1 rounded-md hover:bg-zinc-200/70 text-zinc-500 transition-colors"
                            title={isExpanded ? 'Collapse reorder history' : 'Expand reorder history'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-orange-600 font-bold" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Shop & Customer */}
                        <td className="py-3.5 px-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-zinc-900 group-hover:text-orange-600 transition-colors">
                              {row.customer.shopName || row.customer.name}
                            </span>
                            {row.customer.shopName && row.customer.name && (
                              <span className="text-[11px] text-zinc-500 font-medium">
                                ({row.customer.name})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                            {row.customer.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span>{row.customer.phone}</span>
                              </span>
                            )}
                            {row.customer.route && (
                              <span className="flex items-center gap-1 font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{row.customer.route}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Reorder Status */}
                        <td className="py-3.5 px-3">
                          {row.summary.overdueCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                              <span>{row.summary.overdueCount} Overdue</span>
                            </span>
                          ) : row.summary.dueTodayCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>{row.summary.dueTodayCount} Due Today</span>
                            </span>
                          ) : row.summary.upcomingCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>{row.summary.upcomingCount} Upcoming</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-zinc-100 text-zinc-500">
                              <span>No active alerts</span>
                            </span>
                          )}
                        </td>

                        {/* Most Urgent Product Due */}
                        <td className="py-3.5 px-3">
                          {row.mostUrgentProduct ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-zinc-800">
                                  {row.mostUrgentProduct.itemName}
                                </span>
                                <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-zinc-100 text-zinc-600">
                                  {row.mostUrgentProduct.unit}
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-500 block mt-0.5 font-medium">
                                {row.mostUrgentProduct.statusLabel} • Next: {row.mostUrgentProduct.predictedNextPurchaseDate ? format(new Date(row.mostUrgentProduct.predictedNextPurchaseDate), 'dd MMM') : '—'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Tracked Items Count */}
                        <td className="py-3.5 px-3 text-center">
                          <span className="font-extrabold text-zinc-800 text-xs font-mono">
                            {row.summary.totalTrackedProducts}
                          </span>
                        </td>

                        {/* Balance Due */}
                        <td className="py-3.5 px-3 text-right">
                          <span className={`font-extrabold font-mono text-xs ${
                            (row.customer.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {formatStatCurrency(row.customer.balance || 0, currentOrg?.settings.currency)}
                          </span>
                        </td>

                        {/* Action buttons */}
                        <td className="py-3.5 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedShopId(row.customer.id);
                                toggleShopExpand(row.customer.id);
                              }}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors shadow-2xs ${
                                isSelected
                                  ? 'border-orange-400 bg-orange-50 text-orange-700'
                                  : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                              }`}
                              title={isExpanded ? 'Hide history table' : 'Show reorder history table'}
                            >
                              {isExpanded ? 'Hide Table' : 'View History'}
                            </button>

                            <Link
                              to={`/sales/new?customerId=${row.customer.id}`}
                              className="p-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                              title="Create sale for this shop"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </Link>

                            <Link
                              to={`/customers/${row.customer.id}`}
                              className="p-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
                              title="Open Customer Profile & Ledger"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable History Table Model: Directly Below that shop row */}
                      {isExpanded && (
                        <tr className="bg-orange-50/20 border-b-2 border-orange-200/80">
                          <td colSpan={7} className="p-3 sm:p-5">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Repeat className="w-4 h-4 text-orange-600" />
                                  <h4 className="text-xs sm:text-sm font-extrabold text-zinc-900">
                                    Reorder Timelines & Consumption History for {row.customer.shopName || row.customer.name}
                                  </h4>
                                </div>
                                <span className="text-[11px] text-zinc-500 font-medium">
                                  Click any product to inspect past purchase dates & cycle intervals
                                </span>
                              </div>

                              <CustomerReorderTimelineTable
                                sales={custSales}
                                productCatalog={productCatalogMap}
                                customerId={row.customer.id}
                                customerName={row.customer.name}
                                onProductClick={(pred) => {
                                  setSelectedProductForHistory({
                                    customer: row.customer,
                                    prediction: pred,
                                  });
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Reorder History Table Model for Selected Shop (Positioned Directly Below All Shops Table) */}
      {selectedShopRow && (
        <div id="selected-shop-history-section" className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                <Repeat className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-zinc-900">
                    {selectedShopRow.customer.shopName || selectedShopRow.customer.name} — Reorder Timelines & Purchase History
                  </h3>
                  {selectedShopRow.customer.shopName && selectedShopRow.customer.name && (
                    <span className="text-xs text-zinc-500 font-medium">
                      ({selectedShopRow.customer.name})
                    </span>
                  )}
                  {selectedShopRow.summary.overdueCount > 0 ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                      {selectedShopRow.summary.overdueCount} Overdue
                    </span>
                  ) : selectedShopRow.summary.dueTodayCount > 0 ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      {selectedShopRow.summary.dueTodayCount} Due Today
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Historical purchase dates, interval cycles, consumption rates, and predicted next reorder dates.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg">
                Selected Shop History
              </span>
            </div>
          </div>

          <CustomerReorderTimelineTable
            sales={(sales || []).filter((s) => s.customerId === selectedShopRow.customer.id && s.status !== 'cancelled')}
            productCatalog={productCatalogMap}
            customerId={selectedShopRow.customer.id}
            customerName={selectedShopRow.customer.name}
            onProductClick={(pred) => {
              setSelectedProductForHistory({
                customer: selectedShopRow.customer,
                prediction: pred,
              });
            }}
          />
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
