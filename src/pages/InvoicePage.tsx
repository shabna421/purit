import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenancy } from '../contexts';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Sale, Item, Customer, InventoryLocation, PaymentRecord } from '../types';
import { Printer, ArrowLeft, Download, Loader2, Package, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { getItemDisplayName, getItemSkuLabel } from '../utils/items';
import { createInvoicePdfBlob, downloadInvoicePdf, printPdfBlob } from '../utils/reporting';

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function numberToWords(num: number): string {
  if (num === 0) return 'Rupees Zero Only.';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const formatTens = (n: number) => {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
  };
  
  const formatHundreds = (n: number) => {
    if (n === 0) return '';
    let str = '';
    if (n >= 100) {
      str += a[Math.floor(n / 100)] + ' Hundred';
      n %= 100;
      if (n > 0) str += ' ';
    }
    if (n > 0) {
      str += formatTens(n);
    }
    return str;
  };

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  const convertPart = (val: number): string => {
    let str = '';
    if (val >= 10000000) {
      str += formatHundreds(Math.floor(val / 10000000)) + ' Crore ';
      val %= 10000000;
    }
    if (val >= 100000) {
      str += formatHundreds(Math.floor(val / 100000)) + ' Lakh ';
      val %= 100000;
    }
    if (val >= 1000) {
      str += formatHundreds(Math.floor(val / 1000)) + ' Thousand ';
      val %= 1000;
    }
    str += formatHundreds(val);
    return str.trim();
  };

  let result = 'Rupees ' + convertPart(rupees);
  if (paise > 0) {
    result += ' and ' + convertPart(paise) + ' Paise';
  }
  return result + ' Only.';
}

export const InvoicePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useTenancy();
  const [sale, setSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [location, setLocation] = useState<InventoryLocation | null>(null);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [containerHeight, setContainerHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    if (!sale) return;
    const handleResize = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const parentWidth = parent.clientWidth;
          const targetWidth = 1024;
          const newScale = parentWidth < targetWidth ? parentWidth / targetWidth : 1;
          setScale(newScale);
          setContainerHeight(containerRef.current.scrollHeight * newScale);
        }
      }
    };

    handleResize();
    const timer = setTimeout(handleResize, 150);

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [sale, items]);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentOrg || !id) return;
      try {
        const saleData = await saleService.getSale(currentOrg.id, id);
        if (saleData) {
          setSale(saleData);
          const [custs, allItems, locs, payments] = await Promise.all([
            saleService.getCustomers(currentOrg.id),
            inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
            inventoryService.getLocations(currentOrg.id),
            saleService.getCustomerPaymentRecords(currentOrg.id, saleData.customerId),
          ]);
          setCustomer(custs.find(c => c.id === saleData.customerId) || null);
          setItems(allItems);
          setLocation(locs.find(l => l.id === saleData.locationId) || null);
          setPaymentRecords(payments);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentOrg, id]);

  const currentSaleDue = sale ? Math.max(sale.totalAmount - sale.paidAmount, 0) : 0;
  const linkedSaleDueRecord = sale
    ? paymentRecords.find((record) => record.referenceId === sale.id && (record.direction === 'sale_due_added' || record.direction === 'sale_due_updated'))
    : undefined;
  const oldDueAmount = Math.max(
    sale?.previousDueAmount ??
      (linkedSaleDueRecord
        ? (linkedSaleDueRecord.balanceAfter || 0) - linkedSaleDueRecord.amount
        : (customer?.balance || 0) - currentSaleDue),
    0
  );
  const grandTotalPayable = oldDueAmount + (sale?.totalAmount || 0);

  const sellerName = currentOrg?.settings?.storeName || currentOrg?.name || 'Purit Network';
  const sellerTagline = currentOrg?.settings?.tagline || 'smart inventory management';
  const sellerAddress = currentOrg?.settings?.address || 'Main Warehouse\nKozhikode, Kerala - 673631';
  const sellerPhone = currentOrg?.settings?.phone || '+91 98765 43210';
  const sellerEmail = currentOrg?.settings?.email || 'support@purit.com';
  const sellerGstin = currentOrg?.settings?.gstin || '32ABCDE1234F1Z5';

  const [actionLoading, setActionLoading] = useState<'download' | 'print' | null>(null);

  const fetchFreshInvoiceSnapshotAndRecalculate = async () => {
    if (!currentOrg || !id) return null;

    const freshSale = await saleService.getSale(currentOrg.id, id);
    if (!freshSale) return null;

    const [freshCustomer, freshCustomerPayments, freshSalePayments, freshItems, freshLocations] = await Promise.all([
      freshSale.customerId ? saleService.getCustomer(currentOrg.id, freshSale.customerId) : Promise.resolve(null),
      freshSale.customerId ? saleService.getCustomerPaymentRecords(currentOrg.id, freshSale.customerId) : Promise.resolve([]),
      saleService.getSalePaymentRecords(currentOrg.id, freshSale.id),
      inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
      inventoryService.getLocations(currentOrg.id),
    ]);

    const paymentMap = new Map<string, PaymentRecord>();
    freshCustomerPayments.forEach((p) => paymentMap.set(p.id, p));
    freshSalePayments.forEach((p) => paymentMap.set(p.id, p));
    const allRelevantPayments = Array.from(paymentMap.values()).sort((a, b) => b.timestamp - a.timestamp);

    const freshLocation = freshLocations.find((l) => l.id === freshSale.locationId) || location;

    // Query recent payments made against this invoice
    const directPaymentsReceived = allRelevantPayments
      .filter((p) => p.referenceId === freshSale.id && p.direction === 'payment_received')
      .reduce((sum, p) => sum + p.amount, 0);

    const basePaid = freshSale.paidAmount || 0;
    const freshTotalPaid = freshSale.paymentType === 'cash'
      ? freshSale.totalAmount
      : Math.min(freshSale.totalAmount, Math.max(basePaid, basePaid + directPaymentsReceived, directPaymentsReceived));

    const freshDueAmount = Math.max(0, freshSale.totalAmount - freshTotalPaid);

    const linkedSaleDueRecord = allRelevantPayments.find(
      (record) => record.referenceId === freshSale.id && (record.direction === 'sale_due_added' || record.direction === 'sale_due_updated')
    );
    const freshOldDueAmount = Math.max(
      freshSale.previousDueAmount ??
        (linkedSaleDueRecord
          ? (linkedSaleDueRecord.balanceAfter || 0) - linkedSaleDueRecord.amount
          : (freshCustomer?.balance || 0) - freshDueAmount),
      0
    );
    const freshGrandTotalPayable = freshOldDueAmount + freshSale.totalAmount;

    // Dynamically update component state so on-screen invoice immediately syncs to fresh snapshot
    setSale(freshSale);
    if (freshCustomer) setCustomer(freshCustomer);
    setPaymentRecords(allRelevantPayments);
    setItems(freshItems);
    if (freshLocation) setLocation(freshLocation);

    return {
      freshSale,
      freshCustomer,
      freshLocation,
      freshItems,
      freshTotalPaid,
      freshDueAmount,
      freshOldDueAmount,
      freshGrandTotalPayable,
    };
  };

  const buildInvoicePdfDataFromSnapshot = (data: {
    freshSale: Sale;
    freshCustomer: Customer | null;
    freshLocation: InventoryLocation | null;
    freshItems: Item[];
    freshTotalPaid: number;
    freshDueAmount: number;
    freshOldDueAmount: number;
    freshGrandTotalPayable: number;
  }) => {
    const {
      freshSale,
      freshCustomer,
      freshLocation,
      freshItems,
      freshTotalPaid,
      freshOldDueAmount,
      freshGrandTotalPayable,
    } = data;
    if (!currentOrg) return null;

    const customInvoiceNumber = freshSale.isGstBill && freshSale.gstBillNumber
      ? freshSale.gstBillNumber
      : `#${freshSale.id.slice(-8).toUpperCase()}`;

    return {
      organizationName: sellerName,
      organizationSubtitle: sellerTagline,
      sellerName,
      sellerAddress,
      sellerPhone,
      sellerEmail,
      sellerGstin,
      invoiceTitle: 'Sales Invoice',
      invoiceNumber: customInvoiceNumber,
      currencyCode: currentOrg.settings.currency,
      customerName: freshCustomer?.name || 'Walk-in Customer',
      customerAddress: freshCustomer?.address || 'N/A',
      customerPhone: freshCustomer?.phone,
      customerEmail: freshCustomer?.email,
      customerGstin: freshCustomer?.gstin,
      customerDetails: [
        freshCustomer?.shopName || freshCustomer?.route,
        freshCustomer?.address || 'N/A',
        freshCustomer?.phone ? `Phone: ${freshCustomer.phone}` : null,
        freshCustomer?.email ? `Email: ${freshCustomer.email}` : null,
        freshCustomer?.gstin ? `GSTIN: ${freshCustomer.gstin}` : null,
      ].filter(Boolean) as string[],
      detailRows: [
        { label: 'Date', value: format(freshSale.timestamp, 'MMM dd, yyyy HH:mm') },
        { label: 'Payment', value: freshSale.paymentType.toUpperCase() },
        { label: 'Location', value: freshLocation?.name || 'Main Warehouse' },
      ],
      items: freshSale.items.map((line) => {
        const item = freshItems.find((entry) => entry.id === line.itemId);
        return {
          description: getItemDisplayName(item),
          sku: item?.isDeleted ? 'DELETED' : getItemSkuLabel(item),
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          hsnSac: item?.hsnSac || '8414',
        };
      }),
      subtotal: freshSale.totalAmount - (freshSale.taxAmount || 0),
      taxLabel: freshSale.isGstBill
        ? `GST (${freshSale.taxRate ?? 18}%)`
        : (freshSale.taxAmount > 0 ? `Tax (${freshSale.taxRate ?? (currentOrg?.settings?.taxRate ?? 0)}%)` : undefined),
      taxAmount: freshSale.taxAmount || 0,
      total: freshSale.totalAmount,
      paidAmount: freshTotalPaid,
      oldDueAmount: freshOldDueAmount,
      currentBillAmount: freshSale.totalAmount,
      grandTotalAmount: freshGrandTotalPayable,
      notes: freshSale.notes,
      footerReference: freshSale.isGstBill && freshSale.gstBillNumber ? freshSale.gstBillNumber : freshSale.id,
    };
  };

  const handlePrint = async () => {
    if (actionLoading) return;
    setActionLoading('print');
    try {
      const snapshot = await fetchFreshInvoiceSnapshotAndRecalculate();
      if (!snapshot) return;

      const pdfData = buildInvoicePdfDataFromSnapshot(snapshot);
      if (!pdfData) return;

      const blob = createInvoicePdfBlob(pdfData);
      const filename = snapshot.freshSale.isGstBill && snapshot.freshSale.gstBillNumber 
        ? `invoice-${snapshot.freshSale.gstBillNumber}.pdf` 
        : `invoice-${snapshot.freshSale.id.slice(-8).toUpperCase() || 'document'}.pdf`;
      printPdfBlob(blob, filename);
    } catch (err) {
      console.error('Error generating fresh invoice PDF for print:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async () => {
    if (actionLoading) return;
    setActionLoading('download');
    try {
      const snapshot = await fetchFreshInvoiceSnapshotAndRecalculate();
      if (!snapshot) return;

      const pdfData = buildInvoicePdfDataFromSnapshot(snapshot);
      if (!pdfData) return;

      const filename = snapshot.freshSale.isGstBill && snapshot.freshSale.gstBillNumber 
        ? `invoice-${snapshot.freshSale.gstBillNumber}.pdf` 
        : `invoice-${snapshot.freshSale.id.slice(-8).toUpperCase()}.pdf`;
      downloadInvoicePdf(filename, pdfData);
    } catch (err) {
      console.error('Error downloading fresh invoice PDF:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!sale || !currentOrg) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Invoice not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-orange-600 font-medium">Go Back</button>
      </div>
    );
  }

  const taxRate = sale.taxRate ?? 18;
  const halfTaxRate = taxRate / 2;
  const taxAmount = sale.taxAmount || 0;
  const cgstAmount = taxAmount / 2;
  const sgstAmount = taxAmount / 2;
  const subtotal = sale.totalAmount - taxAmount;
  const paidAmount = sale.paymentType === 'credit' ? sale.paidAmount : sale.totalAmount;
  const balanceDue = Math.max(sale.totalAmount - paidAmount, 0);
  const totalInWords = numberToWords(grandTotalPayable);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Action Bar - Hidden on Print */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={handleDownload}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {actionLoading === 'download' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span>Updating calculations...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </>
            )}
          </button>
          <button 
            type="button"
            onClick={handlePrint}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {actionLoading === 'print' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span>Updating calculations...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                <span>Print PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Invoice Content Wrapper with scaling to fit viewport on mobile */}
      <div 
        className="invoice-viewport-container w-full overflow-hidden pb-4 print:overflow-visible print:pb-0"
        style={{ height: scale < 1 && containerHeight !== 'auto' ? `${containerHeight}px` : 'auto' }}
      >
        <div 
          ref={containerRef}
          className="invoice-content-container w-[1024px] min-w-[1024px] bg-white p-12 rounded-2xl shadow-sm border border-gray-100 print:shadow-none print:border-none print:p-0"
          style={{
            transform: scale < 1 ? `scale(${scale})` : 'none',
            transformOrigin: 'top left',
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-100 shrink-0">
                <Package className="text-white w-7 h-7" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight truncate" title={sellerName}>
                  {sellerName}
                </h1>
                {sellerTagline && (
                  <p className="text-xs font-semibold text-gray-600 mt-0.5 truncate" title={sellerTagline}>
                    {sellerTagline}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-6 py-2.5 text-right min-w-[180px] shrink-0 shadow-sm">
              <p className="text-[9px] font-bold text-gray-600 tracking-wider uppercase opacity-90">GST TAX INVOICE</p>
              <p className="text-lg font-extrabold text-orange-600 tracking-tight">
                {sale.isGstBill && sale.gstBillNumber ? sale.gstBillNumber : `#${sale.id.slice(-8).toUpperCase()}`}
              </p>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-3 border-y border-gray-100 py-3 mb-6 bg-gray-50/20">
            <div className="px-4 border-r border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Invoice No.</p>
              <p className="text-sm font-extrabold text-orange-600 mt-1 font-mono">
                {sale.isGstBill && sale.gstBillNumber ? sale.gstBillNumber : sale.id.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="px-4 border-r border-gray-100">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Invoice Date</p>
              <p className="text-sm font-extrabold text-orange-600 mt-1">{format(sale.timestamp, 'MMM dd, yyyy HH:mm')}</p>
            </div>
            <div className="px-4">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Place of Supply</p>
              <p className="text-sm font-extrabold text-orange-600 mt-1">Kerala (32)</p>
            </div>
          </div>

          {/* Seller & Bill To Grid */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Seller Card */}
            <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between min-w-0 bg-white">
              <div>
                <div className="bg-orange-500 text-white px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase">
                  SELLER
                </div>
                <div className="p-4 space-y-1 text-xs text-gray-600 leading-relaxed min-w-0 [word-break:break-word] [overflow-wrap:anywhere]">
                  <p className="font-bold text-gray-900 text-sm mb-1 break-words [word-break:break-word] [overflow-wrap:anywhere]" title={sellerName}>
                    {sellerName}
                  </p>
                  {sellerAddress && (
                    <p className="whitespace-pre-line text-gray-600 break-words [word-break:break-word] [overflow-wrap:anywhere]">
                      {sellerAddress}
                    </p>
                  )}
                  {sellerPhone && (
                    <p className="break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`Phone: ${sellerPhone}`}>
                      Phone: {sellerPhone}
                    </p>
                  )}
                  {sellerEmail && (
                    <p className="break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`Email: ${sellerEmail}`}>
                      Email: {sellerEmail}
                    </p>
                  )}
                </div>
              </div>
              {sellerGstin && (
                <div className="px-4 pb-4 pt-1">
                  <p className="pt-2 font-bold text-gray-900 border-t border-gray-50 text-xs font-mono break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`GSTIN: ${sellerGstin}`}>
                    GSTIN: <span className="text-gray-700">{sellerGstin}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Bill To Card */}
            <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between min-w-0 bg-white">
              <div>
                <div className="bg-orange-500 text-white px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase">
                  BILL TO
                </div>
                <div className="p-4 space-y-1 text-xs text-gray-600 leading-relaxed min-w-0 [word-break:break-word] [overflow-wrap:anywhere]">
                  <p className="font-bold text-gray-900 text-sm mb-1 break-words [word-break:break-word] [overflow-wrap:anywhere]" title={customer?.name || 'Walk-in Customer'}>
                    {customer?.name || 'Walk-in Customer'}
                  </p>
                  {(customer?.shopName || customer?.route) && (
                    <p className="break-words [word-break:break-word] [overflow-wrap:anywhere]" title={customer?.shopName || customer?.route}>
                      {customer?.shopName || customer?.route}
                    </p>
                  )}
                  <p className="whitespace-pre-line text-gray-600 break-words [word-break:break-word] [overflow-wrap:anywhere]">
                    {customer?.address || 'N/A'}
                  </p>
                  {customer?.phone && (
                    <p className="break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`Phone: ${customer.phone}`}>
                      Phone: {customer.phone}
                    </p>
                  )}
                  {customer?.email && (
                    <p className="break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`Email: ${customer.email}`}>
                      Email: {customer.email}
                    </p>
                  )}
                </div>
              </div>
              {customer?.gstin && (
                <div className="px-4 pb-4 pt-1">
                  <p className="pt-2 font-bold text-gray-900 border-t border-gray-50 text-xs font-mono break-words [word-break:break-word] [overflow-wrap:anywhere]" title={`GSTIN: ${customer.gstin}`}>
                    GSTIN: <span className="text-gray-700">{customer.gstin}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-hidden border border-gray-100 rounded-xl mb-6">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 w-12 text-center">#</th>
                  <th className="py-2.5 px-2">DESCRIPTION</th>
                  <th className="py-2.5 px-2 text-center w-24">HSN/SAC</th>
                  <th className="py-2.5 px-2 text-right w-16">QTY</th>
                  <th className="py-2.5 px-2 text-right w-36">UNIT PRICE (INR)</th>
                  <th className="py-2.5 px-4 text-right w-36">TOTAL (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {sale.items.map((line, i) => {
                  const item = items.find(it => it.id === line.itemId);
                  const hsnSac = item?.hsnSac || '8414';
                  return (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-mono text-gray-400 text-center">{i + 1}</td>
                      <td className="py-3 px-2">
                        <p className="font-bold text-gray-900 text-xs">{getItemDisplayName(item)}</p>
                        {item?.isDeleted && <p className="text-[10px] text-red-500 font-mono">DELETED</p>}
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-gray-600">{hsnSac}</td>
                      <td className="py-3 px-2 text-right text-gray-900 font-semibold">{formatQuantity(line.quantity)}</td>
                      <td className="py-3 px-2 text-right font-mono">{line.unitPrice.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900 font-mono">{line.subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Calculation & Payment Summary */}
          <div className="flex justify-end mb-6">
            <div className="w-80 space-y-3">
              {/* Calculation Card */}
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/20 space-y-2 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900 font-mono">INR {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST ({halfTaxRate}%)</span>
                  <span className="font-mono">INR {cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST ({halfTaxRate}%)</span>
                  <span className="font-mono">INR {sgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-orange-600 font-bold border-t border-gray-100 pt-2 mt-1">
                  <span>Total Tax ({taxRate}%)</span>
                  <span className="font-mono">INR {taxAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Grand Total Highlight */}
              <div className="bg-orange-500 text-white px-4 py-2.5 rounded-lg flex justify-between items-center font-extrabold text-xs shadow-sm">
                <span className="tracking-wide">GRAND TOTAL</span>
                <span className="text-sm font-bold font-mono">INR {sale.totalAmount.toFixed(2)}</span>
              </div>

              {/* Payment Summary Box */}
              <div className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm space-y-2.5 text-xs">
                <p className="font-bold text-orange-600 uppercase tracking-widest text-[9px] mb-2">PAYMENT SUMMARY</p>
                <div className="flex justify-between text-gray-600">
                  <span>Paid Amount</span>
                  <span className="font-mono">INR {paidAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-orange-600 font-bold text-xs">
                  <span>Balance Due</span>
                  <span className="font-mono">INR {balanceDue.toFixed(2)}</span>
                </div>
                <hr className="border-gray-50 my-1" />
                <div className="flex justify-between text-gray-400 text-[10px]">
                  <span>Old Due Amount</span>
                  <span className="font-mono">INR {oldDueAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400 text-[10px]">
                  <span>Current Bill Amount</span>
                  <span className="font-mono">INR {sale.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2 mt-1">
                  <span>Grand Total</span>
                  <span className="font-mono">INR {grandTotalPayable.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="border border-orange-100 bg-orange-50/20 rounded-xl p-3.5 flex items-center gap-2.5 text-xs mb-6 shadow-sm">
            <FileText className="w-4 h-4 text-orange-500 shrink-0" />
            <p className="text-gray-700 leading-none">
              <span className="font-bold text-orange-600 mr-1.5">Amount in Words:</span>
              {totalInWords}
            </p>
          </div>

          {/* Page bottom note */}
          <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium border-t border-gray-100 pt-4 mt-6">
            <p className="font-serif italic text-gray-400 text-xs">Thank you for your business.</p>
            <p className="font-mono">Reference: {sale.id}</p>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          .max-w-7xl { max-width: none !important; padding: 0 !important; }
          .invoice-viewport-container {
            height: auto !important;
            overflow: visible !important;
          }
          .invoice-content-container {
            width: 100% !important;
            min-width: 0 !important;
            transform: none !important;
            padding: 0 !important;
          }
        }
      `}} />
    </div>
  );
};

