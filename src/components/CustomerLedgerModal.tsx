import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Organization, PaymentRecord, Sale, CustomerReturn } from '../types';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
  startOfDay,
  endOfDay,
} from 'date-fns';
import {
  BookOpen,
  Download,
  Eye,
  X,
  Printer,
  Calendar,
  Wallet,
  ArrowRight,
  Sparkles,
  Receipt,
  Building2,
  Phone,
  Mail,
  MapPin,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../utils/currency';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import {
  downloadCustomerLedgerPdf,
  createCustomerLedgerPdfBlob,
  CustomerLedgerPdfData,
  CustomerLedgerTransaction,
  printPdfBlob,
  toAsciiCurrency,
  toCompactCurrency,
  toCleanNumber,
} from '../utils/reporting';
import { PremiumDateRangePicker } from './PremiumDateRangePicker';

type CustomerLedgerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  currentOrg: Organization;
  sales: Sale[];
  paymentRecords: PaymentRecord[];
  itemsMap?: Map<string, string>; // item id -> item name
};

function labelForPaymentRecord(record: PaymentRecord) {
  switch (record.direction) {
    case 'payment_received':
      return 'Due Collected';
    case 'balance_added':
      return 'Manual Adjustment';
    case 'write_off':
      return 'Balance Reduction';
    case 'sale_due_added':
      return 'Sale Created';
    case 'sale_due_updated':
      return 'Sale Updated';
    case 'return_refund':
      return 'Return / Refund';
    default:
      return 'Balance Change';
  }
}

function formatReference(referenceId?: string) {
  if (!referenceId) return '-';
  return `#${referenceId.slice(-6).toUpperCase()}`;
}

function calculateCustomerLedgerData({
  customer,
  currentOrg,
  sales,
  paymentRecords,
  itemsMap,
  startDate,
  endDate,
}: {
  customer: Customer;
  currentOrg: Organization;
  sales: Sale[];
  paymentRecords: PaymentRecord[];
  itemsMap: Map<string, string>;
  startDate: string;
  endDate: string;
}) {
  if (!startDate || !endDate) return null;

  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  type LedgerTx = {
    date: number;
    invoiceNo: string;
    totalAmount: number;
    paidAmount: number;
    netChange: number;
    type: string;
    notes: string;
    itemsFormatted?: string[];
  };

  const normTxs: LedgerTx[] = [];

  // Process Sales for this customer
  const customerSales = sales.filter((s) => s.customerId === customer.id);
  customerSales.forEach((s) => {
    const invNo = s.isGstBill && s.gstBillNumber ? s.gstBillNumber : `#${s.id.slice(-8).toUpperCase()}`;
    const formatRate = (val: number) => (val % 1 === 0 ? val.toLocaleString('en-IN') : val.toFixed(2));
    const itemsFormatted: string[] = (s.items || []).map((itemLine) => {
      const rawName = itemsMap.get(itemLine.itemId) || 'Item';
      const itemName = rawName.replace(/\\/g, '').trim();
      const qty = itemLine.quantity;
      const rate = itemLine.unitPrice;
      const total = itemLine.subtotal || qty * rate;
      return `${itemName} (${qty} x ${formatRate(rate)} = ${formatRate(total)})`;
    });

    normTxs.push({
      date: s.timestamp,
      invoiceNo: invNo,
      itemsFormatted: itemsFormatted.length > 0 ? itemsFormatted : undefined,
      totalAmount: s.totalAmount,
      paidAmount: s.paidAmount,
      netChange: s.totalAmount - s.paidAmount,
      type: 'Sale Invoice',
      notes: s.notes || 'Product sale',
    });
  });

  // Process Payment Records
  paymentRecords.forEach((p) => {
    if (p.direction === 'sale_due_added' || p.direction === 'sale_due_updated') return;

    const isPaymentOrCredit =
      p.direction === 'payment_received' ||
      p.direction === 'write_off' ||
      p.direction === 'return_refund';
    const invNo = p.referenceId ? formatReference(p.referenceId) : `#PAY-${p.id.slice(-6).toUpperCase()}`;

    normTxs.push({
      date: p.timestamp,
      invoiceNo: invNo,
      itemsFormatted: [p.notes || labelForPaymentRecord(p)],
      totalAmount: isPaymentOrCredit ? 0 : p.amount,
      paidAmount: isPaymentOrCredit ? p.amount : 0,
      netChange: isPaymentOrCredit ? -p.amount : p.amount,
      type: labelForPaymentRecord(p),
      notes: p.notes || '-',
    });
  });

  normTxs.sort((a, b) => a.date - b.date);

  // Opening balance calculation prior to start
  let runningBal = 0;
  normTxs.forEach((tx) => {
    if (tx.date < start.getTime()) {
      runningBal += tx.netChange;
    }
  });

  const openingBalance = Math.max(0, runningBal);

  // Period transactions
  const periodTxs = normTxs.filter((tx) => tx.date >= start.getTime() && tx.date <= end.getTime());

  let currentPeriodBal = openingBalance;
  let periodTotalBilled = 0;
  let periodTotalPaid = 0;

  const ledgerRows: CustomerLedgerTransaction[] = periodTxs.map((tx) => {
    currentPeriodBal += tx.netChange;
    periodTotalBilled += tx.totalAmount;
    periodTotalPaid += tx.paidAmount;

    const dueVal = Math.max(0, tx.totalAmount - tx.paidAmount);

    return {
      date: tx.date,
      invoiceNo: tx.invoiceNo,
      itemsFormatted: tx.itemsFormatted,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      dueAmount: tx.totalAmount > 0 ? dueVal : 0,
      balance: Math.max(0, currentPeriodBal),
      type: tx.type,
      notes: tx.notes,
    };
  });

  const periodLabel = `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`;

  const pdfData: CustomerLedgerPdfData = {
    organizationName: currentOrg.settings?.storeName || currentOrg.name || 'Stockii Store',
    organizationSubtitle: currentOrg.settings?.tagline || 'smart inventory management',
    sellerAddress: currentOrg.settings?.address || '',
    sellerPhone: currentOrg.settings?.phone || '',
    sellerEmail: currentOrg.settings?.email || '',
    sellerGstin: currentOrg.settings?.gstin || '',
    currencyCode: currentOrg.settings?.currency || 'INR',
    customerName: customer.name,
    customerShopName: customer.shopName,
    customerAddress: customer.address,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    customerGstin: customer.gstin,
    periodLabel,
    totalBilled: periodTotalBilled,
    totalPaid: periodTotalPaid,
    balanceDue: Math.max(0, currentPeriodBal),
    openingBalance: openingBalance > 0 ? openingBalance : undefined,
    transactions: ledgerRows,
  };

  return {
    pdfData,
    openingBalance,
    periodTotalBilled,
    periodTotalPaid,
    finalBalance: Math.max(0, currentPeriodBal),
    ledgerRows,
    start,
    end,
    periodLabel,
  };
}

export function CustomerLedgerModal({
  isOpen,
  onClose,
  customer,
  currentOrg,
  sales,
  paymentRecords,
  itemsMap = new Map(),
}: CustomerLedgerModalProps) {
  const [customerData, setCustomerData] = useState<Customer>(customer);
  const [salesData, setSalesData] = useState<Sale[]>(sales);
  const [paymentRecordsData, setPaymentRecordsData] = useState<PaymentRecord[]>(paymentRecords);
  const [currentItemsMap, setCurrentItemsMap] = useState<Map<string, string>>(itemsMap);
  const [actionLoading, setActionLoading] = useState<'preview' | 'download' | 'print' | null>(null);

  const [rangeType, setRangeType] = useState<'this-month' | 'last-month' | 'custom'>('this-month');
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // View state: 'selector' (range selection & summary) vs 'preview' (full statement preview)
  const [viewMode, setViewMode] = useState<'selector' | 'preview'>('selector');

  const fetchFreshSnapshot = async () => {
    if (!currentOrg?.id || !customer?.id) {
      return {
        customer: customerData,
        sales: salesData,
        paymentRecords: paymentRecordsData,
        itemsMap: currentItemsMap,
      };
    }

    const [freshCustomer, freshSales, freshPayments, freshItems] = await Promise.all([
      saleService.getCustomer(currentOrg.id, customer.id),
      saleService.getCustomerSales(currentOrg.id, customer.id),
      saleService.getCustomerPaymentRecords(currentOrg.id, customer.id),
      inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
    ]);

    const updatedCustomer = freshCustomer || customerData;
    const updatedSales = freshSales || salesData;
    const updatedPayments = freshPayments || paymentRecordsData;
    const updatedItemsMap = new Map(freshItems.map((i) => [i.id, i.name]));

    setCustomerData(updatedCustomer);
    setSalesData(updatedSales);
    setPaymentRecordsData(updatedPayments);
    setCurrentItemsMap(updatedItemsMap);

    return {
      customer: updatedCustomer,
      sales: updatedSales,
      paymentRecords: updatedPayments,
      itemsMap: updatedItemsMap,
    };
  };

  useEffect(() => {
    if (isOpen) {
      setCustomerData(customer);
      setSalesData(sales);
      setPaymentRecordsData(paymentRecords);
      setCurrentItemsMap(itemsMap);
      // Fetch latest fresh snapshot immediately on open so initial view has real-time data
      fetchFreshSnapshot().catch((err) => console.error('Initial background sync error:', err));
    }
  }, [isOpen, customer.id]);

  const handleRangeTypeChange = (type: 'this-month' | 'last-month' | 'custom') => {
    setRangeType(type);
    const now = new Date();
    if (type === 'this-month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
      setIsCalendarOpen(false);
    } else if (type === 'last-month') {
      const lastMonth = subMonths(now, 1);
      setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
      setIsCalendarOpen(false);
    } else if (type === 'custom') {
      setIsCalendarOpen(true);
    }
  };

  const handleCustomRangeChange = (s: string, e: string) => {
    setStartDate(s);
    setEndDate(e);
    setRangeType('custom');
  };

  // Compute normalized transactions and ledger statement data from active state
  const ledgerData = useMemo(() => {
    return calculateCustomerLedgerData({
      customer: customerData,
      currentOrg,
      sales: salesData,
      paymentRecords: paymentRecordsData,
      itemsMap: currentItemsMap,
      startDate,
      endDate,
    });
  }, [startDate, endDate, salesData, paymentRecordsData, customerData, currentOrg, currentItemsMap]);

  const handlePreviewStatement = async () => {
    if (actionLoading) return;
    setActionLoading('preview');
    try {
      const fresh = await fetchFreshSnapshot();
      // Ensure recalculation is performed on the fly with the fresh snapshot
      calculateCustomerLedgerData({
        customer: fresh.customer,
        currentOrg,
        sales: fresh.sales,
        paymentRecords: fresh.paymentRecords,
        itemsMap: fresh.itemsMap,
        startDate,
        endDate,
      });
      setViewMode('preview');
    } catch (err) {
      console.error('Error updating ledger calculations for preview:', err);
      setViewMode('preview');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (actionLoading) return;
    setActionLoading('download');
    try {
      const fresh = await fetchFreshSnapshot();
      const freshCalculations = calculateCustomerLedgerData({
        customer: fresh.customer,
        currentOrg,
        sales: fresh.sales,
        paymentRecords: fresh.paymentRecords,
        itemsMap: fresh.itemsMap,
        startDate,
        endDate,
      });
      if (!freshCalculations) return;

      const filename = `customer-ledger-${fresh.customer.name.replace(/\s+/g, '-').toLowerCase()}-${format(
        freshCalculations.start,
        'yyyyMMdd'
      )}-${format(freshCalculations.end, 'yyyyMMdd')}.pdf`;

      // Brand new PDF built on the fly using the freshly calculated pdfData
      downloadCustomerLedgerPdf(filename, freshCalculations.pdfData);
    } catch (err) {
      console.error('Error downloading fresh customer ledger PDF:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPreview = async () => {
    if (actionLoading) return;
    setActionLoading('print');
    try {
      const fresh = await fetchFreshSnapshot();
      const freshCalculations = calculateCustomerLedgerData({
        customer: fresh.customer,
        currentOrg,
        sales: fresh.sales,
        paymentRecords: fresh.paymentRecords,
        itemsMap: fresh.itemsMap,
        startDate,
        endDate,
      });
      if (!freshCalculations) return;

      // Brand new PDF built on the fly
      const blob = createCustomerLedgerPdfBlob(freshCalculations.pdfData);
      printPdfBlob(blob, `customer-ledger-${fresh.customer.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } catch (err) {
      console.error('Error printing fresh customer ledger PDF:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className={`relative flex flex-col w-[95%] mx-auto max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl transition-all ${
            viewMode === 'preview' ? 'max-w-5xl' : 'max-w-lg'
          }`}
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between border-b border-zinc-100 bg-gradient-to-r from-purple-50/50 via-white to-purple-50/20 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/20">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-zinc-900">
                  Customer Ledger
                </h3>
                <p className="text-xs text-zinc-500">
                  {customerData.name} {customerData.shopName ? `(${customerData.shopName})` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'preview' && (
                <button
                  type="button"
                  onClick={() => setViewMode('selector')}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Edit Filter
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-800 hover:bg-slate-100 hover:text-slate-950 transition-colors"
                title="Close"
              >
                <X className="h-5 w-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* View Selector Mode: Range Filter, Quick Summary Cards & Interactive Table Preview */}
            {viewMode === 'selector' && (
              <>
                {/* Range Selection Bar */}
                <div className="space-y-2.5 bg-zinc-50/70 p-3 rounded-xl border border-zinc-100">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Date Range Filter
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRangeTypeChange('this-month')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                        rangeType === 'this-month'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRangeTypeChange('last-month')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                        rangeType === 'last-month'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (rangeType === 'custom') {
                          setIsCalendarOpen((prev) => !prev);
                        } else {
                          handleRangeTypeChange('custom');
                        }
                      }}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                        rangeType === 'custom'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {/* Integrated Range Calendar Popup for "Custom" */}
                  {rangeType === 'custom' && (
                    <div className="pt-1 relative">
                      <PremiumDateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={handleCustomRangeChange}
                        isOpen={isCalendarOpen}
                        onOpenChange={setIsCalendarOpen}
                        placeholder="Pick Custom Date Range"
                        align="right"
                      />
                    </div>
                  )}
                </div>

                {/* Quick Summary Cards */}
                {ledgerData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Opening Bal</p>
                      <p className="mt-0.5 text-sm font-bold text-zinc-800">
                        {formatCurrency(ledgerData.openingBalance, currentOrg.settings.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Total Billed</p>
                      <p className="mt-0.5 text-sm font-bold text-orange-600">
                        {formatCurrency(ledgerData.periodTotalBilled, currentOrg.settings.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-green-200 bg-green-50/50 p-2.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Total Paid</p>
                      <p className="mt-0.5 text-sm font-bold text-green-600">
                        {formatCurrency(ledgerData.periodTotalPaid, currentOrg.settings.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-2.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">Balance Due</p>
                      <p className="mt-0.5 text-sm font-bold text-red-600">
                        {formatCurrency(ledgerData.finalBalance, currentOrg.settings.currency)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Interactive Table Preview */}
                {ledgerData && (
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 bg-zinc-50">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-orange-500" />
                        <span className="text-xs font-bold text-zinc-900">Period Transactions Preview</span>
                      </div>
                      <span className="text-xs text-zinc-500 font-mono">
                        {ledgerData.ledgerRows.length} entry/entries
                      </span>
                    </div>

                    {ledgerData.ledgerRows.length === 0 ? (
                      <div className="p-8 text-center text-xs text-zinc-400">
                        No sales or payment records found in this date range.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-zinc-100">
                        {ledgerData.ledgerRows.map((tx, idx) => (
                          <div key={idx} className="p-3.5 hover:bg-orange-50/30 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-zinc-900">{tx.invoiceNo}</span>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                    {tx.type}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {format(tx.date, 'dd MMM yyyy, hh:mm a')}
                                </p>
                                {tx.itemsFormatted && (
                                  <div className="mt-1.5 space-y-0.5">
                                    {tx.itemsFormatted.map((itemStr, i) => (
                                      <p key={i} className="text-xs text-zinc-600 font-medium">
                                        • {itemStr}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                <p className="text-xs font-bold text-zinc-900">
                                  Billed: {formatCurrency(tx.totalAmount, currentOrg.settings.currency)}
                                </p>
                                <p className="text-xs font-semibold text-green-600 mt-0.5">
                                  Paid: {formatCurrency(tx.paidAmount, currentOrg.settings.currency)}
                                </p>
                                <p className="text-xs font-bold text-orange-600 mt-1">
                                  Bal: {formatCurrency(tx.balance, currentOrg.settings.currency)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* View Mode: Live Printable Statement Document Preview */}
            {viewMode === 'preview' && ledgerData && (
              /* Exact PDF Template Paper Sheet Preview */
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 shadow-sm space-y-5 font-sans">
                    {/* Header: Store Name, Tagline & Period Left */}
                    <div className="pb-4 border-b border-zinc-100">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                        {ledgerData.pdfData.organizationName}
                      </h2>
                      {ledgerData.pdfData.organizationSubtitle && (
                        <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                          {ledgerData.pdfData.organizationSubtitle}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 font-medium mt-1">
                        Period: {ledgerData.pdfData.periodLabel}
                      </p>
                    </div>

                    {/* Customer details card with orange accent bar */}
                    <div className="relative rounded-xl bg-[#fafafa] border border-[#e2e8f0] p-3.5 sm:p-4 pl-4.5 overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ea580c]" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        CUSTOMER
                      </p>
                      <h4 className="text-base sm:text-lg font-bold text-zinc-900 mt-0.5">
                        {ledgerData.pdfData.customerName}
                      </h4>
                      {(() => {
                        const detailsList: string[] = [];
                        if (ledgerData.pdfData.customerShopName) detailsList.push(`Shop: ${ledgerData.pdfData.customerShopName}`);
                        if (ledgerData.pdfData.customerPhone) detailsList.push(`Phone: ${ledgerData.pdfData.customerPhone}`);
                        if (ledgerData.pdfData.customerGstin) detailsList.push(`GSTIN: ${ledgerData.pdfData.customerGstin}`);
                        if (ledgerData.pdfData.customerAddress) detailsList.push(`Addr: ${ledgerData.pdfData.customerAddress.replace(/\n/g, ', ')}`);
                        const detailsStr = detailsList.join('   |   ');
                        if (!detailsStr) return null;
                        return <p className="text-xs text-zinc-500 mt-1">{detailsStr}</p>;
                      })()}
                    </div>

                    {/* Full Ledger Table (Orange table header) */}
                    <div className="overflow-x-auto w-full rounded-xl border border-zinc-200">
                      <table className="w-full min-w-[620px] text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#ea580c] text-white font-bold uppercase text-[10px] sm:text-[11px] tracking-wider">
                            <th className="py-2.5 px-3 text-left w-[4%]">#</th>
                            <th className="py-2.5 px-3 text-left w-[16%] whitespace-nowrap">DATE</th>
                            <th className="py-2.5 px-3 text-left w-[15%] whitespace-nowrap">INVOICE NO.</th>
                            <th className="py-2.5 px-3 text-left w-[33%]">ITEMS</th>
                            <th className="py-2.5 px-3 text-right w-[11%] whitespace-nowrap">AMOUNT (Rs.)</th>
                            <th className="py-2.5 px-3 text-right w-[10%] whitespace-nowrap">PAID (Rs.)</th>
                            <th className="py-2.5 px-3 text-right w-[11%] whitespace-nowrap">DUE (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 bg-white">
                          {/* Opening Balance Row if applicable */}
                          {ledgerData.pdfData.openingBalance && ledgerData.pdfData.openingBalance !== 0 ? (
                            <tr className="bg-[#fafafa]">
                              <td className="py-2.5 px-3 text-zinc-400 font-medium">-</td>
                              <td className="py-2.5 px-3 text-zinc-600 font-medium whitespace-nowrap">
                                {ledgerData.pdfData.periodLabel.split(' - ')[0] || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-400 font-medium">-</td>
                              <td className="py-2.5 px-3 font-bold text-zinc-800">OPENING BALANCE</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-zinc-900 whitespace-nowrap">
                                {toCleanNumber(ledgerData.pdfData.openingBalance)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-zinc-400 font-medium">-</td>
                              <td className="py-2.5 px-3 text-right font-bold text-[#dc2626] whitespace-nowrap">
                                {toCleanNumber(ledgerData.pdfData.openingBalance)}
                              </td>
                            </tr>
                          ) : null}

                          {ledgerData.pdfData.transactions.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-zinc-400 font-medium">
                                No transactions recorded in this date period.
                              </td>
                            </tr>
                          ) : (
                            ledgerData.pdfData.transactions.map((tx, idx) => {
                              const dueVal = tx.dueAmount !== undefined ? tx.dueAmount : Math.max(0, tx.totalAmount - tx.paidAmount);
                              const dueStr = toCleanNumber(dueVal);

                              return (
                                <tr key={idx} className="hover:bg-zinc-50/80 transition-colors">
                                  <td className="py-2.5 px-3 text-zinc-400 font-medium">{idx + 1}</td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="font-semibold text-zinc-900">
                                      {format(tx.date, 'dd MMM yyyy')}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-normal">
                                      {format(tx.date, 'HH:mm')}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 font-bold text-zinc-900 whitespace-nowrap">{tx.invoiceNo}</td>
                                  <td className="py-2.5 px-3">
                                    {tx.itemsFormatted && tx.itemsFormatted.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {tx.itemsFormatted.map((it, i) => (
                                          <div key={i} className="text-zinc-700 text-xs font-normal">
                                            • {it}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-zinc-700 text-xs font-normal">
                                        {tx.notes && tx.notes !== '-' ? tx.notes : (tx.type || 'Transaction')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-zinc-900 whitespace-nowrap">
                                    {tx.totalAmount > 0 ? toCleanNumber(tx.totalAmount) : '-'}
                                  </td>
                                  <td className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${tx.paidAmount > 0 ? 'text-[#16a34a]' : 'text-zinc-400'}`}>
                                    {tx.paidAmount > 0 ? toCleanNumber(tx.paidAmount) : '-'}
                                  </td>
                                  <td className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${dueVal > 0 ? 'text-[#dc2626]' : 'text-zinc-400'}`}>
                                    {dueStr}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Summary: TOTAL BILLED, TOTAL PAID, and highlighted FINAL DUE AMOUNT */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                      <div className="bg-[#fafafa] border border-[#e2e8f0] rounded-xl p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          TOTAL BILLED
                        </p>
                        <p className="text-base font-bold text-zinc-900 mt-1">
                          {toAsciiCurrency(ledgerData.pdfData.totalBilled, ledgerData.pdfData.currencyCode)}
                        </p>
                      </div>

                      <div className="bg-[#fafafa] border border-[#e2e8f0] rounded-xl p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          TOTAL PAID
                        </p>
                        <p className="text-base font-bold text-[#16a34a] mt-1">
                          {toAsciiCurrency(ledgerData.pdfData.totalPaid, ledgerData.pdfData.currencyCode)}
                        </p>
                      </div>

                      <div className="bg-[#fff5f5] border border-[#fca5a5] rounded-xl p-3.5 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#dc2626]">
                          FINAL DUE AMOUNT
                        </p>
                        <p className="text-lg font-bold text-[#dc2626] mt-1">
                          {toAsciiCurrency(ledgerData.pdfData.balanceDue, ledgerData.pdfData.currencyCode)}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Footer line */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-400 border-t border-zinc-200 pt-3">
                      <span>Thank you for your business.</span>
                      <span>
                        Generated on {format(new Date(), 'dd MMM yyyy, HH:mm')} - {ledgerData.pdfData.organizationName || 'Stockii'}
                      </span>
                    </div>
                  </div>
                )}
          </div>

          {/* Action Footer */}
          <div className="flex-shrink-0 flex items-center justify-end gap-2 sm:gap-2.5 border-t border-zinc-100 bg-zinc-50/80 p-3.5 sm:p-5">
            {viewMode === 'selector' ? (
              <button
                type="button"
                onClick={handlePreviewStatement}
                disabled={actionLoading !== null}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-orange-200 bg-orange-50 text-sm font-bold text-orange-700 hover:bg-orange-100 transition-all disabled:opacity-50"
              >
                {actionLoading === 'preview' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                    <span>Updating calculations...</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    <span>Preview Statement</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrintPreview}
                disabled={actionLoading !== null || !ledgerData}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-700 hover:bg-zinc-100 transition-all disabled:opacity-50"
              >
                {actionLoading === 'print' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
                    <span>Updating calculations...</span>
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" />
                    <span>Print Preview</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={actionLoading !== null || !ledgerData}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-sm font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all disabled:opacity-50"
            >
              {actionLoading === 'download' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Updating calculations...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
