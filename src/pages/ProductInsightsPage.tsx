import React, { useMemo, useState } from 'react';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
} from 'date-fns';
import {
  BarChart3,
  TrendingUp,
  Package,
  Trophy,
  Medal,
  Award,
  Calendar,
  Search,
  X,
  Boxes,
  ArrowUpDown,
  Tag,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { formatCurrency } from '../utils/currency';
import { getItemDisplayName } from '../utils/items';
import { PremiumDateRangePicker } from '../components/PremiumDateRangePicker';

type DateFilterPreset = 'today' | 'this-week' | 'this-month' | 'custom';
type SortField = 'quantity' | 'revenue' | 'name';
type SortDirection = 'asc' | 'desc';

export interface ProductInsightItem {
  rank: number;
  itemId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitsSold: number;
  totalRevenue: number;
  orderCount: number;
  averagePrice: number;
}

export function ProductInsightsPage() {
  const { currentOrg } = useTenancy();
  const { items: rawItems, categories, sales, loading } = useRealtimeData();

  // 1. Date Filter State
  const [filterPreset, setFilterPreset] = useState<DateFilterPreset>('this-month');
  const [customStartDate, setCustomStartDate] = useState<string>(() =>
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Search & secondary sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('quantity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Lookup maps
  const itemsMap = useMemo(() => new Map(rawItems.map((item) => [item.id, item])), [rawItems]);
  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat.name])),
    [categories]
  );

  // 2. Active Date Interval
  const activeInterval = useMemo(() => {
    const now = new Date();
    if (filterPreset === 'today') {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return {
        start,
        end,
        label: 'Today',
        formattedRange: format(now, 'dd MMM yyyy'),
      };
    }

    if (filterPreset === 'this-week') {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      return {
        start,
        end,
        label: 'This Week',
        formattedRange: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
      };
    }

    if (filterPreset === 'this-month') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return {
        start,
        end,
        label: 'This Month',
        formattedRange: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
      };
    }

    // Custom
    const start = customStartDate ? startOfDay(parseISO(customStartDate)) : startOfMonth(now);
    const end = customEndDate ? endOfDay(parseISO(customEndDate)) : endOfMonth(now);
    return {
      start,
      end,
      label: 'Custom',
      formattedRange: `${format(start, 'dd MMM yyyy')} – ${format(end, 'dd MMM yyyy')}`,
    };
  }, [filterPreset, customStartDate, customEndDate]);

  // 3. Query all completed sales invoices within the selected date period
  const periodSales = useMemo(() => {
    const startTime = activeInterval.start.getTime();
    const endTime = activeInterval.end.getTime();

    return sales.filter((sale) => {
      // Exclude cancelled sales
      if (sale.status === 'cancelled') return false;
      // Must be completed (or unannotated legacy invoice)
      if (sale.status && sale.status !== 'completed') return false;

      const t = Number(sale.timestamp) || 0;
      return t >= startTime && t <= endTime;
    });
  }, [sales, activeInterval]);

  // 4. Aggregate sales per product & rank from highest to lowest based on quantity sold
  const rankedProductStats = useMemo(() => {
    const aggMap = new Map<
      string,
      {
        itemId: string;
        name: string;
        sku: string;
        category: string;
        unit: string;
        unitsSold: number;
        totalRevenue: number;
        orderCount: number;
      }
    >();

    periodSales.forEach((sale) => {
      const seenItemsInSale = new Set<string>();

      (sale.items || []).forEach((line) => {
        if (!line.itemId) return;

        const quantity = Number(line.quantity) || 0;
        if (quantity <= 0) return;

        const subtotal =
          Number(line.subtotal) != null && !isNaN(Number(line.subtotal)) && Number(line.subtotal) > 0
            ? Number(line.subtotal)
            : (Number(line.unitPrice) || 0) * quantity;

        const existing = aggMap.get(line.itemId);
        if (!existing) {
          const item = itemsMap.get(line.itemId);
          const name = item ? getItemDisplayName(item) : `Unknown Product (${line.itemId.slice(0, 6)})`;
          const sku = item?.sku || '';
          const category = item?.categoryId ? categoryMap.get(item.categoryId) || 'General' : 'General';
          const unit = item?.unit || 'pcs';

          aggMap.set(line.itemId, {
            itemId: line.itemId,
            name,
            sku,
            category,
            unit,
            unitsSold: quantity,
            totalRevenue: subtotal,
            orderCount: 1,
          });
          seenItemsInSale.add(line.itemId);
        } else {
          existing.unitsSold += quantity;
          existing.totalRevenue += subtotal;
          if (!seenItemsInSale.has(line.itemId)) {
            existing.orderCount += 1;
            seenItemsInSale.add(line.itemId);
          }
        }
      });
    });

    // Rank items from highest to lowest based on quantity sold (#1, #2, #3...)
    const list = Array.from(aggMap.values()).sort(
      (a, b) => b.unitsSold - a.unitsSold || b.totalRevenue - a.totalRevenue
    );

    return list.map((item, index): ProductInsightItem => ({
      ...item,
      rank: index + 1,
      averagePrice: item.unitsSold > 0 ? item.totalRevenue / item.unitsSold : 0,
    }));
  }, [periodSales, itemsMap, categoryMap]);

  // 5. Overview Metric Cards calculations
  const totalUnitsSold = useMemo(
    () => rankedProductStats.reduce((acc, curr) => acc + curr.unitsSold, 0),
    [rankedProductStats]
  );

  const totalProductRevenue = useMemo(
    () => rankedProductStats.reduce((acc, curr) => acc + curr.totalRevenue, 0),
    [rankedProductStats]
  );

  const topPerformer = rankedProductStats.length > 0 ? rankedProductStats[0] : null;

  // Maximum units sold by #1 item (for relative volume progress bar)
  const maxUnitsSold = topPerformer ? Math.max(topPerformer.unitsSold, 1) : 1;

  // Filtered & sorted list (preserving original overall rank)
  const displayedItems = useMemo(() => {
    let result = rankedProductStats;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'quantity') {
      return [...result].sort((a, b) =>
        sortDirection === 'desc' ? b.unitsSold - a.unitsSold : a.unitsSold - b.unitsSold
      );
    } else if (sortBy === 'revenue') {
      return [...result].sort((a, b) =>
        sortDirection === 'desc' ? b.totalRevenue - a.totalRevenue : a.totalRevenue - b.totalRevenue
      );
    } else if (sortBy === 'name') {
      return [...result].sort((a, b) =>
        sortDirection === 'desc'
          ? b.name.localeCompare(a.name, undefined, { numeric: true })
          : a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    }

    return result;
  }, [rankedProductStats, searchTerm, sortBy, sortDirection]);

  // Tab click handler
  const handleTabClick = (preset: DateFilterPreset) => {
    setFilterPreset(preset);
    if (preset === 'custom') {
      setIsCalendarOpen(true);
    } else {
      setIsCalendarOpen(false);
    }
  };

  // Helper renderer for ranking badge
  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-xs">
          <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 fill-amber-400 shrink-0" />
          <span>#1<span className="hidden sm:inline"> Top Seller</span></span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 shadow-xs">
          <Medal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 fill-slate-300 shrink-0" />
          <span>#2<span className="hidden sm:inline"> Runner Up</span></span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold bg-orange-50 text-orange-900 border border-orange-300 shadow-xs">
          <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-600 fill-orange-300 shrink-0" />
          <span>#3<span className="hidden sm:inline"> Bronze</span></span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-zinc-100 text-zinc-600">
        #{rank}
      </span>
    );
  };

  const currency = currentOrg?.settings?.currency || 'INR';

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-100">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Product Insights</h1>
          </div>
        </div>
      </div>

      {/* ── Top Bar: Date Range Filter Tabs ── */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-2.5 sm:p-4 shadow-xs">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 hidden sm:inline">
              Period:
            </span>

            {/* Tight 4-item horizontal row on all mobile screens */}
            <div className="grid grid-cols-4 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
              <button
                type="button"
                onClick={() => handleTabClick('today')}
                className={`rounded-lg sm:rounded-xl px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold transition-all text-center truncate ${
                  filterPreset === 'today'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('this-week')}
                className={`rounded-lg sm:rounded-xl px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold transition-all text-center truncate ${
                  filterPreset === 'this-week'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                This Week
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('this-month')}
                className={`rounded-lg sm:rounded-xl px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold transition-all text-center truncate ${
                  filterPreset === 'this-month'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                This Month
              </button>

              <PremiumDateRangePicker
                startDate={customStartDate}
                endDate={customEndDate}
                onChange={(start, end) => {
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                  setFilterPreset('custom');
                }}
                isOpen={filterPreset === 'custom' && isCalendarOpen}
                onOpenChange={(open) => {
                  setIsCalendarOpen(open);
                  if (open) setFilterPreset('custom');
                }}
                align="left"
                className="w-full sm:w-auto"
                popoverClassName="max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:mx-auto max-sm:w-auto"
                customTrigger={({ open, toggle }) => (
                  <button
                    type="button"
                    onClick={() => {
                      if (filterPreset !== 'custom') {
                        setFilterPreset('custom');
                        setIsCalendarOpen(true);
                      } else {
                        toggle();
                      }
                    }}
                    className={`w-full inline-flex items-center justify-center gap-1 rounded-lg sm:rounded-xl px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold transition-all truncate ${
                      filterPreset === 'custom'
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Custom</span>
                  </button>
                )}
              />
            </div>
          </div>

          {/* Active Range & Invoices count indicator */}
          <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg bg-orange-50 px-2 py-0.5 sm:px-2.5 sm:py-1 font-semibold text-orange-700 border border-orange-200/60">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-orange-600 shrink-0" />
              <span className="truncate">{activeInterval.formattedRange}</span>
            </span>
            <span className="text-zinc-400">•</span>
            <span className="font-medium text-zinc-600 shrink-0">
              {periodSales.length} {periodSales.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Ultra-Compact Top Summary Cards (Single Row 3-Column Grid) ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {/* Card 1: Total Units Sold */}
        <div className="rounded-xl sm:rounded-2xl border border-zinc-200 bg-white p-2.5 sm:p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 truncate" title="Total Units Sold">
              <span className="sm:hidden">Units Sold</span>
              <span className="hidden sm:inline">Total Units Sold</span>
            </p>
            <Package className="h-3.5 w-3.5 sm:hidden text-orange-500 shrink-0" />
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100 shrink-0">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-1 sm:mt-2 text-base sm:text-2xl font-bold tracking-tight text-zinc-900 truncate">
            {totalUnitsSold.toLocaleString()}
          </p>
        </div>

        {/* Card 2: Total Product Revenue */}
        <div className="rounded-xl sm:rounded-2xl border border-zinc-200 bg-white p-2.5 sm:p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 truncate" title="Total Product Revenue">
              <span className="sm:hidden">Revenue</span>
              <span className="hidden sm:inline">Total Product Revenue</span>
            </p>
            <TrendingUp className="h-3.5 w-3.5 sm:hidden text-emerald-500 shrink-0" />
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-1 sm:mt-2 text-base sm:text-2xl font-bold tracking-tight text-zinc-900 truncate">
            {formatCurrency(totalProductRevenue, currency)}
          </p>
        </div>

        {/* Card 3: Top Performer */}
        <div className="rounded-xl sm:rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 p-2.5 sm:p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-amber-800 truncate" title="Top Performer">
              Top Performer
            </p>
            <Trophy className="h-3.5 w-3.5 sm:hidden text-amber-600 fill-amber-400 shrink-0" />
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700 border border-amber-200 shrink-0">
              <Trophy className="h-5 w-5 fill-amber-400 text-amber-600" />
            </div>
          </div>
          <p className="mt-1 sm:mt-2 text-base sm:text-2xl font-bold tracking-tight text-zinc-900 truncate" title={topPerformer?.name}>
            {topPerformer ? topPerformer.name : '—'}
          </p>
        </div>
      </div>

      {/* ── Products List Header & Controls ── */}
      <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between pt-0.5 sm:pt-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-bold text-zinc-900">Ranked Product Performance</h2>
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
            {displayedItems.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product or SKU..."
              className="w-full rounded-xl border border-zinc-200 bg-white pl-8 sm:pl-10 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 shadow-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-xs shrink-0">
            <ArrowUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-zinc-400 ml-0.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="bg-transparent text-[11px] sm:text-xs font-semibold text-zinc-700 outline-none cursor-pointer py-1"
            >
              <option value="quantity">Units Sold</option>
              <option value="revenue">Revenue</option>
              <option value="name">Name</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              title={sortDirection === 'desc' ? 'Descending' : 'Ascending'}
              className="rounded p-1 hover:bg-zinc-100 text-zinc-600 text-xs font-bold"
            >
              {sortDirection === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex items-center justify-center rounded-2xl border border-zinc-200 bg-white p-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
            <p className="text-sm font-semibold text-zinc-600">Loading product sales analytics...</p>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && displayedItems.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 mb-4">
            <Boxes className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900">
            {searchTerm ? 'No matching products found' : 'No sales recorded in this period'}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
            {searchTerm
              ? `No products match "${searchTerm}". Clear your search or try another keyword.`
              : `There were no completed sales invoices between ${activeInterval.formattedRange}. Try selecting "This Month" or a broader custom date range.`}
          </p>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-md shadow-orange-100 hover:bg-orange-600 transition"
            >
              Clear Search Filter
            </button>
          )}
        </div>
      )}

      {/* ── Main Data View: Ranked Table ── */}
      {!loading && displayedItems.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 sm:py-3.5 px-3 sm:px-4 w-20 sm:w-28">Rank</th>
                <th className="py-2.5 sm:py-3.5 px-3 sm:px-4 min-w-[160px] sm:min-w-[200px]">Product</th>
                <th className="py-2.5 sm:py-3.5 px-3 sm:px-4 min-w-[120px] sm:min-w-[140px]">Units Sold</th>
                <th className="py-2.5 sm:py-3.5 px-3 sm:px-4">Avg. Price</th>
                <th className="py-2.5 sm:py-3.5 px-3 sm:px-4 text-right min-w-[110px] sm:min-w-[130px]">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {displayedItems.map((product) => {
                const volumeRatio = (product.unitsSold / maxUnitsSold) * 100;
                const isTopThree = product.rank <= 3;

                return (
                  <tr
                    key={product.itemId}
                    className={`transition-colors hover:bg-zinc-50/70 ${
                      isTopThree ? 'bg-orange-50/15' : ''
                    }`}
                  >
                    {/* Rank Badge */}
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-4 align-middle whitespace-nowrap">
                      {renderRankBadge(product.rank)}
                    </td>

                    {/* Item Name & Details */}
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-4 align-middle">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 leading-tight">
                          {product.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                          {product.sku && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
                              <Tag className="h-3 w-3 text-zinc-400" />
                              {product.sku}
                            </span>
                          )}
                          <span className="text-zinc-400">•</span>
                          <span className="text-zinc-500">{product.category}</span>
                          <span className="text-zinc-400">•</span>
                          <span className="text-zinc-400 text-[11px]">
                            {product.orderCount} {product.orderCount === 1 ? 'order' : 'orders'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Units Sold + Relative Volume Bar */}
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-4 align-middle whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-bold text-zinc-900">
                            {product.unitsSold.toLocaleString()}
                          </span>
                          <span className="text-xs font-medium text-zinc-400">
                            {product.unit}
                          </span>
                        </div>
                        {/* Visual volume distribution bar */}
                        <div className="h-1.5 w-20 sm:w-24 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              product.rank === 1
                                ? 'bg-amber-500'
                                : product.rank === 2
                                ? 'bg-slate-400'
                                : product.rank === 3
                                ? 'bg-orange-500'
                                : 'bg-zinc-300'
                            }`}
                            style={{ width: `${Math.max(volumeRatio, 5)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Avg Price */}
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-4 align-middle whitespace-nowrap text-zinc-600 font-medium">
                      {formatCurrency(product.averagePrice, currency)}
                    </td>

                    {/* Total Revenue */}
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-4 align-middle text-right whitespace-nowrap">
                      <span className="text-sm sm:text-base font-bold text-zinc-900">
                        {formatCurrency(product.totalRevenue, currency)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
