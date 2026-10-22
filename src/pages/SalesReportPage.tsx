import React, { useMemo, useState } from 'react';
import { useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { Sale } from '../types';
import { formatCurrency } from '../utils/currency';
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  parseISO,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import {
  TrendingUp,
  Coins,
  CreditCard,
  Calendar,
  Search,
  Clock,
  User,
} from 'lucide-react';

type DateFilterType = 'today' | 'yesterday' | 'custom-date' | 'custom-range' | 'month';

export const SalesReportPage: React.FC = () => {
  const { currentOrg } = useTenancy();
  const { sales, customers } = useRealtimeData();

  // State variables for filter
  const [filterType, setFilterType] = useState<DateFilterType>('today');
  const [singleDate, setSingleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [rangeFrom, setRangeFrom] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [rangeTo, setRangeTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [searchTerm, setSearchTerm] = useState<string>('');

  // 1. Calculate active date interval
  const interval = useMemo(() => {
    const now = new Date();
    let start = startOfDay(now);
    let end = endOfDay(now);

    if (filterType === 'yesterday') {
      const yesterday = subDays(now, 1);
      start = startOfDay(yesterday);
      end = endOfDay(yesterday);
    } else if (filterType === 'custom-date' && singleDate) {
      const parsed = parseISO(singleDate);
      start = startOfDay(parsed);
      end = endOfDay(parsed);
    } else if (filterType === 'custom-range' && rangeFrom && rangeTo) {
      start = startOfDay(parseISO(rangeFrom));
      end = endOfDay(parseISO(rangeTo));
    } else if (filterType === 'month' && selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      start = startOfMonth(new Date(year, month - 1));
      end = endOfMonth(new Date(year, month - 1));
    }

    return { start, end };
  }, [filterType, singleDate, rangeFrom, rangeTo, selectedMonth]);

  // 2. Filter sales by date and status (exclude cancelled sales)
  const periodSales = useMemo(() => {
    return sales.filter((sale) => {
      if (sale.status === 'cancelled') return false;
      const t = sale.timestamp;
      return t >= interval.start.getTime() && t <= interval.end.getTime();
    });
  }, [sales, interval]);

  // 3. Compute metrics
  const metrics = useMemo(() => {
    let totalSales = 0;
    let cashSales = 0;
    let creditSales = 0;

    periodSales.forEach((sale) => {
      totalSales += sale.totalAmount;
      cashSales += sale.paidAmount;
      creditSales += sale.totalAmount - sale.paidAmount;
    });

    return {
      totalSales,
      cashSales,
      creditSales,
      count: periodSales.length,
    };
  }, [periodSales]);

  // 4. Search filter for list
  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name || 'Walk-in Customer';

  const filteredList = useMemo(() => {
    return periodSales.filter((sale) => {
      const custName = getCustomerName(sale.customerId).toLowerCase();
      const idStr = sale.id.toLowerCase();
      const notesStr = (sale.notes || '').toLowerCase();
      const query = searchTerm.toLowerCase();

      return (
        custName.includes(query) ||
        idStr.includes(query) ||
        notesStr.includes(query)
      );
    });
  }, [periodSales, searchTerm, customers]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Sales Report</h2>
          <p className="text-sm text-zinc-500">Live reconciliation of cash and credit sales performance.</p>
        </div>
      </header>

      {/* Date & Period Selection Grid */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Select Period</label>
          <div className="flex flex-wrap gap-2">
            {(['today', 'yesterday', 'custom-date', 'custom-range', 'month'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-all ${
                  filterType === type
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {type.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Input Sub-sections */}
        {filterType === 'custom-date' && (
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Pick Date</label>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        )}

        {filterType === 'custom-range' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-md">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">From Date</label>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">To Date</label>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          </div>
        )}

        {filterType === 'month' && (
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-zinc-500 mb-1">Pick Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        )}
      </div>

      {/* Metrics Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TOTAL SALES */}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Total Sales</p>
          <p className="mt-3 text-3xl font-bold text-zinc-950">
            {formatCurrency(metrics.totalSales, currentOrg?.settings.currency)}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Reconciled total value across {metrics.count} sales.
          </p>
        </div>

        {/* CASH SALES */}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600">
            <Coins className="w-6 h-6" />
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Cash Sales</p>
          <p className="mt-3 text-3xl font-bold text-green-600">
            {formatCurrency(metrics.cashSales, currentOrg?.settings.currency)}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Immediate payment collected successfully.
          </p>
        </div>

        {/* CREDIT SALES */}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
            <CreditCard className="w-6 h-6" />
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Credit Sales</p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {formatCurrency(metrics.creditSales, currentOrg?.settings.currency)}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Outstanding due amounts added to customer balances.
          </p>
        </div>
      </div>

      {/* Detailed Sales List Section */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-zinc-100 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Period Transactions</h3>
            <p className="text-sm text-zinc-500">Audit trail of completed sales during the selected timeframe.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by ID, customer..."
              className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-zinc-50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No transactions match the search filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-mono uppercase tracking-wider text-zinc-400">
                  <th className="px-6 py-4">Invoice / Date</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4 text-right">Total Amount</th>
                  <th className="px-6 py-4 text-right">Cash Received</th>
                  <th className="px-6 py-4 text-right">Credit (Due)</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-sm">
                {filteredList.map((sale) => {
                  const outstanding = sale.totalAmount - sale.paidAmount;
                  return (
                    <tr key={sale.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-mono font-bold text-zinc-900">#{sale.id.slice(-6).toUpperCase()}</p>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                          <Clock className="w-3 h-3" />
                          <span>{format(sale.timestamp, 'dd MMM yyyy, hh:mm a')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900">{getCustomerName(sale.customerId)}</p>
                            {sale.notes && <p className="text-xs text-zinc-400 truncate max-w-xs">{sale.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-zinc-900">
                        {formatCurrency(sale.totalAmount, currentOrg?.settings.currency)}
                      </td>
                      <td className="px-6 py-4 text-right text-green-600 font-semibold">
                        {formatCurrency(sale.paidAmount, currentOrg?.settings.currency)}
                      </td>
                      <td className={`px-6 py-4 text-right font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-zinc-400'}`}>
                        {formatCurrency(outstanding, currentOrg?.settings.currency)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          outstanding === 0
                            ? 'bg-green-100 text-green-700'
                            : sale.paidAmount > 0
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {outstanding === 0 ? 'Paid' : sale.paidAmount > 0 ? 'Partial' : 'Credit Due'}
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
    </div>
  );
};
