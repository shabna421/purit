import React, { useEffect, useState } from 'react';
import { useTenancy } from '../contexts';
import { inventoryService } from '../services/inventoryService';
import { saleService } from '../services/saleService';
import { purchaseService } from '../services/purchaseService';
import { Item, InventoryTransaction, Customer, Supplier } from '../types';
import {
  FileText,
  Download,
  Filter,
  Calendar as CalendarIcon,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Package,
  Users,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import { TableDisplayToggle } from '../components/TableDisplayToggle';
import { useOrgTableDisplayMode } from '../hooks/useOrgTableDisplayMode';
import { getItemDisplayName } from '../utils/items';
import { downloadCsv, buildInventoryPdfBlob, printPdfBlob } from '../utils/reporting';

type ReportType = 'sales' | 'purchases' | 'stock' | 'receivables' | 'payables';

export const ReportsPage: React.FC = () => {
  const { currentOrg } = useTenancy();
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  });
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { tableDisplayMode, setTableDisplayMode, savingTableDisplayMode } = useOrgTableDisplayMode();

  const handleExportReport = () => {
    if (!currentOrg) return;
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    if (reportType === 'stock') {
      const activeItems = items.filter((item) => !item.isDeleted);
      const sorted = [...activeItems].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      const headers = ['Item Name', 'SKU', 'Current Stock', 'Unit Cost (Base Price)', 'Selling Price', 'Total Stock Value'];
      const rows = sorted.map((item) => [
        item.name,
        item.sku || '',
        item.currentStock,
        item.basePrice,
        item.sellingPrice,
        (item.currentStock * item.basePrice).toFixed(2),
      ]);
      downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-stock-report-${dateStr}.csv`, headers, rows);
    } else if (reportType === 'sales') {
      const headers = ['Date', 'Item Name', 'Quantity', 'Unit Sell Price', 'Total Amount'];
      const rows = filteredTransactions.map((t) => {
        const item = items.find((e) => e.id === t.itemId);
        return [
          format(t.timestamp, 'yyyy-MM-dd HH:mm'),
          getItemDisplayName(item),
          t.quantity,
          t.unitSellPrice || 0,
          ((t.unitSellPrice || 0) * t.quantity).toFixed(2),
        ];
      });
      downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-sales-report-${dateStr}.csv`, headers, rows);
    } else if (reportType === 'purchases') {
      const headers = ['Date', 'Item Name', 'Quantity', 'Unit Cost', 'Total Amount'];
      const rows = filteredTransactions.map((t) => {
        const item = items.find((e) => e.id === t.itemId);
        return [
          format(t.timestamp, 'yyyy-MM-dd HH:mm'),
          getItemDisplayName(item),
          t.quantity,
          t.unitCost || 0,
          ((t.unitCost || 0) * t.quantity).toFixed(2),
        ];
      });
      downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-purchases-report-${dateStr}.csv`, headers, rows);
    } else if (reportType === 'receivables') {
      const receivables = customers.filter((c) => c.balance > 0);
      const headers = ['Customer Name', 'Shop Name', 'Phone', 'Outstanding Balance'];
      const rows = receivables.map((c) => [c.name, c.shopName || '', c.phone || '', c.balance.toFixed(2)]);
      downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-receivables-${dateStr}.csv`, headers, rows);
    } else if (reportType === 'payables') {
      const payables = suppliers.filter((s) => s.balance > 0);
      const headers = ['Supplier Name', 'Phone', 'Email', 'Outstanding Balance'];
      const rows = payables.map((s) => [s.name, s.phone || '', s.email || '', s.balance.toFixed(2)]);
      downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-payables-${dateStr}.csv`, headers, rows);
    }
  };

  const handlePrintStockPdf = () => {
    if (!currentOrg) return;
    const activeItems = items.filter((item) => !item.isDeleted);
    const blob = buildInventoryPdfBlob(currentOrg.name, activeItems);
    printPdfBlob(blob, `inventory-status-report.pdf`);
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!currentOrg) return;
      setLoading(true);
      try {
        const [allItems, allTrans, allCusts, allSupps] = await Promise.all([
          inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
          inventoryService.getTransactions(currentOrg.id),
          saleService.getCustomers(currentOrg.id),
          purchaseService.getSuppliers(currentOrg.id),
        ]);
        setItems(allItems);
        setTransactions(allTrans);
        setCustomers(allCusts);
        setSuppliers(allSupps);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentOrg]);

  const filteredTransactions = transactions.filter((t) => {
    const isTypeMatch =
      (reportType === 'sales' && t.type === 'SALE_OUT') ||
      (reportType === 'purchases' && t.type === 'PURCHASE_IN');

    if (!isTypeMatch) return false;

    return isWithinInterval(t.timestamp, {
      start: startOfDay(dateRange.start),
      end: endOfDay(dateRange.end),
    });
  });

  const renderSalesReport = () => {
    const totalSales = filteredTransactions.reduce((sum, t) => sum + (t.unitSellPrice || 0) * t.quantity, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Total Sales" value={totalSales.toFixed(2)} icon={TrendingUp} color="blue" />
          <SummaryCard label="Sale Count" value={filteredTransactions.length.toString()} icon={FileText} color="orange" />
          <SummaryCard label="Avg. Order Value" value={(totalSales / (filteredTransactions.length || 1)).toFixed(2)} icon={Package} color="purple" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tableDisplayMode === 'table' ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Date</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Item</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Qty</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map((t) => {
                  const item = items.find((entry) => entry.id === t.itemId);
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-600">{format(t.timestamp, 'MMM dd, HH:mm')}</td>
                      <td className="p-4 text-sm font-medium text-gray-900">{getItemDisplayName(item)}</td>
                      <td className="p-4 text-sm text-gray-600 text-right">{t.quantity}</td>
                      <td className="p-4 text-sm font-bold text-gray-900 text-right">{((t.unitSellPrice || 0) * t.quantity).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((t) => {
                const item = items.find((entry) => entry.id === t.itemId);
                return (
                  <div key={t.id} className="p-4">
                    <p className="text-sm font-bold text-gray-900">{getItemDisplayName(item)}</p>
                    <p className="mt-1 text-xs text-gray-500">{format(t.timestamp, 'MMM dd, yyyy HH:mm')}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
                      <MetricMini label="Qty" value={String(t.quantity)} />
                      <MetricMini label="Amount" value={((t.unitSellPrice || 0) * t.quantity).toFixed(2)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPurchasesReport = () => {
    const totalPurchases = filteredTransactions.reduce((sum, t) => sum + (t.unitCost || 0) * t.quantity, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Total Purchases" value={totalPurchases.toFixed(2)} icon={ArrowDownLeft} color="blue" />
          <SummaryCard label="Receipt Count" value={filteredTransactions.length.toString()} icon={FileText} color="orange" />
          <SummaryCard label="Avg. Receipt Value" value={(totalPurchases / (filteredTransactions.length || 1)).toFixed(2)} icon={Package} color="purple" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tableDisplayMode === 'table' ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Date</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Item</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Qty</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map((t) => {
                  const item = items.find((entry) => entry.id === t.itemId);
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-600">{format(t.timestamp, 'MMM dd, HH:mm')}</td>
                      <td className="p-4 text-sm font-medium text-gray-900">{getItemDisplayName(item)}</td>
                      <td className="p-4 text-sm text-gray-600 text-right">{t.quantity}</td>
                      <td className="p-4 text-sm font-bold text-gray-900 text-right">{((t.unitCost || 0) * t.quantity).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((t) => {
                const item = items.find((entry) => entry.id === t.itemId);
                return (
                  <div key={t.id} className="p-4">
                    <p className="text-sm font-bold text-gray-900">{getItemDisplayName(item)}</p>
                    <p className="mt-1 text-xs text-gray-500">{format(t.timestamp, 'MMM dd, yyyy HH:mm')}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
                      <MetricMini label="Qty" value={String(t.quantity)} />
                      <MetricMini label="Amount" value={((t.unitCost || 0) * t.quantity).toFixed(2)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStockReport = () => {
    const activeItems = items.filter((item) => !item.isDeleted);
    const totalStockValue = activeItems.reduce((sum, item) => sum + item.currentStock * item.basePrice, 0);
    const filteredItems = activeItems.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Stock Value (Cost)" value={totalStockValue.toFixed(2)} icon={Package} color="blue" />
          <SummaryCard label="Total Items" value={activeItems.length.toString()} icon={FileText} color="orange" />
          <SummaryCard label="Low Stock Items" value={activeItems.filter((item) => item.currentStock <= item.reorderThreshold).length.toString()} icon={Filter} color="red" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          {tableDisplayMode === 'table' ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Item Name</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Current Stock</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Unit Cost</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                    </td>
                    <td className={`p-4 text-sm text-right font-bold ${item.currentStock <= item.reorderThreshold ? 'text-red-600' : 'text-gray-900'}`}>
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="p-4 text-sm text-gray-600 text-right">{item.basePrice.toFixed(2)}</td>
                    <td className="p-4 text-sm font-bold text-gray-900 text-right">{(item.currentStock * item.basePrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <div key={item.id} className="p-4">
                  <p className="text-sm font-bold text-gray-900">{item.name}</p>
                  <p className="text-xs font-mono text-gray-500">{item.sku}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
                    <MetricMini
                      label="Current Stock"
                      value={`${item.currentStock} ${item.unit}`}
                      valueClassName={item.currentStock <= item.reorderThreshold ? 'text-red-600' : 'text-gray-900'}
                    />
                    <MetricMini label="Unit Cost" value={item.basePrice.toFixed(2)} />
                    <div className="col-span-2">
                      <MetricMini label="Total Value" value={(item.currentStock * item.basePrice).toFixed(2)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReceivablesReport = () => {
    const receivables = customers.filter((customer) => customer.balance > 0);
    const totalReceivables = receivables.reduce((sum, customer) => sum + customer.balance, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard label="Total Receivables" value={totalReceivables.toFixed(2)} icon={ArrowDownLeft} color="orange" />
          <SummaryCard label="Active Customers" value={receivables.length.toString()} icon={Users} color="blue" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tableDisplayMode === 'table' ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Customer Name</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Shop Name</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receivables.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-900">{customer.name}</td>
                    <td className="p-4 text-sm text-gray-600">{customer.shopName || 'N/A'}</td>
                    <td className="p-4 text-sm font-bold text-red-600 text-right">{customer.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {receivables.map((customer) => (
                <div key={customer.id} className="p-4">
                  <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                  <p className="text-xs text-gray-500">{customer.shopName || 'N/A'}</p>
                  <div className="mt-3 rounded-xl bg-gray-50 p-3">
                    <MetricMini label="Outstanding Balance" value={customer.balance.toFixed(2)} valueClassName="text-red-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPayablesReport = () => {
    const payables = suppliers.filter((supplier) => supplier.balance > 0);
    const totalPayables = payables.reduce((sum, supplier) => sum + supplier.balance, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard label="Total Payables" value={totalPayables.toFixed(2)} icon={ArrowUpRight} color="red" />
          <SummaryCard label="Active Suppliers" value={payables.length.toString()} icon={Users} color="blue" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {tableDisplayMode === 'table' ? (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Supplier</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400">Contact</th>
                  <th className="p-4 text-xs font-mono uppercase tracking-widest text-gray-400 text-right">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payables.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm font-medium text-gray-900">{supplier.name}</td>
                    <td className="p-4 text-sm text-gray-600">{supplier.phone || supplier.email || 'N/A'}</td>
                    <td className="p-4 text-sm font-bold text-red-600 text-right">{supplier.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="divide-y divide-gray-100">
              {payables.map((supplier) => (
                <div key={supplier.id} className="p-4">
                  <p className="text-sm font-bold text-gray-900">{supplier.name}</p>
                  <p className="text-xs text-gray-500">{supplier.phone || supplier.email || 'N/A'}</p>
                  <div className="mt-3 rounded-xl bg-gray-50 p-3">
                    <MetricMini label="Outstanding Balance" value={supplier.balance.toFixed(2)} valueClassName="text-red-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Reports</h2>
          <p className="text-zinc-500 font-serif italic">Analyze your business performance and financial health.</p>
        </div>
        <div className="flex gap-2">
          {reportType === 'stock' && (
            <button
              onClick={handlePrintStockPdf}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              Print PDF
            </button>
          )}
          <button
            onClick={handleExportReport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['sales', 'purchases', 'stock', 'receivables', 'payables'] as ReportType[]).map((type) => (
              <button
                key={type}
                onClick={() => setReportType(type)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  reportType === type
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-100'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="capitalize">{type}</span>
              </button>
            ))}
          </div>
          <TableDisplayToggle
            value={tableDisplayMode}
            onChange={setTableDisplayMode}
            disabled={savingTableDisplayMode}
          />
        </div>

        {['sales', 'purchases'].includes(reportType) && (
          <div className="flex items-center gap-4 pt-4 border-t border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CalendarIcon className="w-4 h-4" />
              <span>Date Range:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={format(dateRange.start, 'yyyy-MM-dd')}
                onChange={(e) => setDateRange({ ...dateRange, start: new Date(e.target.value) })}
                className="p-1 border rounded text-xs"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={format(dateRange.end, 'yyyy-MM-dd')}
                onChange={(e) => setDateRange({ ...dateRange, end: new Date(e.target.value) })}
                className="p-1 border rounded text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {reportType === 'sales' && renderSalesReport()}
          {reportType === 'purchases' && renderPurchasesReport()}
          {reportType === 'stock' && renderStockReport()}
          {reportType === 'receivables' && renderReceivablesReport()}
          {reportType === 'payables' && renderPayablesReport()}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon: Icon, color }: any) => {
  const colors: any = {
    blue: 'text-blue-600 bg-blue-50',
    orange: 'text-orange-600 bg-orange-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1">{label}</p>
          <span className="text-2xl font-bold text-gray-900">{value}</span>
        </div>
      </div>
    </div>
  );
};

const MetricMini = ({
  label,
  value,
  valueClassName = 'text-gray-900',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) => (
  <div>
    <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">{label}</p>
    <p className={`mt-1 text-sm font-bold ${valueClassName}`}>{value}</p>
  </div>
);
