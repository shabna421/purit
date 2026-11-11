import { Customer, Sale, CustomerReturn, Purchase, Item, OrganizationSettings } from '../types';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export interface GstStateInfo {
  code: string;
  name: string;
}

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

// 15-character GSTIN format regex
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

export function isValidGstin(gstin?: string): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim());
}

export function getStateFromGstin(gstin?: string): GstStateInfo | null {
  if (!gstin || gstin.trim().length < 2) return null;
  const code = gstin.trim().slice(0, 2);
  const name = GST_STATES[code];
  if (!name) return null;
  return { code, name };
}

export function formatPlaceOfSupply(code?: string, name?: string): string {
  if (!code && !name) return '32-Kerala';
  if (code && name) return `${code}-${name}`;
  if (code && GST_STATES[code]) return `${code}-${GST_STATES[code]}`;
  return name || code || '32-Kerala';
}

export function roundGst(value: number, roundDecimals = true): number {
  if (!roundDecimals) return value;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatIndianCurrency(amount: number, showDecimals = true): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(rounded);
  } catch {
    return `₹${rounded.toFixed(2)}`;
  }
}

export function formatIndianNumber(amount: number, showDecimals = true): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(rounded);
  } catch {
    return rounded.toFixed(2);
  }
}

export interface GstPeriodOption {
  key: string; // "YYYY-MM" or "YYYY-Q1"
  label: string;
  type: 'month' | 'quarter';
  year: number;
  month?: number; // 0-11
  quarter?: number; // 1-4
  startDate: number;
  endDate: number;
}

export function getPeriodOptions(frequency: 'monthly' | 'quarterly' = 'monthly'): GstPeriodOption[] {
  const now = new Date();
  const options: GstPeriodOption[] = [];

  if (frequency === 'quarterly') {
    // Generate past 8 quarters (April-March financial quarters)
    // Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar
    const currentYear = now.getFullYear();
    for (let y = currentYear; y >= currentYear - 2; y--) {
      const quarters = [
        { q: 4, label: `Q4 (Jan - Mar ${y})`, startM: 0, endM: 2, year: y },
        { q: 3, label: `Q3 (Oct - Dec ${y - 1})`, startM: 9, endM: 11, year: y - 1 },
        { q: 2, label: `Q2 (Jul - Sep ${y - 1})`, startM: 6, endM: 8, year: y - 1 },
        { q: 1, label: `Q1 (Apr - Jun ${y - 1})`, startM: 3, endM: 5, year: y - 1 },
      ];

      for (const q of quarters) {
        const start = new Date(q.year, q.startM, 1, 0, 0, 0, 0).getTime();
        const end = new Date(q.year, q.endM + 1, 0, 23, 59, 59, 999).getTime();
        if (start <= now.getTime()) {
          options.push({
            key: `${q.year}-Q${q.q}`,
            label: q.label,
            type: 'quarter',
            year: q.year,
            quarter: q.q,
            startDate: start,
            endDate: end,
          });
        }
      }
    }
  } else {
    // Generate past 24 months
    for (let i = 0; i < 24; i++) {
      const d = subMonths(now, i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const start = startOfMonth(d).getTime();
      const end = endOfMonth(d).getTime();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = format(d, 'MMMM yyyy');
      options.push({
        key,
        label,
        type: 'month',
        year,
        month,
        startDate: start,
        endDate: end,
      });
    }
  }

  return options;
}

export function getDefaultPeriodKey(frequency: 'monthly' | 'quarterly' = 'monthly'): string {
  const now = new Date();
  if (frequency === 'quarterly') {
    // Previous quarter
    const m = now.getMonth();
    const y = now.getFullYear();
    if (m >= 0 && m <= 2) return `${y - 1}-Q3`;
    if (m >= 3 && m <= 5) return `${y}-Q4`;
    if (m >= 6 && m <= 8) return `${y}-Q1`;
    return `${y}-Q2`;
  }
  // Default to previous month
  const prevMonth = subMonths(now, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
}

export function resolveCustomerPlaceOfSupply(
  customer?: Customer | null,
  sale?: Sale | null,
  businessStateCode = '32'
): { code: string; name: string; isDerivedFromCustomer: boolean; isFallback: boolean; warning?: string } {
  // 1. Explicit place of supply on sale
  if (sale?.placeOfSupply && sale.placeOfSupply.trim()) {
    const raw = sale.placeOfSupply.trim();
    const codeMatch = raw.match(/\b\d{2}\b/);
    if (codeMatch && GST_STATES[codeMatch[0]]) {
      return {
        code: codeMatch[0],
        name: GST_STATES[codeMatch[0]],
        isDerivedFromCustomer: false,
        isFallback: false,
      };
    }
  }

  // 2. Derive from customer GSTIN
  if (customer?.gstin && customer.gstin.trim().length >= 2) {
    const code = customer.gstin.trim().slice(0, 2);
    if (GST_STATES[code]) {
      return {
        code,
        name: GST_STATES[code],
        isDerivedFromCustomer: true,
        isFallback: false,
      };
    }
  }

  // 3. Address match for state names
  if (customer?.address) {
    const addr = customer.address.toLowerCase();
    for (const [code, name] of Object.entries(GST_STATES)) {
      if (addr.includes(name.toLowerCase())) {
        return {
          code,
          name,
          isDerivedFromCustomer: true,
          isFallback: false,
        };
      }
    }
  }

  // 4. Default fallback to business state
  const fallbackCode = businessStateCode || '32';
  const fallbackName = GST_STATES[fallbackCode] || 'Kerala';
  return {
    code: fallbackCode,
    name: fallbackName,
    isDerivedFromCustomer: false,
    isFallback: true,
    warning: 'Place of supply not specified; assumed intra-state business state',
  };
}

export interface GstRateBreakdown {
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  invoiceValue: number;
  billCount: number;
}

export interface Gstr1B2bEntry {
  customerGstin: string;
  customerName: string;
  invoiceNo: string;
  date: string;
  rawDate: number;
  invoiceValue: number;
  pos: string;
  rchrg: 'Y' | 'N';
  rate: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  saleId: string;
}

export interface Gstr1B2clEntry {
  invoiceNo: string;
  date: string;
  rawDate: number;
  customerName: string;
  invoiceValue: number;
  pos: string;
  rate: number;
  taxableValue: number;
  igst: number;
  cess: number;
  saleId: string;
}

export interface Gstr1B2csEntry {
  pos: string;
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalValue: number;
}

export interface Gstr1HsnEntry {
  hsn: string;
  description: string;
  uqc: string;
  totalQty: number;
  taxableValue: number;
  rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalValue: number;
  isB2b: boolean;
}

export interface Gstr1CdnrEntry {
  noteNo: string;
  date: string;
  rawDate: number;
  originalInvoiceNo: string;
  customerGstin?: string;
  customerName: string;
  isRegistered: boolean;
  noteType: 'C';
  noteValue: number;
  taxableValue: number;
  rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  returnId: string;
}

export interface Gstr1DocSummary {
  nature: string;
  fromNo: string;
  toNo: string;
  totalIssued: number;
  cancelled: number;
  netIssued: number;
}

export interface Gstr3bData {
  table31a: {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
  table31c: {
    taxableValue: number;
  };
  table32: Array<{
    pos: string;
    taxableValue: number;
    igst: number;
  }>;
  table4: {
    hasPurchaseData: boolean;
    totalItc: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    purchaseCount: number;
  };
  netTaxPayable: {
    igst: number;
    cgst: number;
    sgst: number;
    total: number;
  };
}

export interface GstValidationWarning {
  id: string;
  type: 'error' | 'warning';
  title: string;
  message: string;
  invoiceNo?: string;
  saleId?: string;
}

export interface GstFilingReport {
  periodKey: string;
  periodLabel: string;
  businessGstin: string;
  businessStateCode: string;
  businessStateName: string;
  filingFrequency: 'monthly' | 'quarterly';
  roundDecimals: boolean;
  isFiled: boolean;
  filingDetails?: { filedAt: number; arn?: string; notes?: string };
  summary: {
    totalBillsCount: number;
    totalTaxableValue: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalCess: number;
    totalTax: number;
    totalInvoiceValue: number;
    rateWiseBreakdown: GstRateBreakdown[];
  };
  gstr1: {
    b2b: Gstr1B2bEntry[];
    b2bGrouped: Array<{
      gstin: string;
      customerName: string;
      invoices: Gstr1B2bEntry[];
      subtotalTaxable: number;
      subtotalIgst: number;
      subtotalCgst: number;
      subtotalSgst: number;
      subtotalValue: number;
    }>;
    b2cl: Gstr1B2clEntry[];
    b2cs: Gstr1B2csEntry[];
    hsn: Gstr1HsnEntry[];
    cdnr: Gstr1CdnrEntry[];
    docSummary: Gstr1DocSummary;
  };
  gstr3b: Gstr3bData;
  warnings: GstValidationWarning[];
}

export function compileGstFilingReport({
  sales,
  cancelledSales = [],
  returns = [],
  purchases = [],
  customersMap = new Map(),
  itemsMap = new Map(),
  settings,
  periodOption,
}: {
  sales: Sale[];
  cancelledSales?: Sale[];
  returns?: CustomerReturn[];
  purchases?: Purchase[];
  customersMap: Map<string, Customer>;
  itemsMap: Map<string, Item>;
  settings?: OrganizationSettings;
  periodOption: GstPeriodOption;
}): GstFilingReport {
  const roundDecimals = settings?.roundDecimals !== false;
  const rawGstin = settings?.gstin?.trim() || '';
  const businessGstin = rawGstin || '32ABCDE1234F1Z5';
  const derivedBusinessState = getStateFromGstin(businessGstin);
  const businessStateCode = settings?.businessStateCode || derivedBusinessState?.code || '32';
  const businessStateName = settings?.businessState || derivedBusinessState?.name || GST_STATES[businessStateCode] || 'Kerala';
  const filingFrequency = settings?.filingFrequency || 'monthly';

  const isFiled = Boolean(settings?.gstFiledMonths?.[periodOption.key]);
  const filingDetails = settings?.gstFiledMonths?.[periodOption.key];

  const warnings: GstValidationWarning[] = [];

  // Filter valid GST sales in the selected period
  // Only completed sales with tax applied (taxAmount > 0 or taxRate > 0 or isGstBill)
  const gstSales = sales.filter((s) => {
    if (s.status === 'cancelled' || (s as any).isDraft || (s as any).isDeleted) return false;
    if (s.timestamp < periodOption.startDate || s.timestamp > periodOption.endDate) return false;
    const hasTax = Boolean(s.isGstBill || (s.taxAmount && s.taxAmount > 0) || (s.taxRate && s.taxRate > 0) || (s.gstAmount && s.gstAmount > 0));
    return hasTax;
  }).sort((a, b) => a.timestamp - b.timestamp);

  // Rate Breakdown accumulator
  const rateBreakdownMap = new Map<number, GstRateBreakdown>();
  const getOrCreateRate = (rate: number): GstRateBreakdown => {
    const existing = rateBreakdownMap.get(rate);
    if (existing) return existing;
    const initial: GstRateBreakdown = {
      rate,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      totalTax: 0,
      invoiceValue: 0,
      billCount: 0,
    };
    rateBreakdownMap.set(rate, initial);
    return initial;
  };

  const b2bEntries: Gstr1B2bEntry[] = [];
  const b2clEntries: Gstr1B2clEntry[] = [];
  const b2csMap = new Map<string, Gstr1B2csEntry>(); // key: `${pos}_${rate}`
  const hsnMap = new Map<string, Gstr1HsnEntry>(); // key: `${hsn}_${rate}_${isB2b}`

  let totalTaxableValue = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;
  let totalInvoiceValue = 0;

  const invoiceNumbersSeen = new Set<string>();

  for (const sale of gstSales) {
    const customer = customersMap.get(sale.customerId);
    const invoiceNo = sale.isGstBill && sale.gstBillNumber
      ? sale.gstBillNumber
      : `#${sale.id.slice(-8).toUpperCase()}`;

    // Duplicate check
    if (invoiceNumbersSeen.has(invoiceNo)) {
      warnings.push({
        id: `dup-${sale.id}`,
        type: 'error',
        title: 'Duplicate Invoice Number',
        message: `Invoice number "${invoiceNo}" appears multiple times in the records.`,
        invoiceNo,
        saleId: sale.id,
      });
    }
    invoiceNumbersSeen.add(invoiceNo);

    const taxAmount = Number(sale.taxAmount || sale.gstAmount || 0);
    const invoiceTotal = Number(sale.totalAmount || 0);
    const taxableValue = Math.max(0, invoiceTotal - taxAmount);
    const taxRate = Number(sale.taxRate ?? (taxableValue > 0 ? Math.round((taxAmount / taxableValue) * 100) : 18));

    // Rounding check warning: tax vs taxableValue * rate
    if (taxableValue > 0 && taxRate > 0) {
      const expectedTax = (taxableValue * taxRate) / 100;
      if (Math.abs(expectedTax - taxAmount) > 1.0) {
        warnings.push({
          id: `tax-diff-${sale.id}`,
          type: 'warning',
          title: 'Tax Calculation Mismatch',
          message: `Bill ${invoiceNo} tax of ₹${taxAmount.toFixed(2)} differs from expected ₹${expectedTax.toFixed(2)} by more than ₹1.`,
          invoiceNo,
          saleId: sale.id,
        });
      }
    }

    // Resolve POS
    const posRes = resolveCustomerPlaceOfSupply(customer, sale, businessStateCode);
    const pos = formatPlaceOfSupply(posRes.code, posRes.name);
    if (posRes.isFallback && !customer?.gstin && !customer?.address) {
      warnings.push({
        id: `pos-missing-${sale.id}`,
        type: 'warning',
        title: 'Missing Place of Supply',
        message: `Bill ${invoiceNo} for ${customer?.name || 'Customer'} has no customer state or address. Defaulted to ${pos}.`,
        invoiceNo,
        saleId: sale.id,
      });
    }

    const isInterState = posRes.code !== businessStateCode;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const cess = 0;

    if (isInterState) {
      igst = roundGst(taxAmount, roundDecimals);
    } else {
      cgst = roundGst(taxAmount / 2, roundDecimals);
      sgst = roundGst(taxAmount / 2, roundDecimals);
    }

    totalTaxableValue += taxableValue;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalCess += cess;
    totalInvoiceValue += invoiceTotal;

    // Accumulate rate breakdown
    const rb = getOrCreateRate(taxRate);
    rb.taxableValue += taxableValue;
    rb.cgst += cgst;
    rb.sgst += sgst;
    rb.igst += igst;
    rb.cess += cess;
    rb.totalTax += (cgst + sgst + igst + cess);
    rb.invoiceValue += invoiceTotal;
    rb.billCount += 1;

    const formattedDate = format(new Date(sale.timestamp), 'dd-MM-yyyy');
    const customerGstin = customer?.gstin?.trim() || '';
    const hasGstin = customerGstin.length > 0;

    // Validation: Customer marked with invalid GSTIN format
    if (hasGstin && !isValidGstin(customerGstin)) {
      warnings.push({
        id: `inv-gstin-${sale.id}`,
        type: 'error',
        title: 'Invalid Customer GSTIN',
        message: `Customer ${customer?.name || 'N/A'} has invalid GSTIN format "${customerGstin}".`,
        invoiceNo,
        saleId: sale.id,
      });
    }

    // Classify GSTR-1
    if (hasGstin) {
      // 4a. B2B
      b2bEntries.push({
        customerGstin,
        customerName: customer?.name || 'Registered Customer',
        invoiceNo,
        date: formattedDate,
        rawDate: sale.timestamp,
        invoiceValue: roundGst(invoiceTotal, roundDecimals),
        pos,
        rchrg: 'N',
        rate: taxRate,
        taxableValue: roundGst(taxableValue, roundDecimals),
        igst,
        cgst,
        sgst,
        cess,
        saleId: sale.id,
      });
    } else if (isInterState && invoiceTotal > 100000) {
      // 4b. B2C Large (Inter-state unregistered > 1,00,000)
      b2clEntries.push({
        invoiceNo,
        date: formattedDate,
        rawDate: sale.timestamp,
        customerName: customer?.name || 'Walk-in Customer',
        invoiceValue: roundGst(invoiceTotal, roundDecimals),
        pos,
        rate: taxRate,
        taxableValue: roundGst(taxableValue, roundDecimals),
        igst,
        cess,
        saleId: sale.id,
      });
    } else {
      // 4c. B2C Small (all other unregistered sales)
      const b2csKey = `${pos}__${taxRate}`;
      const existing = b2csMap.get(b2csKey) || {
        pos,
        rate: taxRate,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        totalValue: 0,
      };
      existing.taxableValue += taxableValue;
      existing.cgst += cgst;
      existing.sgst += sgst;
      existing.igst += igst;
      existing.cess += cess;
      existing.totalValue += invoiceTotal;
      b2csMap.set(b2csKey, existing);
    }

    // 4d. HSN Summary from line items
    for (const line of sale.items || []) {
      const item = itemsMap.get(line.itemId);
      const hsn = (item?.hsnSac || '8414').trim();

      if (!item?.hsnSac) {
        warnings.push({
          id: `missing-hsn-${item?.id || line.itemId}`,
          type: 'warning',
          title: 'Missing Item HSN Code',
          message: `Item "${item?.name || line.itemId}" has no HSN code specified (defaulted to 8414).`,
          invoiceNo,
          saleId: sale.id,
        });
      }

      const uqc = (item?.unit || 'NOS').toUpperCase();
      const desc = item?.name || 'Product';
      const lineTaxable = Number(line.subtotal || (line.quantity * line.unitPrice) || 0);
      const lineTax = (lineTaxable * taxRate) / 100;
      const lineIgst = isInterState ? roundGst(lineTax, roundDecimals) : 0;
      const lineCgst = !isInterState ? roundGst(lineTax / 2, roundDecimals) : 0;
      const lineSgst = !isInterState ? roundGst(lineTax / 2, roundDecimals) : 0;

      const hsnKey = `${hsn}__${taxRate}__${hasGstin ? 'B2B' : 'B2C'}`;
      const existingHsn = hsnMap.get(hsnKey) || {
        hsn,
        description: desc,
        uqc,
        totalQty: 0,
        taxableValue: 0,
        rate: taxRate,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        totalValue: 0,
        isB2b: hasGstin,
      };

      existingHsn.totalQty += Number(line.quantity || 0);
      existingHsn.taxableValue += lineTaxable;
      existingHsn.igst += lineIgst;
      existingHsn.cgst += lineCgst;
      existingHsn.sgst += lineSgst;
      existingHsn.totalValue += (lineTaxable + lineTax);
      hsnMap.set(hsnKey, existingHsn);
    }
  }

  // Group B2B by customer GSTIN with subtotals
  const b2bByGstin = new Map<string, Gstr1B2bEntry[]>();
  for (const entry of b2bEntries) {
    const list = b2bByGstin.get(entry.customerGstin) || [];
    list.push(entry);
    b2bByGstin.set(entry.customerGstin, list);
  }

  const b2bGrouped = Array.from(b2bByGstin.entries()).map(([gstin, invs]) => {
    return {
      gstin,
      customerName: invs[0]?.customerName || 'Registered Customer',
      invoices: invs,
      subtotalTaxable: roundGst(invs.reduce((s, i) => s + i.taxableValue, 0), roundDecimals),
      subtotalIgst: roundGst(invs.reduce((s, i) => s + i.igst, 0), roundDecimals),
      subtotalCgst: roundGst(invs.reduce((s, i) => s + i.cgst, 0), roundDecimals),
      subtotalSgst: roundGst(invs.reduce((s, i) => s + i.sgst, 0), roundDecimals),
      subtotalValue: roundGst(invs.reduce((s, i) => s + i.invoiceValue, 0), roundDecimals),
    };
  });

  // 4e. Credit Notes / Customer Returns in period
  const periodReturns = returns.filter((r) => {
    return r.timestamp >= periodOption.startDate && r.timestamp <= periodOption.endDate;
  });

  const cdnrEntries: Gstr1CdnrEntry[] = periodReturns.map((ret) => {
    const cust = customersMap.get(ret.customerId);
    const hasGstin = Boolean(cust?.gstin && cust.gstin.trim().length > 0);
    const posRes = resolveCustomerPlaceOfSupply(cust, null, businessStateCode);
    const isInterState = posRes.code !== businessStateCode;
    const noteVal = Number(ret.totalAmount || 0);
    const rate = 18; // default standard rate if line rates aren't stored
    const taxable = roundGst(noteVal / (1 + rate / 100), roundDecimals);
    const tax = roundGst(noteVal - taxable, roundDecimals);
    const igst = isInterState ? tax : 0;
    const cgst = !isInterState ? roundGst(tax / 2, roundDecimals) : 0;
    const sgst = !isInterState ? roundGst(tax / 2, roundDecimals) : 0;

    return {
      noteNo: `CR-${ret.id.slice(-6).toUpperCase()}`,
      date: format(new Date(ret.timestamp), 'dd-MM-yyyy'),
      rawDate: ret.timestamp,
      originalInvoiceNo: ret.saleId ? `#${ret.saleId.slice(-8).toUpperCase()}` : 'N/A',
      customerGstin: cust?.gstin,
      customerName: cust?.name || 'Customer',
      isRegistered: hasGstin,
      noteType: 'C',
      noteValue: roundGst(noteVal, roundDecimals),
      taxableValue: taxable,
      rate,
      igst,
      cgst,
      sgst,
      cess: 0,
      returnId: ret.id,
    };
  });

  // 4f. Document Summary (Invoice sequence)
  const allPeriodBills = [...gstSales, ...cancelledSales.filter(c => c.timestamp >= periodOption.startDate && c.timestamp <= periodOption.endDate)];
  allPeriodBills.sort((a, b) => a.timestamp - b.timestamp);

  const fromNo = allPeriodBills[0]?.isGstBill && allPeriodBills[0]?.gstBillNumber
    ? allPeriodBills[0].gstBillNumber
    : (allPeriodBills[0] ? `#${allPeriodBills[0].id.slice(-8).toUpperCase()}` : 'N/A');

  const toNo = allPeriodBills[allPeriodBills.length - 1]?.isGstBill && allPeriodBills[allPeriodBills.length - 1]?.gstBillNumber
    ? allPeriodBills[allPeriodBills.length - 1].gstBillNumber
    : (allPeriodBills[allPeriodBills.length - 1] ? `#${allPeriodBills[allPeriodBills.length - 1].id.slice(-8).toUpperCase()}` : 'N/A');

  const cancelledCount = cancelledSales.filter(c => c.timestamp >= periodOption.startDate && c.timestamp <= periodOption.endDate).length;
  const totalIssued = allPeriodBills.length;
  const netIssued = Math.max(0, totalIssued - cancelledCount);

  const docSummary: Gstr1DocSummary = {
    nature: 'Invoices for outward supply',
    fromNo,
    toNo,
    totalIssued,
    cancelled: cancelledCount,
    netIssued,
  };

  // 5. GSTR-3B Summary
  // 3.1(a) Outward taxable supplies
  const gstr3b_31a = {
    taxableValue: roundGst(totalTaxableValue, roundDecimals),
    igst: roundGst(totalIgst, roundDecimals),
    cgst: roundGst(totalCgst, roundDecimals),
    sgst: roundGst(totalSgst, roundDecimals),
    cess: roundGst(totalCess, roundDecimals),
  };

  // 3.1(c) Nil rated / exempt
  const nilRateEntry = rateBreakdownMap.get(0);
  const gstr3b_31c = {
    taxableValue: roundGst(nilRateEntry?.taxableValue || 0, roundDecimals),
  };

  // 3.2 Inter-state supplies to unregistered persons
  const interStateUnregMap = new Map<string, { pos: string; taxableValue: number; igst: number }>();
  for (const b2cl of b2clEntries) {
    const existing = interStateUnregMap.get(b2cl.pos) || { pos: b2cl.pos, taxableValue: 0, igst: 0 };
    existing.taxableValue += b2cl.taxableValue;
    existing.igst += b2cl.igst;
    interStateUnregMap.set(b2cl.pos, existing);
  }
  for (const b2cs of b2csMap.values()) {
    if (b2cs.igst > 0) {
      const existing = interStateUnregMap.get(b2cs.pos) || { pos: b2cs.pos, taxableValue: 0, igst: 0 };
      existing.taxableValue += b2cs.taxableValue;
      existing.igst += b2cs.igst;
      interStateUnregMap.set(b2cs.pos, existing);
    }
  }

  const gstr3b_32 = Array.from(interStateUnregMap.values()).map(v => ({
    pos: v.pos,
    taxableValue: roundGst(v.taxableValue, roundDecimals),
    igst: roundGst(v.igst, roundDecimals),
  }));

  // Table 4: Eligible ITC from Purchases
  const periodPurchases = purchases.filter((p) => {
    return p.timestamp >= periodOption.startDate && p.timestamp <= periodOption.endDate && p.status !== 'cancelled';
  });

  // Calculate purchase ITC if available
  let itcIgst = 0;
  let itcCgst = 0;
  let itcSgst = 0;
  let itcCess = 0;
  let purchasesWithTax = 0;

  for (const p of periodPurchases) {
    // If purchase has tax fields or lines
    const pTotal = Number(p.totalAmount || 0);
    const pTaxRate = (p as any).taxRate || 0;
    const pTax = (p as any).taxAmount || ((pTotal * pTaxRate) / 100);

    if (pTax > 0) {
      purchasesWithTax++;
      // Check supplier state
      const isInter = (p as any).isInterState || false;
      if (isInter) {
        itcIgst += pTax;
      } else {
        itcCgst += (pTax / 2);
        itcSgst += (pTax / 2);
      }
    }
  }

  const hasPurchaseData = purchasesWithTax > 0;
  const gstr3b_4 = {
    hasPurchaseData,
    totalItc: roundGst(itcIgst + itcCgst + itcSgst + itcCess, roundDecimals),
    igst: roundGst(itcIgst, roundDecimals),
    cgst: roundGst(itcCgst, roundDecimals),
    sgst: roundGst(itcSgst, roundDecimals),
    cess: roundGst(itcCess, roundDecimals),
    purchaseCount: periodPurchases.length,
  };

  // Net Tax Payable
  const netIgst = Math.max(0, roundGst(totalIgst - itcIgst, roundDecimals));
  const netCgst = Math.max(0, roundGst(totalCgst - itcCgst, roundDecimals));
  const netSgst = Math.max(0, roundGst(totalSgst - itcSgst, roundDecimals));
  const netTaxPayable = {
    igst: netIgst,
    cgst: netCgst,
    sgst: netSgst,
    total: roundGst(netIgst + netCgst + netSgst, roundDecimals),
  };

  return {
    periodKey: periodOption.key,
    periodLabel: periodOption.label,
    businessGstin,
    businessStateCode,
    businessStateName,
    filingFrequency,
    roundDecimals,
    isFiled,
    filingDetails,
    summary: {
      totalBillsCount: gstSales.length,
      totalTaxableValue: roundGst(totalTaxableValue, roundDecimals),
      totalCgst: roundGst(totalCgst, roundDecimals),
      totalSgst: roundGst(totalSgst, roundDecimals),
      totalIgst: roundGst(totalIgst, roundDecimals),
      totalCess: roundGst(totalCess, roundDecimals),
      totalTax: roundGst(totalCgst + totalSgst + totalIgst + totalCess, roundDecimals),
      totalInvoiceValue: roundGst(totalInvoiceValue, roundDecimals),
      rateWiseBreakdown: Array.from(rateBreakdownMap.values())
        .map(r => ({
          ...r,
          taxableValue: roundGst(r.taxableValue, roundDecimals),
          cgst: roundGst(r.cgst, roundDecimals),
          sgst: roundGst(r.sgst, roundDecimals),
          igst: roundGst(r.igst, roundDecimals),
          cess: roundGst(r.cess, roundDecimals),
          totalTax: roundGst(r.totalTax, roundDecimals),
          invoiceValue: roundGst(r.invoiceValue, roundDecimals),
        }))
        .sort((a, b) => a.rate - b.rate),
    },
    gstr1: {
      b2b: b2bEntries,
      b2bGrouped,
      b2cl: b2clEntries,
      b2cs: Array.from(b2csMap.values()).map(v => ({
        ...v,
        taxableValue: roundGst(v.taxableValue, roundDecimals),
        cgst: roundGst(v.cgst, roundDecimals),
        sgst: roundGst(v.sgst, roundDecimals),
        igst: roundGst(v.igst, roundDecimals),
        cess: roundGst(v.cess, roundDecimals),
        totalValue: roundGst(v.totalValue, roundDecimals),
      })),
      hsn: Array.from(hsnMap.values()).map(v => ({
        ...v,
        taxableValue: roundGst(v.taxableValue, roundDecimals),
        igst: roundGst(v.igst, roundDecimals),
        cgst: roundGst(v.cgst, roundDecimals),
        sgst: roundGst(v.sgst, roundDecimals),
        cess: roundGst(v.cess, roundDecimals),
        totalValue: roundGst(v.totalValue, roundDecimals),
      })),
      cdnr: cdnrEntries,
      docSummary,
    },
    gstr3b: {
      table31a: gstr3b_31a,
      table31c: gstr3b_31c,
      table32: gstr3b_32,
      table4: gstr3b_4,
      netTaxPayable,
    },
    warnings,
  };
}

// Clipboard copy helper
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  // Fallback for non-secure / iframe contexts
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    textArea.remove();
    return success;
  } catch {
    return false;
  }
}

// Copy table as TSV (Tab-Separated Values) so pasting into Excel pastes into real rows and columns
export async function copyTableAsTsv(headers: string[], rows: (string | number)[][]): Promise<boolean> {
  const tsvLines = [
    headers.join('\t'),
    ...rows.map(row => row.map(cell => (cell == null ? '' : String(cell).replace(/\t|\n/g, ' '))).join('\t'))
  ];
  return copyTextToClipboard(tsvLines.join('\n'));
}

function escapeXml(value: any): string {
  const str = value == null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function exportTableToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCsv = (val: any) => {
    const s = val == null ? '' : String(val);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => r.map(escapeCsv).join(','))
  ].join('\n');

  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), filename);
}

export function exportMultiSheetGstExcel(
  filename: string,
  sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }>
) {
  const worksheetsXml = sheets.map(sheet => {
    const headerRow = `<Row>${sheet.headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`;
    const dataRows = sheet.rows.map(r => {
      return `<Row>${r.map(c => {
        const type = typeof c === 'number' ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${escapeXml(c)}</Data></Cell>`;
      }).join('')}</Row>`;
    }).join('');

    return `  <Worksheet ss:Name="${escapeXml(sheet.name.slice(0, 31))}">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>`;
  }).join('\n');

  const workbookXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#F97316" ss:Pattern="Solid"/>
  </Style>
 </Styles>
${worksheetsXml}
</Workbook>`;

  downloadBlob(
    new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    filename
  );
}


export function exportCompleteGstReportExcel(report: GstFilingReport) {
  const filename = `GST_Complete_Report_${report.periodKey}.xls`;
  const sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }> = [];

  // Sheet 1: Rate-wise Summary
  sheets.push({
    name: 'Dashboard Summary',
    headers: ['Rate (%)', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total Tax', 'Invoice Value', 'Bills Count'],
    rows: [
      ...report.summary.rateWiseBreakdown.map(r => [
        `${r.rate}%`,
        r.taxableValue.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
        r.cess.toFixed(2),
        r.totalTax.toFixed(2),
        r.invoiceValue.toFixed(2),
        r.billCount,
      ]),
      [
        'Total',
        report.summary.totalTaxableValue.toFixed(2),
        report.summary.totalCgst.toFixed(2),
        report.summary.totalSgst.toFixed(2),
        report.summary.totalIgst.toFixed(2),
        report.summary.totalCess.toFixed(2),
        report.summary.totalTax.toFixed(2),
        report.summary.totalInvoiceValue.toFixed(2),
        report.summary.totalBillsCount,
      ],
    ],
  });

  // Sheet 2: GSTR-1 B2B
  sheets.push({
    name: 'GSTR1 B2B',
    headers: ['Customer GSTIN', 'Customer Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Reverse Charge', 'Rate (%)', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'],
    rows: report.gstr1.b2b.map(i => [
      i.customerGstin,
      i.customerName,
      i.invoiceNo,
      i.date,
      i.invoiceValue.toFixed(2),
      i.pos,
      i.rchrg,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
    ]),
  });

  // Sheet 3: GSTR-1 B2CL
  sheets.push({
    name: 'GSTR1 B2CL',
    headers: ['Invoice No', 'Date', 'Customer Name', 'Invoice Value', 'Place of Supply', 'Rate (%)', 'Taxable Value', 'IGST', 'Cess'],
    rows: report.gstr1.b2cl.map(i => [
      i.invoiceNo,
      i.date,
      i.customerName,
      i.invoiceValue.toFixed(2),
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
    ]),
  });

  // Sheet 4: GSTR-1 B2CS
  sheets.push({
    name: 'GSTR1 B2CS',
    headers: ['Place of Supply', 'Rate (%)', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total Value'],
    rows: report.gstr1.b2cs.map(i => [
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
    ]),
  });

  // Sheet 5: GSTR-1 HSN
  sheets.push({
    name: 'GSTR1 HSN',
    headers: ['HSN/SAC', 'Description', 'UQC', 'Total Quantity', 'Rate (%)', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'Type'],
    rows: report.gstr1.hsn.map(i => [
      i.hsn,
      i.description,
      i.uqc,
      i.totalQty,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
      i.isB2b ? 'B2B' : 'B2C',
    ]),
  });

  // Sheet 6: GSTR-1 CDNR
  sheets.push({
    name: 'GSTR1 Credit Notes',
    headers: ['Note No', 'Date', 'Original Invoice', 'Customer Name', 'Customer GSTIN', 'Type', 'Note Value', 'Taxable Value', 'Rate (%)', 'IGST', 'CGST', 'SGST', 'Cess'],
    rows: report.gstr1.cdnr.map(i => [
      i.noteNo,
      i.date,
      i.originalInvoiceNo,
      i.customerName,
      i.customerGstin || 'Unregistered',
      'Credit (C)',
      i.noteValue.toFixed(2),
      i.taxableValue.toFixed(2),
      `${i.rate}%`,
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
    ]),
  });

  // Sheet 7: GSTR-1 Docs
  sheets.push({
    name: 'GSTR1 Documents',
    headers: ['Nature of Document', 'From Serial No', 'To Serial No', 'Total Issued', 'Cancelled', 'Net Issued'],
    rows: [
      [
        report.gstr1.docSummary.nature,
        report.gstr1.docSummary.fromNo,
        report.gstr1.docSummary.toNo,
        report.gstr1.docSummary.totalIssued,
        report.gstr1.docSummary.cancelled,
        report.gstr1.docSummary.netIssued,
      ],
    ],
  });

  // Sheet 8: GSTR-3B Summary
  sheets.push({
    name: 'GSTR-3B',
    headers: ['Section / Table', 'Description', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'],
    rows: [
      ['3.1(a)', 'Outward taxable supplies', report.gstr3b.table31a.taxableValue.toFixed(2), report.gstr3b.table31a.igst.toFixed(2), report.gstr3b.table31a.cgst.toFixed(2), report.gstr3b.table31a.sgst.toFixed(2), report.gstr3b.table31a.cess.toFixed(2)],
      ['3.1(c)', 'Nil rated / exempted supplies', report.gstr3b.table31c.taxableValue.toFixed(2), '0.00', '0.00', '0.00', '0.00'],
      ['4(A)', 'Eligible ITC (Purchases)', '-', report.gstr3b.table4.igst.toFixed(2), report.gstr3b.table4.cgst.toFixed(2), report.gstr3b.table4.sgst.toFixed(2), report.gstr3b.table4.cess.toFixed(2)],
      ['5', 'Net Tax Payable (Output - ITC)', '-', report.gstr3b.netTaxPayable.igst.toFixed(2), report.gstr3b.netTaxPayable.cgst.toFixed(2), report.gstr3b.netTaxPayable.sgst.toFixed(2), '0.00'],
    ],
  });

  exportMultiSheetGstExcel(filename, sheets);
}

// Official GSTR-1 Offline Tool format JSON generator
export function generateGstr1Json(report: GstFilingReport): any {
  // Format period "MMYYYY" e.g. "102026"
  const [yearStr, monthStr] = report.periodKey.split('-');
  const fp = `${monthStr || '10'}${yearStr || '2026'}`;

  // Group B2B in GST offline tool schema: array of { ctin: string, inv: [...] }
  const b2b = report.gstr1.b2bGrouped.map(group => {
    return {
      ctin: group.gstin,
      inv: group.invoices.map((inv, idx) => ({
        inum: inv.invoiceNo.replace('#', ''),
        idt: inv.date,
        val: inv.invoiceValue,
        pos: inv.pos.slice(0, 2),
        rchrg: inv.rchrg,
        inv_typ: 'R',
        itms: [
          {
            num: idx + 1,
            itm_det: {
              rt: inv.rate,
              txval: inv.taxableValue,
              iamt: inv.igst,
              camt: inv.cgst,
              samt: inv.sgst,
              csamt: inv.cess,
            },
          },
        ],
      })),
    };
  });

  const b2cl = report.gstr1.b2cl.map((inv, idx) => ({
    pos: inv.pos.slice(0, 2),
    inv: [
      {
        inum: inv.invoiceNo.replace('#', ''),
        idt: inv.date,
        val: inv.invoiceValue,
        itms: [
          {
            num: idx + 1,
            itm_det: {
              rt: inv.rate,
              txval: inv.taxableValue,
              iamt: inv.igst,
              csamt: inv.cess,
            },
          },
        ],
      },
    ],
  }));

  const b2cs = report.gstr1.b2cs.map(item => ({
    sply_ty: item.igst > 0 ? 'INTER' : 'INTRA',
    pos: item.pos.slice(0, 2),
    typ: 'OE',
    rt: item.rate,
    txval: item.taxableValue,
    iamt: item.igst,
    camt: item.cgst,
    samt: item.sgst,
    csamt: item.cess,
  }));

  const hsn = {
    data: report.gstr1.hsn.map((h, i) => ({
      num: i + 1,
      hsn_sc: h.hsn,
      desc: h.description,
      uqc: h.uqc,
      qty: h.totalQty,
      val: h.totalValue,
      txval: h.taxableValue,
      iamt: h.igst,
      camt: h.cgst,
      samt: h.sgst,
      csamt: h.cess,
    })),
  };

  const doc_issue = {
    doc_det: [
      {
        doc_num: 1,
        doc_typ: 'Invoices for outward supply',
        docs: [
          {
            num: 1,
            from: report.gstr1.docSummary.fromNo,
            to: report.gstr1.docSummary.toNo,
            totnum: report.gstr1.docSummary.totalIssued,
            canc: report.gstr1.docSummary.cancelled,
            net_issue: report.gstr1.docSummary.netIssued,
          },
        ],
      },
    ],
  };

  return {
    gstin: report.businessGstin,
    fp,
    gt: 0,
    cur_gt: report.summary.totalInvoiceValue,
    version: 'GST_Offline_Tool',
    hash: 'hash',
    b2b,
    b2cl,
    b2cs,
    hsn,
    doc_issue,
  };
}

export function exportGstr1JsonFile(filename: string, report: GstFilingReport) {
  const json = generateGstr1Json(report);
  const jsonStr = JSON.stringify(json, null, 2);
  downloadBlob(new Blob([jsonStr], { type: 'application/json' }), filename);
}
