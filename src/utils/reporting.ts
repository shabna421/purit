import { Item, ItemCategory } from '../types';
import { format } from 'date-fns';

type CsvCell = string | number | boolean | null | undefined;

export interface InvoicePdfLineItem {
  description: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  hsnSac?: string;
}

export interface InvoicePdfData {
  organizationName: string;
  organizationSubtitle?: string;
  sellerName?: string;
  sellerAddress?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerGstin?: string;
  invoiceTitle?: string;
  invoiceNumber: string;
  currencyCode?: string;
  customerName: string;
  customerDetails?: string[];
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  detailRows: Array<{ label: string; value: string }>;
  items: InvoicePdfLineItem[];
  subtotal: number;
  taxLabel?: string;
  taxAmount?: number;
  total: number;
  paidAmount?: number;
  oldDueAmount?: number;
  currentBillAmount?: number;
  grandTotalAmount?: number;
  notes?: string;
  footerReference?: string;
}

export interface CustomerLedgerTransaction {
  date: number;
  invoiceNo: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount?: number;
  balance: number;
  type?: string;
  notes?: string;
  itemsFormatted?: string[];
}

export interface CustomerLedgerPdfData {
  organizationName: string;
  organizationSubtitle?: string;
  sellerAddress?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerGstin?: string;
  currencyCode?: string;
  customerName: string;
  customerShopName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  periodLabel: string;
  totalBilled: number;
  totalPaid: number;
  balanceDue: number;
  openingBalance?: number;
  transactions: CustomerLedgerTransaction[];
}


function escapeCsvCell(value: CsvCell) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadBlob(blob: Blob, filename: string) {
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

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');

  downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), filename);
}

function escapeXml(value: CsvCell) {
  const stringValue = value == null ? '' : String(value);
  return stringValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadExcelWorkbook(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CsvCell[][]
) {
  const headerRow = `<Row>${headers
    .map(
      (header) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`
    )
    .join('')}</Row>`;

  const bodyRows = rows
    .map(
      (row) => `<Row>${row
        .map((cell) => {
          const type = typeof cell === 'number' ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${escapeXml(cell)}</Data></Cell>`;
        })
        .join('')}</Row>`
    )
    .join('');

  const workbook = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#F4F4F5" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  downloadBlob(
    new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    filename
  );
}

function sanitizePdfText(value: string) {
  if (!value) return '';
  return value
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u20B9/g, 'Rs.')
    .replace(/\\/g, '')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function buildSimplePdfBlob(title: string, lines: string[]) {
  const pageHeight = 760;
  const lineHeight = 14;
  const maxLinesPerPage = Math.floor(pageHeight / lineHeight);
  const safeLines = [title, '', ...lines].map((line) => sanitizePdfText(line));
  const pages: string[][] = [];

  for (let index = 0; index < safeLines.length; index += maxLinesPerPage) {
    pages.push(safeLines.slice(index, index + maxLinesPerPage));
  }

  const objects: string[] = [];
  let pdf = '%PDF-1.4\n';

  const addObject = (content: string) => {
    objects.push(content);
    pdf += `${objects.length} 0 obj\n${content}\nendobj\n`;
    return objects.length;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [] /Count 0 >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageObjectIds: number[] = [];

  pages.forEach((pageLines) => {
    const contentLines = ['BT', '/F1 10 Tf', '50 790 Td'];
    pageLines.forEach((line, index) => {
      if (index === 0) {
        contentLines.push(`(${line}) Tj`);
      } else {
        contentLines.push('0 -14 Td');
        contentLines.push(`(${line}) Tj`);
      }
    });
    contentLines.push('ET');

    const stream = contentLines.join('\n');
    const contentObjectId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    pageObjectIds.push(pageObjectId);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  pdf = '%PDF-1.4\n';
  const rebuiltOffsets: number[] = [];
  objects.forEach((content, index) => {
    rebuiltOffsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  rebuiltOffsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadSimplePdf(filename: string, title: string, lines: string[]) {
  downloadBlob(buildSimplePdfBlob(title, lines), filename);
}

function fitPdfCell(value: CsvCell, width: number) {
  const stringValue = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (stringValue.length > width) {
    return `${stringValue.slice(0, Math.max(width - 1, 0))}`.padEnd(width, ' ');
  }
  return stringValue.padEnd(width, ' ');
}

export function downloadTablePdf(
  filename: string,
  title: string,
  summaryLines: string[],
  headers: string[],
  rows: CsvCell[][]
) {
  const columnWidths = headers.map((header, index) => {
    const contentWidth = rows.reduce((max, row) => {
      const length = String(row[index] ?? '').length;
      return Math.max(max, Math.min(length, 24));
    }, header.length);
    return Math.min(Math.max(contentWidth + 2, 10), 24);
  });

  const separator = columnWidths.map((width) => '-'.repeat(width)).join(' ');
  const tableLines = [
    headers.map((header, index) => fitPdfCell(header.toUpperCase(), columnWidths[index])).join(' '),
    separator,
    ...rows.map((row) =>
      row.map((cell, index) => fitPdfCell(cell, columnWidths[index])).join(' ')
    ),
  ];

  downloadSimplePdf(filename, title, [...summaryLines, '', ...tableLines]);
}

export function toAsciiCurrency(value: number, currencyCode = 'INR') {
  const code = (currencyCode === 'INR' || currencyCode === '₹' || !currencyCode) ? 'Rs.' : currencyCode;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${code} ${formatted}`;
}

export function toCompactCurrency(value: number, currencyCode = 'INR') {
  const code = (currencyCode === 'INR' || currencyCode === '₹' || !currencyCode) ? 'Rs.' : currencyCode;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${code} ${formatted}`;
}

export function toCleanNumber(value: number) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInvoiceQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function wrapInvoiceText(value: string, width: number) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= width) {
      current = word;
      return;
    }

    let remaining = word;
    while (remaining.length > width) {
      lines.push(remaining.slice(0, width - 1));
      remaining = remaining.slice(width - 1);
    }
    current = remaining;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function escapePdfString(value: string) {
  return sanitizePdfText(value);
}

function estimatePdfTextWidth(text: string, fontSize: number) {
  return escapePdfString(text).length * fontSize * 0.5;
}

function wrapPdfText(text: string, maxWidth: number, fontSize: number) {
  const safeText = escapePdfString(text).replace(/\s+/g, ' ').trim();
  if (!safeText) return [''];

  const words = safeText.split(' ');
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (estimatePdfTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (estimatePdfTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      return;
    }

    let remainder = word;
    const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.5)));
    while (remainder.length > maxChars) {
      lines.push(remainder.slice(0, maxChars));
      remainder = remainder.slice(maxChars);
    }
    current = remainder;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildPdfDocument(pageStreams: string[]) {
  const objects: string[] = [];

  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [] /Count 0 >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

  const pageObjectIds: number[] = [];

  pageStreams.forEach((stream) => {
    const contentObjectId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    pageObjectIds.push(pageObjectId);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((content, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function pdfNumberToWords(num: number): string {
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

function buildPremiumInvoicePdfBlob(data: InvoicePdfData) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const orangeColor = '1.0 0.45 0.0';
  const orangeLightBg = '1.0 0.968 0.93';
  const orangeLightBorder = '1.0 0.929 0.835';
  const grayLightBg = '0.98 0.98 0.98';
  const borderGray = '0.92 0.92 0.92';
  const borderSubtle = '0.95 0.95 0.95';
  const textDark = '0.11 0.13 0.16';
  const textMuted = '0.4 0.44 0.5';
  const textLight = '0.6 0.63 0.68';
  const currencyCode = data.currencyCode || 'INR';
  const pageStreams: string[] = [];
  let commands: string[] = [];
  let y = 0;

  const startPage = (continuation = false) => {
    commands = [];
    y = pageHeight - margin;

    // Draw Stockii Logo
    // Orange rounded box:
    commands.push(`${orangeColor} rg ${margin} ${pageHeight - margin - 38} 38 38 re f`);
    // White package icon:
    commands.push(`1.0 1.0 1.0 RG 1.5 w`);
    const cx = margin + 19;
    const cy = pageHeight - margin - 19;
    commands.push(`${cx - 10} ${cy + 6} m ${cx} ${cy + 12} l ${cx + 10} ${cy + 6} l ${cx + 10} ${cy - 6} l ${cx} ${cy - 12} l ${cx - 10} ${cy - 6} l ${cx - 10} ${cy + 6} l S`);
    commands.push(`${cx} ${cy - 12} m ${cx} ${cy} l S`);
    commands.push(`${cx} ${cy} m ${cx - 10} ${cy + 6} l S`);
    commands.push(`${cx} ${cy} m ${cx + 10} ${cy + 6} l S`);
    commands.push(`${cx} ${cy} m ${cx} ${cy + 12} l S`);

    // Brand text
    const brandName = data.organizationName || data.sellerName || 'Stockii Network';
    const brandTagline = data.organizationSubtitle;

    commands.push(`${textDark} rg`);
    if (brandTagline) {
      commands.push(`BT /F2 16 Tf ${margin + 50} ${pageHeight - margin - 18} Td (${escapePdfString(brandName)}) Tj ET`);
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 8.5 Tf ${margin + 50} ${pageHeight - margin - 32} Td (${escapePdfString(brandTagline)}) Tj ET`);
    } else {
      commands.push(`BT /F2 16 Tf ${margin + 50} ${pageHeight - margin - 24} Td (${escapePdfString(brandName)}) Tj ET`);
    }

    // Right Badge (GST TAX INVOICE)
    const badgeW = 160;
    const badgeH = 38;
    const badgeX = pageWidth - margin - badgeW;
    const badgeY = pageHeight - margin - badgeH;

    commands.push(`${orangeLightBg} rg ${badgeX} ${badgeY} ${badgeW} ${badgeH} re f`);
    commands.push(`${orangeLightBorder} RG 0.75 w ${badgeX} ${badgeY} ${badgeW} ${badgeH} re S`);
    
    const labelStr = 'GST TAX INVOICE';
    const labelW = estimatePdfTextWidth(labelStr, 8);
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F2 8 Tf ${badgeX + badgeW - 12 - labelW} ${badgeY + 23} Td (${labelStr}) Tj ET`);

    const invNumStr = data.invoiceNumber;
    const invNumW = estimatePdfTextWidth(invNumStr, 13);
    commands.push(`${orangeColor} rg`);
    commands.push(`BT /F2 13 Tf ${badgeX + badgeW - 12 - invNumW} ${badgeY + 7} Td (${escapePdfString(invNumStr)}) Tj ET`);

    if (!continuation) {
      // Info Grid Row (Invoice No. | Invoice Date | Place of Supply)
      const gridY = pageHeight - margin - 54;
      const gridH = 36;
      const gridW = pageWidth - margin * 2;
      const colW = gridW / 3;

      commands.push(`${grayLightBg} rg ${margin} ${gridY - gridH} ${gridW} ${gridH} re f`);
      commands.push(`${borderGray} RG 0.75 w`);
      commands.push(`${margin} ${gridY} m ${pageWidth - margin} ${gridY} l S`);
      commands.push(`${margin} ${gridY - gridH} m ${pageWidth - margin} ${gridY - gridH} l S`);
      commands.push(`${margin + colW} ${gridY - gridH} m ${margin + colW} ${gridY} l S`);
      commands.push(`${margin + colW * 2} ${gridY - gridH} m ${margin + colW * 2} ${gridY} l S`);

      // Column 1: Invoice No.
      commands.push(`${textLight} rg`);
      commands.push(`BT /F2 7.5 Tf ${margin + 12} ${gridY - 13} Td (INVOICE NO.) Tj ET`);
      commands.push(`${orangeColor} rg`);
      const invNoText = data.invoiceNumber.replace('#', '');
      commands.push(`BT /F2 10 Tf ${margin + 12} ${gridY - 27} Td (${escapePdfString(invNoText)}) Tj ET`);

      // Column 2: Invoice Date
      commands.push(`${textLight} rg`);
      commands.push(`BT /F2 7.5 Tf ${margin + colW + 12} ${gridY - 13} Td (INVOICE DATE) Tj ET`);
      commands.push(`${orangeColor} rg`);
      const dateVal = data.detailRows.find(r => r.label === 'Date')?.value || '';
      commands.push(`BT /F2 10 Tf ${margin + colW + 12} ${gridY - 27} Td (${escapePdfString(dateVal)}) Tj ET`);

      // Column 3: Place of Supply
      commands.push(`${textLight} rg`);
      commands.push(`BT /F2 7.5 Tf ${margin + colW * 2 + 12} ${gridY - 13} Td (PLACE OF SUPPLY) Tj ET`);
      commands.push(`${orangeColor} rg`);
      commands.push(`BT /F2 10 Tf ${margin + colW * 2 + 12} ${gridY - 27} Td (Kerala \\(32\\)) Tj ET`);

      // Seller & Bill To Cards Grid
      const cardTop = gridY - gridH - 16;
      const gap = 16;
      const cardWidth = (gridW - gap) / 2;
      const rx = margin + cardWidth + gap;
      const maxCardTextWidth = cardWidth - 24;

      // Process Seller Lines
      const sellerNameStr = data.sellerName || data.organizationName || 'Stockii Network';
      const sellerNameLines = wrapPdfText(sellerNameStr, maxCardTextWidth, 9.5);

      const effectiveSellerAddress = data.sellerAddress || 'Main Warehouse\nKozhikode, Kerala - 673631';
      const sellerAddrLines: string[] = [];
      effectiveSellerAddress.split('\n').forEach((line) => {
        if (line.trim()) {
          sellerAddrLines.push(...wrapPdfText(line.trim(), maxCardTextWidth, 8.5));
        }
      });

      const effectiveSellerPhone = data.sellerPhone || '+91 98765 43210';
      const sellerPhoneLines = effectiveSellerPhone ? wrapPdfText(`Phone: ${effectiveSellerPhone}`, maxCardTextWidth, 8.5) : [];

      const effectiveSellerEmail = data.sellerEmail || 'support@stockii.com';
      const sellerEmailLines = effectiveSellerEmail ? wrapPdfText(`Email: ${effectiveSellerEmail}`, maxCardTextWidth, 8.5) : [];

      const effectiveSellerGstin = data.sellerGstin || '32ABCDE1234F1Z5';
      const sellerGstinLines = effectiveSellerGstin ? wrapPdfText(`GSTIN: ${effectiveSellerGstin}`, maxCardTextWidth, 8.5) : [];

      let sellerHeight = 16 + 12;
      sellerHeight += sellerNameLines.length * 13 + 3;
      sellerHeight += sellerAddrLines.length * 11;
      sellerHeight += sellerPhoneLines.length * 11;
      sellerHeight += sellerEmailLines.length * 11;
      if (effectiveSellerGstin) {
        sellerHeight += sellerGstinLines.length * 11 + 12;
      } else {
        sellerHeight += 12;
      }

      // Process Bill To Lines
      const custNameStr = data.customerName || 'Walk-in Customer';
      const custNameLines = wrapPdfText(custNameStr, maxCardTextWidth, 9.5);

      const billToDetailLines: string[] = [];
      let custGstinStr: string | null = data.customerGstin || null;

      (data.customerDetails ?? []).forEach((line) => {
        if (!line || !line.trim()) return;
        if (line.startsWith('GSTIN:')) {
          custGstinStr = line.replace('GSTIN:', '').trim();
        } else {
          line.split('\n').forEach((subline) => {
            if (subline.trim()) {
              billToDetailLines.push(...wrapPdfText(subline.trim(), maxCardTextWidth, 8.5));
            }
          });
        }
      });

      if (data.customerPhone && !billToDetailLines.some(l => l.startsWith('Phone:'))) {
        billToDetailLines.push(...wrapPdfText(`Phone: ${data.customerPhone}`, maxCardTextWidth, 8.5));
      }
      if (data.customerEmail && !billToDetailLines.some(l => l.startsWith('Email:'))) {
        billToDetailLines.push(...wrapPdfText(`Email: ${data.customerEmail}`, maxCardTextWidth, 8.5));
      }

      const custGstinLines = custGstinStr ? wrapPdfText(`GSTIN: ${custGstinStr}`, maxCardTextWidth, 8.5) : [];

      let billToHeight = 16 + 12;
      billToHeight += custNameLines.length * 13 + 3;
      billToHeight += billToDetailLines.length * 11;
      if (custGstinStr) {
        billToHeight += custGstinLines.length * 11 + 12;
      } else {
        billToHeight += 12;
      }

      const cardHeight = Math.max(115, sellerHeight, billToHeight);
      const cardY = cardTop - cardHeight;

      // Draw Seller Card (Left)
      commands.push(`${orangeColor} rg ${margin} ${cardTop - 16} ${cardWidth} 16 re f`);
      commands.push(`1.0 1.0 1.0 rg`);
      commands.push(`BT /F2 7.5 Tf ${margin + 12} ${cardTop - 11} Td (SELLER) Tj ET`);
      commands.push(`${borderGray} RG 0.5 w ${margin} ${cardY} ${cardWidth} ${cardHeight} re S`);

      let sellerY = cardTop - 30;
      commands.push(`${textDark} rg`);
      sellerNameLines.forEach((line) => {
        commands.push(`BT /F2 9.5 Tf ${margin + 12} ${sellerY} Td (${escapePdfString(line)}) Tj ET`);
        sellerY -= 13;
      });
      sellerY -= 2;

      commands.push(`${textMuted} rg`);
      sellerAddrLines.forEach((line) => {
        commands.push(`BT /F1 8.5 Tf ${margin + 12} ${sellerY} Td (${escapePdfString(line)}) Tj ET`);
        sellerY -= 11;
      });

      sellerPhoneLines.forEach((line) => {
        commands.push(`BT /F1 8.5 Tf ${margin + 12} ${sellerY} Td (${escapePdfString(line)}) Tj ET`);
        sellerY -= 11;
      });

      sellerEmailLines.forEach((line) => {
        commands.push(`BT /F1 8.5 Tf ${margin + 12} ${sellerY} Td (${escapePdfString(line)}) Tj ET`);
        sellerY -= 11;
      });

      if (effectiveSellerGstin) {
        const gstinDividerY = cardY + (sellerGstinLines.length * 11) + 8;
        commands.push(`${borderSubtle} RG 0.5 w ${margin + 12} ${gstinDividerY} m ${margin + cardWidth - 12} ${gstinDividerY} l S`);
        commands.push(`${textDark} rg`);
        sellerGstinLines.forEach((line, idx) => {
          commands.push(`BT /F2 8.5 Tf ${margin + 12} ${gstinDividerY - 11 - (idx * 11)} Td (${escapePdfString(line)}) Tj ET`);
        });
      }

      // Draw Bill To Card (Right)
      commands.push(`${orangeColor} rg ${rx} ${cardTop - 16} ${cardWidth} 16 re f`);
      commands.push(`1.0 1.0 1.0 rg`);
      commands.push(`BT /F2 7.5 Tf ${rx + 12} ${cardTop - 11} Td (BILL TO) Tj ET`);
      commands.push(`${borderGray} RG 0.5 w ${rx} ${cardY} ${cardWidth} ${cardHeight} re S`);

      let billToY = cardTop - 30;
      commands.push(`${textDark} rg`);
      custNameLines.forEach((line) => {
        commands.push(`BT /F2 9.5 Tf ${rx + 12} ${billToY} Td (${escapePdfString(line)}) Tj ET`);
        billToY -= 13;
      });
      billToY -= 2;

      commands.push(`${textMuted} rg`);
      billToDetailLines.forEach((line) => {
        commands.push(`BT /F1 8.5 Tf ${rx + 12} ${billToY} Td (${escapePdfString(line)}) Tj ET`);
        billToY -= 11;
      });

      if (custGstinStr) {
        const gstinDividerY = cardY + (custGstinLines.length * 11) + 8;
        commands.push(`${borderSubtle} RG 0.5 w ${rx + 12} ${gstinDividerY} m ${rx + cardWidth - 12} ${gstinDividerY} l S`);
        commands.push(`${textDark} rg`);
        custGstinLines.forEach((line, idx) => {
          commands.push(`BT /F2 8.5 Tf ${rx + 12} ${gstinDividerY - 11 - (idx * 11)} Td (${escapePdfString(line)}) Tj ET`);
        });
      }

      y = cardY - 20;
    } else {
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F3 10 Tf ${margin} ${pageHeight - 156} Td (Continued invoice details) Tj ET`);
      y = pageHeight - 176;
    }

    // Draw Table Header Banner
    const tableWidth = pageWidth - margin * 2;
    commands.push(`${orangeColor} rg ${margin} ${y - 20} ${tableWidth} 20 re f`);
    commands.push(`1.0 1.0 1.0 rg`);
    commands.push(`BT /F2 7.5 Tf ${margin + 12} ${y - 13} Td (#) Tj ET`);
    commands.push(`BT /F2 7.5 Tf ${margin + 40} ${y - 13} Td (DESCRIPTION) Tj ET`);
    
    const hsnHeaderStr = 'HSN/SAC';
    const hsnHeaderW = estimatePdfTextWidth(hsnHeaderStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${margin + 260 - hsnHeaderW / 2} ${y - 13} Td (${hsnHeaderStr}) Tj ET`);

    const qtyHeaderStr = 'QTY';
    const qtyHeaderW = estimatePdfTextWidth(qtyHeaderStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${margin + 330 - qtyHeaderW} ${y - 13} Td (${qtyHeaderStr}) Tj ET`);

    const priceHeaderStr = 'UNIT PRICE (INR)';
    const priceHeaderW = estimatePdfTextWidth(priceHeaderStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${margin + 420 - priceHeaderW} ${y - 13} Td (${priceHeaderStr}) Tj ET`);

    const totalHeaderStr = 'TOTAL (INR)';
    const totalHeaderW = estimatePdfTextWidth(totalHeaderStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${pageWidth - margin - 12 - totalHeaderW} ${y - 13} Td (${totalHeaderStr}) Tj ET`);
    
    y -= 26;
  };

  const finishPage = () => {
    pageStreams.push(commands.join('\n'));
  };

  startPage(false);

  data.items.forEach((item, index) => {
    const descriptionLines = wrapPdfText(item.description, 200, 9.5);
    const rowHeight = Math.max(24, descriptionLines.length * 13 + 6);

    if (y - rowHeight < 200) {
      finishPage();
      startPage(true);
    }

    // Draw border line below row
    commands.push(`${borderSubtle} RG 0.5 w ${margin} ${y - rowHeight + 2} m ${pageWidth - margin} ${y - rowHeight + 2} l S`);

    // Index (#)
    commands.push(`${textLight} rg`);
    commands.push(`BT /F1 8.5 Tf ${margin + 12} ${y - 13} Td (${index + 1}) Tj ET`);

    // Description lines
    let lineY = y - 13;
    descriptionLines.forEach((line) => {
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 9 Tf ${margin + 40} ${lineY} Td (${escapePdfString(line)}) Tj ET`);
      lineY -= 13;
    });

    const hsnText = item.hsnSac || '8414';
    const qtyText = formatInvoiceQuantity(item.quantity);
    const priceText = toCompactCurrency(item.unitPrice, currencyCode);
    const totalText = toCompactCurrency(item.subtotal, currencyCode);

    // HSN code (centered at margin + 260)
    const hsnWidth = estimatePdfTextWidth(hsnText, 8.5);
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F1 8.5 Tf ${margin + 260 - hsnWidth / 2} ${y - 13} Td (${escapePdfString(hsnText)}) Tj ET`);

    // Qty (Right aligned to margin + 330)
    const qtyWidth = estimatePdfTextWidth(qtyText, 9);
    commands.push(`${textDark} rg`);
    commands.push(`BT /F2 9 Tf ${margin + 330 - qtyWidth} ${y - 13} Td (${escapePdfString(qtyText)}) Tj ET`);

    // Price (Right aligned to margin + 420)
    const priceWidth = estimatePdfTextWidth(priceText, 8.5);
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F1 8.5 Tf ${margin + 420 - priceWidth} ${y - 13} Td (${escapePdfString(priceText)}) Tj ET`);

    // Total (Right aligned to pageWidth - margin - 12)
    const totalWidth = estimatePdfTextWidth(totalText, 9);
    commands.push(`${textDark} rg`);
    commands.push(`BT /F2 9 Tf ${pageWidth - margin - 12 - totalWidth} ${y - 13} Td (${escapePdfString(totalText)}) Tj ET`);

    y -= rowHeight;
  });

  // Check if we need a new page for totals and footer
  if (y < 310) {
    finishPage();
    startPage(true);
  }

  // Draw Calculation and Payment Summary on the Right Side
  const totalsWidth = 230;
  const totalsX = pageWidth - margin - totalsWidth;
  
  // Tax calculations
  const taxRate = data.taxAmount && data.taxAmount > 0 ? 18 : 0;
  const halfTaxRate = taxRate / 2;
  const cgstAmount = (data.taxAmount || 0) / 2;
  const sgstAmount = (data.taxAmount || 0) / 2;
  const taxAmountVal = data.taxAmount || 0;
  const grandTotal = data.total;

  let totalsY = y - 80;
  
  // Calculation Card Box
  commands.push(`${grayLightBg} rg ${totalsX} ${totalsY} ${totalsWidth} 75 re f`);
  commands.push(`${borderGray} RG 0.5 w ${totalsX} ${totalsY} ${totalsWidth} 75 re S`);
  
  commands.push(`${textMuted} rg`);
  commands.push(`BT /F1 9 Tf ${totalsX + 12} ${totalsY + 56} Td (Subtotal) Tj ET`);
  const subtotalStr = toAsciiCurrency(data.subtotal, currencyCode);
  const subtotalWidth = estimatePdfTextWidth(subtotalStr, 9);
  commands.push(`${textDark} rg`);
  commands.push(`BT /F2 9 Tf ${totalsX + totalsWidth - 12 - subtotalWidth} ${totalsY + 56} Td (${escapePdfString(subtotalStr)}) Tj ET`);

  commands.push(`${textMuted} rg`);
  commands.push(`BT /F1 8.5 Tf ${totalsX + 12} ${totalsY + 42} Td (CGST \\(${halfTaxRate}%\\)) Tj ET`);
  const cgstStr = toAsciiCurrency(cgstAmount, currencyCode);
  const cgstWidth = estimatePdfTextWidth(cgstStr, 8.5);
  commands.push(`BT /F1 8.5 Tf ${totalsX + totalsWidth - 12 - cgstWidth} ${totalsY + 42} Td (${escapePdfString(cgstStr)}) Tj ET`);

  commands.push(`BT /F1 8.5 Tf ${totalsX + 12} ${totalsY + 28} Td (SGST \\(${halfTaxRate}%\\)) Tj ET`);
  const sgstStr = toAsciiCurrency(sgstAmount, currencyCode);
  const sgstWidth = estimatePdfTextWidth(sgstStr, 8.5);
  commands.push(`BT /F1 8.5 Tf ${totalsX + totalsWidth - 12 - sgstWidth} ${totalsY + 28} Td (${escapePdfString(sgstStr)}) Tj ET`);

  commands.push(`${borderSubtle} RG 0.5 w ${totalsX + 12} ${totalsY + 20} m ${totalsX + totalsWidth - 12} ${totalsY + 20} l S`);

  commands.push(`${orangeColor} rg`);
  commands.push(`BT /F2 9 Tf ${totalsX + 12} ${totalsY + 8} Td (Total Tax \\(${taxRate}%\\)) Tj ET`);
  const taxStr = toAsciiCurrency(taxAmountVal, currencyCode);
  const taxWidth = estimatePdfTextWidth(taxStr, 9);
  commands.push(`BT /F2 9 Tf ${totalsX + totalsWidth - 12 - taxWidth} ${totalsY + 8} Td (${escapePdfString(taxStr)}) Tj ET`);

  // Grand Total banner
  const gtY = totalsY - 30;
  commands.push(`${orangeColor} rg ${totalsX} ${gtY} ${totalsWidth} 26 re f`);
  commands.push(`1.0 1.0 1.0 rg`);
  commands.push(`BT /F2 9.5 Tf ${totalsX + 12} ${gtY + 9} Td (GRAND TOTAL) Tj ET`);
  const gtStr = toAsciiCurrency(grandTotal, currencyCode);
  const gtWidth = estimatePdfTextWidth(gtStr, 11);
  commands.push(`BT /F2 11 Tf ${totalsX + totalsWidth - 12 - gtWidth} ${gtY + 9} Td (${escapePdfString(gtStr)}) Tj ET`);

  // Payment Summary box:
  const oldDue = data.oldDueAmount || 0;
  const currentBill = data.currentBillAmount ?? grandTotal;
  const grandPayable = data.grandTotalAmount ?? (oldDue + currentBill);
  const paidVal = data.paidAmount ?? grandTotal;
  const balDue = Math.max(grandTotal - paidVal, 0);

  const psHeight = 108;
  const psY = gtY - 12 - psHeight;
  
  commands.push(`1.0 1.0 1.0 rg ${totalsX} ${psY} ${totalsWidth} ${psHeight} re f`);
  commands.push(`${borderGray} RG 0.5 w ${totalsX} ${psY} ${totalsWidth} ${psHeight} re S`);
  
  commands.push(`${orangeColor} rg`);
  commands.push(`BT /F2 8 Tf ${totalsX + 12} ${psY + 92} Td (PAYMENT SUMMARY) Tj ET`);

  commands.push(`${textMuted} rg`);
  commands.push(`BT /F1 8.5 Tf ${totalsX + 12} ${psY + 76} Td (Paid Amount) Tj ET`);
  const paidStr = toAsciiCurrency(paidVal, currencyCode);
  const paidWidth = estimatePdfTextWidth(paidStr, 8.5);
  commands.push(`BT /F1 8.5 Tf ${totalsX + totalsWidth - 12 - paidWidth} ${psY + 76} Td (${escapePdfString(paidStr)}) Tj ET`);

  commands.push(`${orangeColor} rg`);
  commands.push(`BT /F2 9 Tf ${totalsX + 12} ${psY + 61} Td (Balance Due) Tj ET`);
  const balStr = toAsciiCurrency(balDue, currencyCode);
  const balWidth = estimatePdfTextWidth(balStr, 9);
  commands.push(`BT /F2 9 Tf ${totalsX + totalsWidth - 12 - balWidth} ${psY + 61} Td (${escapePdfString(balStr)}) Tj ET`);

  commands.push(`${borderSubtle} RG 0.5 w ${totalsX + 12} ${psY + 53} m ${totalsX + totalsWidth - 12} ${psY + 53} l S`);

  commands.push(`${textLight} rg`);
  commands.push(`BT /F1 8 Tf ${totalsX + 12} ${psY + 39} Td (Old Due Amount) Tj ET`);
  const oldDueStr = toAsciiCurrency(oldDue, currencyCode);
  const oldDueWidth = estimatePdfTextWidth(oldDueStr, 8);
  commands.push(`BT /F1 8 Tf ${totalsX + totalsWidth - 12 - oldDueWidth} ${psY + 39} Td (${escapePdfString(oldDueStr)}) Tj ET`);

  commands.push(`BT /F1 8 Tf ${totalsX + 12} ${psY + 27} Td (Current Bill Amount) Tj ET`);
  const curBillStr = toAsciiCurrency(currentBill, currencyCode);
  const curBillWidth = estimatePdfTextWidth(curBillStr, 8);
  commands.push(`BT /F1 8 Tf ${totalsX + totalsWidth - 12 - curBillWidth} ${psY + 27} Td (${escapePdfString(curBillStr)}) Tj ET`);

  commands.push(`${borderSubtle} RG 0.5 w ${totalsX + 12} ${psY + 19} m ${totalsX + totalsWidth - 12} ${psY + 19} l S`);

  commands.push(`${textDark} rg`);
  commands.push(`BT /F2 9 Tf ${totalsX + 12} ${psY + 7} Td (Grand Total) Tj ET`);
  const gpStr = toAsciiCurrency(grandPayable, currencyCode);
  const gpWidth = estimatePdfTextWidth(gpStr, 9);
  commands.push(`BT /F2 9 Tf ${totalsX + totalsWidth - 12 - gpWidth} ${psY + 7} Td (${escapePdfString(gpStr)}) Tj ET`);

  // Full-width Amount in Words box below Payment Summary
  const wordsBoxWidth = pageWidth - margin * 2;
  const wordsBoxHeight = 34;
  const wordsBoxX = margin;
  const wordsBoxY = psY - 14 - wordsBoxHeight;

  commands.push(`${orangeLightBg} rg ${wordsBoxX} ${wordsBoxY} ${wordsBoxWidth} ${wordsBoxHeight} re f`);
  commands.push(`${orangeLightBorder} RG 0.75 w ${wordsBoxX} ${wordsBoxY} ${wordsBoxWidth} ${wordsBoxHeight} re S`);

  // Document Icon
  commands.push(`${orangeColor} RG 1 w`);
  const ix = wordsBoxX + 12;
  const iy = wordsBoxY + 9;
  commands.push(`${ix} ${iy} m ${ix + 8} ${iy} l ${ix + 12} ${iy + 4} l ${ix + 12} ${iy + 16} l ${ix} ${iy + 16} l ${ix} ${iy} l S`);
  commands.push(`${ix + 8} ${iy} m ${ix + 8} ${iy + 4} l ${ix + 12} ${iy + 4} l S`);
  commands.push(`${ix + 3} ${iy + 12} m ${ix + 9} ${iy + 12} l S`);
  commands.push(`${ix + 3} ${iy + 9} m ${ix + 9} ${iy + 9} l S`);
  commands.push(`${ix + 3} ${iy + 6} m ${ix + 7} ${iy + 6} l S`);

  // Text inside Words Box
  const labelX = wordsBoxX + 32;
  const labelText = "Amount in Words: ";
  const labelWidth = estimatePdfTextWidth(labelText, 8.5);

  commands.push(`${orangeColor} rg`);
  commands.push(`BT /F2 8.5 Tf ${labelX} ${wordsBoxY + 13} Td (${labelText}) Tj ET`);

  commands.push(`${textDark} rg`);
  const wordsText = pdfNumberToWords(grandPayable);
  const maxTextWidth = wordsBoxWidth - 32 - labelWidth - 12;
  const wordsWrapped = wrapPdfText(wordsText, maxTextWidth, 8.5);

  if (wordsWrapped.length <= 1) {
    commands.push(`BT /F1 8.5 Tf ${labelX + labelWidth} ${wordsBoxY + 13} Td (${escapePdfString(wordsText)}) Tj ET`);
  } else {
    commands.push(`BT /F1 8.5 Tf ${labelX + labelWidth} ${wordsBoxY + 18} Td (${escapePdfString(wordsWrapped[0])}) Tj ET`);
    commands.push(`BT /F1 8.5 Tf ${labelX + labelWidth} ${wordsBoxY + 8} Td (${escapePdfString(wordsWrapped[1])}) Tj ET`);
  }

  // Footer section
  const footerY = wordsBoxY - 24;
  commands.push(`${borderGray} RG 0.5 w ${margin} ${footerY + 14} m ${pageWidth - margin} ${footerY + 14} l S`);

  commands.push(`${textLight} rg`);
  commands.push(`BT /F3 9.5 Tf ${margin} ${footerY} Td (Thank you for your business.) Tj ET`);
  if (data.footerReference) {
    const refStr = `Reference: ${data.footerReference}`;
    const refWidth = estimatePdfTextWidth(refStr, 8);
    commands.push(`BT /F1 8 Tf ${pageWidth - margin - refWidth} ${footerY} Td (${escapePdfString(refStr)}) Tj ET`);
  }

  finishPage();
  return buildPdfDocument(pageStreams);
}

export function createInvoicePdfBlob(data: InvoicePdfData) {
  return buildPremiumInvoicePdfBlob(data);
}

export function downloadInvoicePdf(filename: string, data: InvoicePdfData) {
  downloadBlob(createInvoicePdfBlob(data), filename);
}
function buildCustomerLedgerPdfBlob(data: CustomerLedgerPdfData) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 30;

  const orangeColor = '1.0 0.45 0.0';
  const orangeLightBg = '1.0 0.965 0.93';
  const orangeLightBorder = '1.0 0.92 0.83';
  const redColor = '0.85 0.20 0.15';
  const redLightBg = '1.0 0.94 0.93';
  const redLightBorder = '0.92 0.70 0.65';
  const greenColor = '0.08 0.55 0.24';
  const grayLightBg = '0.98 0.98 0.98';
  const borderGray = '0.88 0.89 0.91';
  const borderSubtle = '0.898 0.906 0.921';
  const textDark = '0.11 0.13 0.16';
  const textMuted = '0.42 0.45 0.50';
  const textLight = '0.60 0.63 0.68';
  const currencyCode = data.currencyCode || 'INR';

  const pageStreams: string[] = [];
  let commands: string[] = [];
  let y = 0;

  const startPage = (continuation = false) => {
    commands = [];
    y = pageHeight - margin;

    // Header Top Left: Dynamic Store Name & Tagline
    const storeName = data.organizationName || 'Stockii Store';
    const tagline = data.organizationSubtitle || 'smart inventory management';

    commands.push(`${textDark} rg`);
    commands.push(`BT /F2 15 Tf ${margin} ${pageHeight - margin - 15} Td (${escapePdfString(storeName)}) Tj ET`);
    if (tagline) {
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 8.5 Tf ${margin} ${pageHeight - margin - 29} Td (${escapePdfString(tagline)}) Tj ET`);
    }

    // Header Top Right: "CUSTOMER LEDGER", "SALES SUMMARY", & Selected Period Badge
    const badgeW = 210;
    const badgeH = 48;
    const badgeX = pageWidth - margin - badgeW;
    const badgeY = pageHeight - margin - badgeH;

    commands.push(`${orangeLightBg} rg ${badgeX} ${badgeY} ${badgeW} ${badgeH} re f`);
    commands.push(`${orangeLightBorder} RG 0.75 w ${badgeX} ${badgeY} ${badgeW} ${badgeH} re S`);
    
    const titleStr = continuation ? 'CUSTOMER LEDGER (Cont.)' : 'CUSTOMER LEDGER';
    const titleW = estimatePdfTextWidth(titleStr, 11.5);
    commands.push(`${orangeColor} rg`);
    commands.push(`BT /F2 11.5 Tf ${badgeX + badgeW / 2 - titleW / 2} ${badgeY + 32} Td (${titleStr}) Tj ET`);

    const subStr = 'SALES SUMMARY';
    const subW = estimatePdfTextWidth(subStr, 7.5);
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F2 7.5 Tf ${badgeX + badgeW / 2 - subW / 2} ${badgeY + 19} Td (${subStr}) Tj ET`);

    const periodStr = `Period: ${data.periodLabel}`;
    const periodW = estimatePdfTextWidth(periodStr, 7.5);
    commands.push(`BT /F1 7.5 Tf ${badgeX + badgeW / 2 - periodW / 2} ${badgeY + 7} Td (${escapePdfString(periodStr)}) Tj ET`);

    if (!continuation) {
      // Prominent Customer Header Card
      const custY = pageHeight - margin - 58;
      const custH = 46;
      const custW = pageWidth - margin * 2;

      commands.push(`${grayLightBg} rg ${margin} ${custY - custH} ${custW} ${custH} re f`);
      commands.push(`${borderGray} RG 0.5 w ${margin} ${custY - custH} ${custW} ${custH} re S`);
      // Accent vertical bar on left of customer box
      commands.push(`${orangeColor} rg ${margin} ${custY - custH} 4 ${custH} re f`);

      commands.push(`${textMuted} rg`);
      commands.push(`BT /F2 7.5 Tf ${margin + 12} ${custY - 13} Td (CUSTOMER) Tj ET`);
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 12 Tf ${margin + 12} ${custY - 27} Td (${escapePdfString(data.customerName)}) Tj ET`);

      const detailsList: string[] = [];
      if (data.customerShopName) detailsList.push(`Shop: ${data.customerShopName}`);
      if (data.customerPhone) detailsList.push(`Phone: ${data.customerPhone}`);
      if (data.customerGstin) detailsList.push(`GSTIN: ${data.customerGstin}`);
      if (data.customerAddress) detailsList.push(`Addr: ${data.customerAddress.replace(/\n/g, ', ')}`);
      
      const detailsStr = detailsList.join('   |   ');
      if (detailsStr) {
        commands.push(`${textMuted} rg`);
        commands.push(`BT /F1 8 Tf ${margin + 12} ${custY - 39} Td (${escapePdfString(detailsStr)}) Tj ET`);
      }

      y = custY - custH - 16;
    } else {
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F3 9 Tf ${margin} ${pageHeight - 52} Td (Continued customer ledger statement - ${escapePdfString(data.customerName)}) Tj ET`);
      y = pageHeight - 70;
    }

    // Ledger Table Header (7 Columns)
    // Table width = 535
    // Column widths: # (20), Date (95), Invoice No. (80), Items (160), Amount (Rs.) (60), Paid (Rs.) (60), Due (Rs.) (60)
    const tableWidth = pageWidth - margin * 2;
    commands.push(`${orangeColor} rg ${margin} ${y - 20} ${tableWidth} 20 re f`);
    commands.push(`1.0 1.0 1.0 rg`);

    commands.push(`BT /F2 7.5 Tf ${margin + 4} ${y - 13} Td (#) Tj ET`);
    commands.push(`BT /F2 7.5 Tf ${margin + 20 + 4} ${y - 13} Td (DATE) Tj ET`);
    commands.push(`BT /F2 7.5 Tf ${margin + 20 + 95 + 4} ${y - 13} Td (INVOICE NO.) Tj ET`);
    commands.push(`BT /F2 7.5 Tf ${margin + 20 + 95 + 80 + 4} ${y - 13} Td (ITEMS) Tj ET`);

    const amtHStr = `AMOUNT (Rs.)`;
    const amtHW = estimatePdfTextWidth(amtHStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 - 4 - amtHW} ${y - 13} Td (${amtHStr}) Tj ET`);

    const paidHStr = `PAID (Rs.)`;
    const paidHW = estimatePdfTextWidth(paidHStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 + 60 - 4 - paidHW} ${y - 13} Td (${paidHStr}) Tj ET`);

    const dueHStr = `DUE (Rs.)`;
    const dueHW = estimatePdfTextWidth(dueHStr, 7.5);
    commands.push(`BT /F2 7.5 Tf ${pageWidth - margin - 4 - dueHW} ${y - 13} Td (${dueHStr}) Tj ET`);

    y -= 24;
  };

  const finishPage = () => {
    pageStreams.push(commands.join('\n'));
  };

  startPage(false);

  // Render Opening Balance row if applicable
  if (data.openingBalance && data.openingBalance !== 0) {
    const obRowHeight = 26;
    commands.push(`${grayLightBg} rg ${margin} ${y - obRowHeight} ${pageWidth - margin * 2} ${obRowHeight} re f`);
    commands.push(`${borderSubtle} RG 0.75 w ${margin} ${y - obRowHeight} m ${pageWidth - margin} ${y - obRowHeight} l S`);

    commands.push(`${textMuted} rg`);
    commands.push(`BT /F2 8.5 Tf ${margin + 4} ${y - 17} Td (-) Tj ET`);
    commands.push(`BT /F2 8.5 Tf ${margin + 20 + 4} ${y - 17} Td (${escapePdfString(data.periodLabel.split(' - ')[0] || '-')}) Tj ET`);
    commands.push(`BT /F2 8.5 Tf ${margin + 20 + 95 + 4} ${y - 17} Td (-) Tj ET`);
    commands.push(`BT /F2 8.5 Tf ${margin + 20 + 95 + 80 + 4} ${y - 17} Td (OPENING BALANCE) Tj ET`);

    const obAmtStr = toCleanNumber(data.openingBalance);
    const obAmtW = estimatePdfTextWidth(obAmtStr, 8.5);
    commands.push(`${textDark} rg`);
    commands.push(`BT /F2 8.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 - 4 - obAmtW} ${y - 17} Td (${escapePdfString(obAmtStr)}) Tj ET`);

    // Paid (-)
    const dashW = estimatePdfTextWidth('-', 8.5);
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F1 8.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 + 60 - 4 - dashW} ${y - 17} Td (-) Tj ET`);

    // Due
    commands.push(`${redColor} rg`);
    commands.push(`BT /F2 8.5 Tf ${pageWidth - margin - 4 - obAmtW} ${y - 17} Td (${escapePdfString(obAmtStr)}) Tj ET`);

    y -= obRowHeight;
  }

  if (data.transactions.length === 0) {
    const emptyRowH = 30;
    commands.push(`${textMuted} rg`);
    commands.push(`BT /F1 9 Tf ${margin + 10} ${y - 20} Td (No transactions recorded in this date period.) Tj ET`);
    commands.push(`${borderSubtle} RG 0.75 w ${margin} ${y - emptyRowH} m ${pageWidth - margin} ${y - emptyRowH} l S`);
    y -= emptyRowH;
  } else {
    data.transactions.forEach((tx, idx) => {
      // Process items lines for Column 4
      const rawItemLines: string[] = [];
      if (tx.itemsFormatted && tx.itemsFormatted.length > 0) {
        tx.itemsFormatted.forEach((it) => {
          rawItemLines.push(...wrapPdfText(it, 150, 8));
        });
      } else {
        const fall = tx.notes && tx.notes !== '-' ? tx.notes : (tx.type || 'Transaction');
        rawItemLines.push(...wrapPdfText(fall, 150, 8));
      }

      const lineCount = Math.max(1, rawItemLines.length);
      const rowHeight = Math.max(32, 14 + lineCount * 13);

      if (y - rowHeight < 110) {
        finishPage();
        startPage(true);
      }

      // Bottom border for table row (border-bottom: 1px solid #e5e7eb)
      commands.push(`${borderSubtle} RG 0.75 w ${margin} ${y - rowHeight} m ${pageWidth - margin} ${y - rowHeight} l S`);

      // 1. # Index
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 8.5 Tf ${margin + 4} ${y - 14} Td (${idx + 1}) Tj ET`);

      // 2. Date and Time vertically stacked
      const dateStr = format(tx.date, 'dd MMM yyyy');
      const timeStr = format(tx.date, 'HH:mm');
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 8 Tf ${margin + 20 + 4} ${y - 14} Td (${escapePdfString(dateStr)}) Tj ET`);
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 7.5 Tf ${margin + 20 + 4} ${y - 25} Td (${escapePdfString(timeStr)}) Tj ET`);

      // 3. Invoice No.
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 8 Tf ${margin + 20 + 95 + 4} ${y - 14} Td (${escapePdfString(tx.invoiceNo)}) Tj ET`);

      // 4. Items (Stacked lines)
      let itemY = y - 14;
      rawItemLines.forEach((itemLine) => {
        commands.push(`${textDark} rg`);
        commands.push(`BT /F1 8 Tf ${margin + 20 + 95 + 80 + 4} ${itemY} Td (${escapePdfString(itemLine)}) Tj ET`);
        itemY -= 13;
      });

      // 5. Amount (Rs.)
      const amtStr = tx.totalAmount > 0 ? toCleanNumber(tx.totalAmount) : '-';
      const amtW = estimatePdfTextWidth(amtStr, 8.5);
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 8.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 - 4 - amtW} ${y - 14} Td (${escapePdfString(amtStr)}) Tj ET`);

      // 6. Paid (Rs.) (Green text when > 0, else muted '-')
      const paidStr = tx.paidAmount > 0 ? toCleanNumber(tx.paidAmount) : '-';
      const paidW = estimatePdfTextWidth(paidStr, 8.5);
      if (tx.paidAmount > 0) {
        commands.push(`${greenColor} rg`);
        commands.push(`BT /F2 8.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 + 60 - 4 - paidW} ${y - 14} Td (${escapePdfString(paidStr)}) Tj ET`);
      } else {
        commands.push(`${textMuted} rg`);
        commands.push(`BT /F1 8.5 Tf ${margin + 20 + 95 + 80 + 160 + 60 + 60 - 4 - paidW} ${y - 14} Td (${escapePdfString(paidStr)}) Tj ET`);
      }

      // 7. Due (Rs.) (Red text when > 0, else '0.00' muted)
      const dueVal = tx.dueAmount !== undefined ? tx.dueAmount : Math.max(0, tx.totalAmount - tx.paidAmount);
      const dueStr = toCleanNumber(dueVal);
      const dueW = estimatePdfTextWidth(dueStr, 8.5);
      if (dueVal > 0) {
        commands.push(`${redColor} rg`);
        commands.push(`BT /F2 8.5 Tf ${pageWidth - margin - 4 - dueW} ${y - 14} Td (${escapePdfString(dueStr)}) Tj ET`);
      } else {
        commands.push(`${textMuted} rg`);
        commands.push(`BT /F1 8.5 Tf ${pageWidth - margin - 4 - dueW} ${y - 14} Td (${escapePdfString(dueStr)}) Tj ET`);
      }

      y -= rowHeight;
    });
  }

  // Check space for Summary Card section
  const sumSectionH = 65;
  if (y - sumSectionH < 50) {
    finishPage();
    startPage(true);
  }

  y -= 15;

  // Prominent Summary Cards
  const gridW = pageWidth - margin * 2;
  const cardGap = 12;
  const c1W = 160;
  const c2W = 160;
  const c3W = gridW - c1W - c2W - cardGap * 2;

  // Card 1: TOTAL BILLED
  commands.push(`${grayLightBg} rg ${margin} ${y - 48} ${c1W} 48 re f`);
  commands.push(`${borderGray} RG 0.5 w ${margin} ${y - 48} ${c1W} 48 re S`);
  commands.push(`${textMuted} rg`);
  commands.push(`BT /F2 7.5 Tf ${margin + 10} ${y - 14} Td (TOTAL BILLED) Tj ET`);
  commands.push(`${textDark} rg`);
  const tbStr = toAsciiCurrency(data.totalBilled, currencyCode);
  commands.push(`BT /F2 11 Tf ${margin + 10} ${y - 34} Td (${escapePdfString(tbStr)}) Tj ET`);

  // Card 2: TOTAL PAID
  const c2X = margin + c1W + cardGap;
  commands.push(`${grayLightBg} rg ${c2X} ${y - 48} ${c2W} 48 re f`);
  commands.push(`${borderGray} RG 0.5 w ${c2X} ${y - 48} ${c2W} 48 re S`);
  commands.push(`${textMuted} rg`);
  commands.push(`BT /F2 7.5 Tf ${c2X + 10} ${y - 14} Td (TOTAL PAID) Tj ET`);
  commands.push(`${greenColor} rg`);
  const tpStr = toAsciiCurrency(data.totalPaid, currencyCode);
  commands.push(`BT /F2 11 Tf ${c2X + 10} ${y - 34} Td (${escapePdfString(tpStr)}) Tj ET`);

  // Card 3: FINAL DUE AMOUNT (Prominent Highlighted Card!)
  const c3X = c2X + c2W + cardGap;
  commands.push(`${redLightBg} rg ${c3X} ${y - 48} ${c3W} 48 re f`);
  commands.push(`${redLightBorder} RG 1.0 w ${c3X} ${y - 48} ${c3W} 48 re S`);
  commands.push(`${redColor} rg`);
  commands.push(`BT /F2 8 Tf ${c3X + 10} ${y - 14} Td (FINAL DUE AMOUNT) Tj ET`);
  const bdStr = toAsciiCurrency(data.balanceDue, currencyCode);
  commands.push(`BT /F2 13 Tf ${c3X + 10} ${y - 35} Td (${escapePdfString(bdStr)}) Tj ET`);

  y -= 65;

  const footerY = Math.max(y, 40);
  commands.push(`${borderGray} RG 0.5 w ${margin} ${footerY + 14} m ${pageWidth - margin} ${footerY + 14} l S`);

  commands.push(`${textLight} rg`);
  commands.push(`BT /F3 8.5 Tf ${margin} ${footerY} Td (Thank you for your business.) Tj ET`);
  const genStr = `Generated on ${format(new Date(), 'dd MMM yyyy, HH:mm')} - ${data.organizationName || 'Stockii'}`;
  const genW = estimatePdfTextWidth(genStr, 8);
  commands.push(`BT /F1 8 Tf ${pageWidth - margin - genW} ${footerY} Td (${escapePdfString(genStr)}) Tj ET`);

  finishPage();
  return buildPdfDocument(pageStreams);
}

export function createCustomerLedgerPdfBlob(data: CustomerLedgerPdfData) {
  return buildCustomerLedgerPdfBlob(data);
}

export function downloadCustomerLedgerPdf(filename: string, data: CustomerLedgerPdfData) {
  downloadBlob(createCustomerLedgerPdfBlob(data), filename);
}

export function printPdfBlob(blob: Blob, fallbackFilename = 'document.pdf') {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  document.body.appendChild(frame);

  const cleanup = () => {
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };

  frame.onload = () => {
    window.setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        cleanup();
      } catch {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win) {
          downloadBlob(blob, fallbackFilename);
        }
        cleanup();
      }
    }, 400);
  };
}

export function printHtml(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=980,height=760');
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #18181b; margin: 24px; }
          h1 { margin: 0 0 8px; }
          p { margin: 0 0 10px; color: #52525b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #d4d4d8; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f4f4f5; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
          .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
          .card { border: 1px solid #e4e4e7; border-radius: 12px; padding: 12px; min-width: 180px; }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);

  win.document.close();
  const triggerPrint = () => {
    win.focus();
    window.setTimeout(() => {
      win.print();
    }, 250);
  };

  if (win.document.readyState === 'complete') {
    triggerPrint();
    return;
  }

  win.onload = triggerPrint;
}

function buildLandscapePdfDocument(pageStreams: string[]) {
  const objects: string[] = [];

  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [] /Count 0 >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

  const pageObjectIds: number[] = [];

  pageStreams.forEach((stream) => {
    const contentObjectId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    pageObjectIds.push(pageObjectId);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((content, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function buildInventoryPdfBlob(orgName: string, items: Item[], categories: ItemCategory[] = []) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 30;

  const textDark = '0.129 0.141 0.161';
  const textMuted = '0.420 0.455 0.518';
  const tableHeaderBg = '0.965 0.969 0.976';
  const borderGray = '0.871 0.886 0.914';
  const accentColor = '0.976 0.616 0.231';
  const redAlert = '0.85 0.15 0.15';

  // 1. Sort all items alphabetically from A to Z by name
  const sortedItems = [...items].sort((a, b) => {
    const nameA = (a.name || '').trim();
    const nameB = (b.name || '').trim();
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  const N = sortedItems.length;
  const lowStockCount = sortedItems.filter(item => item.currentStock <= (item.reorderThreshold ?? 5)).length;

  // Determine number of columns (C) based on inventory size
  let C = 3;
  if (N <= 15) C = 1;
  else if (N <= 35) C = 2;
  else C = 3;

  const totalTableWidth = pageWidth - margin * 2;
  const colGap = 15;
  const singleColWidth = (totalTableWidth - (C - 1) * colGap) / C;

  const wSKU = singleColWidth * 0.18;
  const wName = singleColWidth * 0.44;
  const wCat = singleColWidth * 0.23;
  const wStock = singleColWidth * 0.15;

  const rowHeight = 15;
  const fontSize = 8;
  const headerFontSize = 8.5;
  const tableHeaderHeight = 18;

  // Page 1 geometry
  const headerHeightP1 = 55;
  const tableTopYP1 = pageHeight - margin - headerHeightP1;
  const usableHeightP1 = tableTopYP1 - tableHeaderHeight - margin;
  const rowsPerColP1 = Math.max(5, Math.floor(usableHeightP1 / rowHeight));
  const itemsPerPage1 = C * rowsPerColP1;

  // Page 2+ geometry (continuation pages)
  const headerHeightP2 = 32;
  const tableTopYP2 = pageHeight - margin - headerHeightP2;
  const usableHeightP2 = tableTopYP2 - tableHeaderHeight - margin;
  const rowsPerColP2 = Math.max(5, Math.floor(usableHeightP2 / rowHeight));
  const itemsPerPage2 = C * rowsPerColP2;

  // Calculate total pages needed to fit all items with 0 items missing
  let totalPages = 1;
  if (N > itemsPerPage1) {
    const remaining = N - itemsPerPage1;
    totalPages = 1 + Math.ceil(remaining / itemsPerPage2);
  }

  const pageStreams: string[] = [];
  let itemIndex = 0;

  for (let p = 0; p < totalPages; p++) {
    const isFirstPage = p === 0;
    const tableTopY = isFirstPage ? tableTopYP1 : tableTopYP2;
    const rowsPerCol = isFirstPage ? rowsPerColP1 : rowsPerColP2;

    const commands: string[] = [];

    // Accent header bar
    commands.push(`${accentColor} rg 0 ${pageHeight - 6} ${pageWidth} 6 re f`);

    if (isFirstPage) {
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 18 Tf ${margin} ${pageHeight - 30} Td (${escapePdfString(orgName)}) Tj ET`);
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 9 Tf ${margin} ${pageHeight - 44} Td (INVENTORY STATUS REPORT - Generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}) Tj ET`);

      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 9.5 Tf ${pageWidth - margin - 160} ${pageHeight - 30} Td (TOTAL ITEMS: ${N}) Tj ET`);
      commands.push(`${redAlert} rg`);
      commands.push(`BT /F2 9.5 Tf ${pageWidth - margin - 160} ${pageHeight - 44} Td (LOW STOCK ALERTS: ${lowStockCount}) Tj ET`);
    } else {
      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 13 Tf ${margin} ${pageHeight - 26} Td (${escapePdfString(orgName)} - INVENTORY STATUS REPORT (Cont.)) Tj ET`);
      commands.push(`${textMuted} rg`);
      commands.push(`BT /F1 9 Tf ${pageWidth - margin - 120} ${pageHeight - 26} Td (Page ${p + 1} of ${totalPages}) Tj ET`);
    }

    for (let c = 0; c < C; c++) {
      const colLeft = margin + c * (singleColWidth + colGap);
      const colRight = colLeft + singleColWidth;

      commands.push(`${tableHeaderBg} rg ${colLeft} ${tableTopY - tableHeaderHeight} ${singleColWidth} ${tableHeaderHeight} re f`);
      commands.push(`${borderGray} RG 0.5 w ${colLeft} ${tableTopY - tableHeaderHeight} m ${colRight} ${tableTopY - tableHeaderHeight} l S`);
      commands.push(`${colLeft} ${tableTopY} m ${colRight} ${tableTopY} l S`);

      commands.push(`${textDark} rg`);
      commands.push(`BT /F2 ${headerFontSize} Tf ${colLeft + 4} ${tableTopY - tableHeaderHeight + 5} Td (SKU) Tj ET`);
      commands.push(`BT /F2 ${headerFontSize} Tf ${colLeft + wSKU + 4} ${tableTopY - tableHeaderHeight + 5} Td (ITEM NAME) Tj ET`);
      commands.push(`BT /F2 ${headerFontSize} Tf ${colLeft + wSKU + wName + 4} ${tableTopY - tableHeaderHeight + 5} Td (CAT) Tj ET`);
      commands.push(`BT /F2 ${headerFontSize} Tf ${colLeft + wSKU + wName + wCat + 4} ${tableTopY - tableHeaderHeight + 5} Td (STOCK) Tj ET`);

      for (let r = 0; r < rowsPerCol; r++) {
        if (itemIndex >= N) break;

        const item = sortedItems[itemIndex];
        itemIndex++;

        const categoryName = categories.find(cat => cat.id === item.categoryId)?.name || 'Default';
        const isLow = item.currentStock <= (item.reorderThreshold ?? 5);

        const yPos = tableTopY - tableHeaderHeight - (r + 1) * rowHeight;

        commands.push(`${borderGray} RG 0.3 w ${colLeft} ${yPos} m ${colRight} ${yPos} l S`);

        commands.push(`${textMuted} rg`);
        const skuText = item.sku || 'N/A';
        commands.push(`BT /F1 ${fontSize} Tf ${colLeft + 4} ${yPos + 3.5} Td (${escapePdfString(skuText.slice(0, 10))}) Tj ET`);

        if (isLow) {
          commands.push(`${redAlert} rg`);
        } else {
          commands.push(`${textDark} rg`);
        }
        const font = isLow ? '/F2' : '/F1';
        const displayName = item.name || '';
        commands.push(`BT ${font} ${fontSize} Tf ${colLeft + wSKU + 4} ${yPos + 3.5} Td (${escapePdfString(displayName.slice(0, 24))}) Tj ET`);

        commands.push(`${textMuted} rg`);
        commands.push(`BT /F1 ${fontSize} Tf ${colLeft + wSKU + wName + 4} ${yPos + 3.5} Td (${escapePdfString(categoryName.slice(0, 12))}) Tj ET`);

        if (isLow) {
          commands.push(`${redAlert} rg`);
        } else {
          commands.push(`${textDark} rg`);
        }
        const stockFont = isLow ? '/F2' : '/F1';
        commands.push(`BT ${stockFont} ${fontSize} Tf ${colLeft + wSKU + wName + wCat + 4} ${yPos + 3.5} Td (${escapePdfString(String(item.currentStock))}) Tj ET`);
      }
    }

    commands.push(`${textMuted} rg`);
    commands.push(`BT /F1 8 Tf ${margin} ${margin - 12} Td (Page ${p + 1} of ${totalPages} - Complete Inventory Catalog) Tj ET`);

    pageStreams.push(commands.join('\n'));
  }

  return buildLandscapePdfDocument(pageStreams);
}
