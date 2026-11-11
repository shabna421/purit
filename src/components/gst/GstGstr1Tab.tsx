import React, { useState } from 'react';
import { Copy, Download, Building, Users, ShoppingBag, FileSpreadsheet, RotateCcw, Files, Check } from 'lucide-react';
import {
  GstFilingReport,
  formatIndianCurrency,
  formatIndianNumber,
  copyTableAsTsv,
  exportTableToCsv,
} from '../../utils/gstUtils';
import { GstCopyButton } from './GstCopyButton';
import { Link } from 'react-router-dom';

interface GstGstr1TabProps {
  report: GstFilingReport;
}

type Gstr1Section = 'b2b' | 'b2cl' | 'b2cs' | 'hsn' | 'cdnr' | 'docs';

export const GstGstr1Tab: React.FC<GstGstr1TabProps> = ({ report }) => {
  const [activeSection, setActiveSection] = useState<Gstr1Section>('b2b');
  const [hsnFilter, setHsnFilter] = useState<'all' | 'b2b' | 'b2c'>('all');

  const { gstr1, periodKey } = report;

  // --- Handlers for Copy / Export per section ---

  const handleCopyB2b = () => {
    const headers = ['GSTIN of Customer', 'Customer Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Reverse Charge', 'Rate (%)', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'];
    const rows = gstr1.b2b.map(i => [
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
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportB2bCsv = () => {
    const headers = ['GSTIN of Customer', 'Customer Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Reverse Charge', 'Rate (%)', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'];
    const rows = gstr1.b2b.map(i => [
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
    ]);
    exportTableToCsv(`GSTR1_B2B_${periodKey}.csv`, headers, rows);
  };

  const handleCopyB2cl = () => {
    const headers = ['Invoice No', 'Date', 'Customer Name', 'Invoice Value', 'Place of Supply', 'Rate (%)', 'Taxable Value', 'IGST', 'Cess'];
    const rows = gstr1.b2cl.map(i => [
      i.invoiceNo,
      i.date,
      i.customerName,
      i.invoiceValue.toFixed(2),
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportB2clCsv = () => {
    const headers = ['Invoice No', 'Date', 'Customer Name', 'Invoice Value', 'Place of Supply', 'Rate (%)', 'Taxable Value', 'IGST', 'Cess'];
    const rows = gstr1.b2cl.map(i => [
      i.invoiceNo,
      i.date,
      i.customerName,
      i.invoiceValue.toFixed(2),
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
    ]);
    exportTableToCsv(`GSTR1_B2CLarge_${periodKey}.csv`, headers, rows);
  };

  const handleCopyB2cs = () => {
    const headers = ['Place of Supply', 'Rate (%)', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total Value'];
    const rows = gstr1.b2cs.map(i => [
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportB2csCsv = () => {
    const headers = ['Place of Supply', 'Rate (%)', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total Value'];
    const rows = gstr1.b2cs.map(i => [
      i.pos,
      `${i.rate}%`,
      i.taxableValue.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.igst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
    ]);
    exportTableToCsv(`GSTR1_B2CSmall_${periodKey}.csv`, headers, rows);
  };

  const filteredHsn = gstr1.hsn.filter(item => {
    if (hsnFilter === 'b2b') return item.isB2b;
    if (hsnFilter === 'b2c') return !item.isB2b;
    return true;
  });

  const handleCopyHsn = () => {
    const headers = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Taxable Value', 'Rate (%)', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'Type'];
    const rows = filteredHsn.map(i => [
      i.hsn,
      i.description,
      i.uqc,
      i.totalQty.toString(),
      i.taxableValue.toFixed(2),
      `${i.rate}%`,
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
      i.isB2b ? 'B2B' : 'B2C',
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportHsnCsv = () => {
    const headers = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Taxable Value', 'Rate (%)', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Value', 'Type'];
    const rows = filteredHsn.map(i => [
      i.hsn,
      i.description,
      i.uqc,
      i.totalQty.toString(),
      i.taxableValue.toFixed(2),
      `${i.rate}%`,
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
      i.totalValue.toFixed(2),
      i.isB2b ? 'B2B' : 'B2C',
    ]);
    exportTableToCsv(`GSTR1_HSN_Summary_${periodKey}.csv`, headers, rows);
  };

  const handleCopyCdnr = () => {
    const headers = ['Note No', 'Date', 'Original Invoice', 'Customer Name', 'Customer GSTIN', 'Registered', 'Note Value', 'Taxable Value', 'Rate (%)', 'IGST', 'CGST', 'SGST', 'Cess'];
    const rows = gstr1.cdnr.map(i => [
      i.noteNo,
      i.date,
      i.originalInvoiceNo,
      i.customerName,
      i.customerGstin || 'Unregistered',
      i.isRegistered ? 'Yes' : 'No',
      i.noteValue.toFixed(2),
      i.taxableValue.toFixed(2),
      `${i.rate}%`,
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportCdnrCsv = () => {
    const headers = ['Note No', 'Date', 'Original Invoice', 'Customer Name', 'Customer GSTIN', 'Registered', 'Note Value', 'Taxable Value', 'Rate (%)', 'IGST', 'CGST', 'SGST', 'Cess'];
    const rows = gstr1.cdnr.map(i => [
      i.noteNo,
      i.date,
      i.originalInvoiceNo,
      i.customerName,
      i.customerGstin || 'Unregistered',
      i.isRegistered ? 'Yes' : 'No',
      i.noteValue.toFixed(2),
      i.taxableValue.toFixed(2),
      `${i.rate}%`,
      i.igst.toFixed(2),
      i.cgst.toFixed(2),
      i.sgst.toFixed(2),
      i.cess.toFixed(2),
    ]);
    exportTableToCsv(`GSTR1_CDNR_${periodKey}.csv`, headers, rows);
  };

  const handleCopyDocs = () => {
    const headers = ['Nature of Document', 'From Serial No', 'To Serial No', 'Total Issued', 'Cancelled', 'Net Issued'];
    const rows = [[
      gstr1.docSummary.nature,
      gstr1.docSummary.fromNo,
      gstr1.docSummary.toNo,
      gstr1.docSummary.totalIssued.toString(),
      gstr1.docSummary.cancelled.toString(),
      gstr1.docSummary.netIssued.toString(),
    ]];
    copyTableAsTsv(headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Pills */}
      <div className="flex gap-2 p-1.5 bg-zinc-100 rounded-2xl overflow-x-auto border border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveSection('b2b')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'b2b' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>4A - B2B Invoices</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/70 text-zinc-800">
            {gstr1.b2b.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('b2cl')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'b2cl' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>5A - B2C Large</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/70 text-zinc-800">
            {gstr1.b2cl.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('b2cs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'b2cs' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>7 - B2C Small</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/70 text-zinc-800">
            {gstr1.b2cs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('hsn')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'hsn' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>12 - HSN Summary</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/70 text-zinc-800">
            {gstr1.hsn.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('cdnr')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'cdnr' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>9B - Credit/Debit Notes</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200/70 text-zinc-800">
            {gstr1.cdnr.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('docs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSection === 'docs' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Files className="w-3.5 h-3.5" />
          <span>13 - Document Series</span>
        </button>
      </div>

      {/* Section Content */}

      {/* 1. B2B SECTION */}
      {activeSection === 'b2b' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 4A, 4B, 6B, 6C - B2B Invoices</h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded-full">
                  Registered Customers
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Supplies to registered persons with valid GSTIN. Grouped by Customer GSTIN with invoice-level breakdowns.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyB2b}
                disabled={gstr1.b2b.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
                title="Copy entire table to paste in Excel"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
              <button
                onClick={handleExportB2bCsv}
                disabled={gstr1.b2b.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
                title="Export B2B invoices as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {gstr1.b2bGrouped.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No B2B sales with registered customer GSTIN found in this period.
            </div>
          ) : (
            <div className="space-y-6">
              {gstr1.b2bGrouped.map((group) => (
                <div key={group.gstin} className="border border-zinc-200/90 rounded-xl overflow-hidden shadow-xs">
                  {/* Customer Group Header */}
                  <div className="bg-zinc-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900 text-sm">{group.customerName}</span>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-white border border-zinc-300 rounded text-zinc-800">
                            {group.gstin}
                          </span>
                          <GstCopyButton value={group.gstin} label="GSTIN" size="sm" />
                        </div>
                      </div>
                    </div>
                    {/* Customer Subtotals Pill */}
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-zinc-500">Taxable: </span>
                        <strong className="text-zinc-900">{formatIndianCurrency(group.subtotalTaxable)}</strong>
                        <GstCopyButton value={group.subtotalTaxable.toFixed(2)} label="Subtotal Taxable" size="sm" />
                      </div>
                      <div>
                        <span className="text-zinc-500">Total Tax: </span>
                        <strong className="text-emerald-700">
                          {formatIndianCurrency(group.subtotalIgst + group.subtotalCgst + group.subtotalSgst)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-zinc-500">Invoice Value: </span>
                        <strong className="text-zinc-900">{formatIndianCurrency(group.subtotalValue)}</strong>
                        <GstCopyButton value={group.subtotalValue.toFixed(2)} label="Subtotal Value" size="sm" />
                      </div>
                    </div>
                  </div>

                  {/* Customer Invoices Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50/50 text-zinc-500 font-bold uppercase border-b border-zinc-100">
                        <tr>
                          <th className="py-2.5 px-3">Invoice No</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Place of Supply</th>
                          <th className="py-2.5 px-3 text-center">RCHRG</th>
                          <th className="py-2.5 px-3 text-center">Rate</th>
                          <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                          <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                          <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                          <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                          <th className="py-2.5 px-3 text-right">Invoice Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-800">
                        {group.invoices.map((inv) => (
                          <tr key={`${inv.invoiceNo}-${inv.rate}`} className="hover:bg-zinc-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-zinc-900">
                              <div className="flex items-center gap-1">
                                <Link
                                  to={`/sales/${inv.saleId}/invoice`}
                                  target="_blank"
                                  className="text-orange-600 hover:underline font-mono"
                                >
                                  #{inv.invoiceNo}
                                </Link>
                                <GstCopyButton value={inv.invoiceNo} label="Invoice No" size="sm" />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-600 whitespace-nowrap">{inv.date}</td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="font-mono text-zinc-700">{inv.pos}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-zinc-600">{inv.rchrg}</td>
                            <td className="py-2.5 px-3 text-center font-bold">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800">{inv.rate}%</span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatIndianCurrency(inv.taxableValue)}</span>
                                <GstCopyButton value={inv.taxableValue.toFixed(2)} label="Taxable Value" size="sm" />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatIndianCurrency(inv.igst)}</span>
                                {inv.igst > 0 && <GstCopyButton value={inv.igst.toFixed(2)} label="IGST" size="sm" />}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatIndianCurrency(inv.cgst)}</span>
                                {inv.cgst > 0 && <GstCopyButton value={inv.cgst.toFixed(2)} label="CGST" size="sm" />}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatIndianCurrency(inv.sgst)}</span>
                                {inv.sgst > 0 && <GstCopyButton value={inv.sgst.toFixed(2)} label="SGST" size="sm" />}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <span>{formatIndianCurrency(inv.invoiceValue)}</span>
                                <GstCopyButton value={inv.invoiceValue.toFixed(2)} label="Invoice Value" size="sm" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. B2C LARGE SECTION */}
      {activeSection === 'b2cl' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 5A, 5B - B2C (Large) Invoices</h3>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-xs rounded-full">
                  Inter-state &gt; ₹1,00,000 Unregistered
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Inter-state supplies to unregistered customers where invoice value exceeds ₹1,00,000. Must be reported invoice-wise.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyB2cl}
                disabled={gstr1.b2cl.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
              <button
                onClick={handleExportB2clCsv}
                disabled={gstr1.b2cl.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {gstr1.b2cl.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No B2C Large invoices (inter-state sales over ₹1,00,000 to unregistered customers) in this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                  <tr>
                    <th className="py-3 px-3">Invoice No</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Place of Supply</th>
                    <th className="py-3 px-3 text-center">Rate</th>
                    <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                    <th className="py-3 px-3 text-right">IGST (₹)</th>
                    <th className="py-3 px-3 text-right">Invoice Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {gstr1.b2cl.map((inv) => (
                    <tr key={inv.invoiceNo} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-3 font-semibold text-zinc-900">
                        <div className="flex items-center gap-1">
                          <Link to={`/sales/${inv.saleId}/invoice`} target="_blank" className="text-orange-600 hover:underline font-mono">
                            #{inv.invoiceNo}
                          </Link>
                          <GstCopyButton value={inv.invoiceNo} label="Invoice No" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 whitespace-nowrap">{inv.date}</td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800">{inv.customerName}</td>
                      <td className="py-2.5 px-3 font-mono">{inv.pos}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-bold">{inv.rate}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(inv.taxableValue)}</span>
                          <GstCopyButton value={inv.taxableValue.toFixed(2)} label="Taxable" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-purple-700 font-semibold whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(inv.igst)}</span>
                          <GstCopyButton value={inv.igst.toFixed(2)} label="IGST" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(inv.invoiceValue)}</span>
                          <GstCopyButton value={inv.invoiceValue.toFixed(2)} label="Invoice Value" size="sm" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. B2C SMALL SECTION */}
      {activeSection === 'b2cs' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 7 - B2C (Small) Details</h3>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full">
                  Summarized by POS + Rate
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                All retail unregistered sales (intra-state and inter-state ≤ ₹1 Lakh). Summarized by Place of Supply and GST Rate.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyB2cs}
                disabled={gstr1.b2cs.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
              <button
                onClick={handleExportB2csCsv}
                disabled={gstr1.b2cs.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {gstr1.b2cs.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No B2C Small sales in this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                  <tr>
                    <th className="py-3 px-3">Place of Supply (POS)</th>
                    <th className="py-3 px-3 text-center">Rate</th>
                    <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                    <th className="py-3 px-3 text-right">CGST (₹)</th>
                    <th className="py-3 px-3 text-right">SGST (₹)</th>
                    <th className="py-3 px-3 text-right">IGST (₹)</th>
                    <th className="py-3 px-3 text-right">Cess (₹)</th>
                    <th className="py-3 px-3 text-right">Total Invoice Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {gstr1.b2cs.map((row) => (
                    <tr key={`${row.pos}-${row.rate}`} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-3 font-semibold text-zinc-900 font-mono">
                        <div className="flex items-center gap-1">
                          <span>{row.pos}</span>
                          <GstCopyButton value={row.pos} label="POS" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-bold">{row.rate}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.taxableValue)}</span>
                          <GstCopyButton value={row.taxableValue.toFixed(2)} label="Taxable Value" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.cgst)}</span>
                          <GstCopyButton value={row.cgst.toFixed(2)} label="CGST" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.sgst)}</span>
                          <GstCopyButton value={row.sgst.toFixed(2)} label="SGST" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.igst)}</span>
                          <GstCopyButton value={row.igst.toFixed(2)} label="IGST" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.cess)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(row.totalValue)}</span>
                          <GstCopyButton value={row.totalValue.toFixed(2)} label="Total Value" size="sm" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. HSN SUMMARY SECTION */}
      {activeSection === 'hsn' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 12 - HSN-wise Summary of Outward Supplies</h3>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Grouped by HSN/SAC Code and Rate. Mandatory for all GST returns.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Filter toggle B2B vs B2C */}
              <div className="flex items-center p-1 bg-zinc-100 rounded-xl border border-zinc-200 text-xs">
                <button
                  type="button"
                  onClick={() => setHsnFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    hsnFilter === 'all' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  All ({gstr1.hsn.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHsnFilter('b2b')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    hsnFilter === 'b2b' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  B2B Only ({gstr1.hsn.filter(i => i.isB2b).length})
                </button>
                <button
                  type="button"
                  onClick={() => setHsnFilter('b2c')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    hsnFilter === 'b2c' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  B2C Only ({gstr1.hsn.filter(i => !i.isB2b).length})
                </button>
              </div>

              <button
                onClick={handleCopyHsn}
                disabled={filteredHsn.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
              <button
                onClick={handleExportHsnCsv}
                disabled={filteredHsn.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {filteredHsn.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No HSN lines found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                  <tr>
                    <th className="py-3 px-3">HSN/SAC</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3 text-center">UQC</th>
                    <th className="py-3 px-3 text-right">Total Qty</th>
                    <th className="py-3 px-3 text-center">Rate</th>
                    <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                    <th className="py-3 px-3 text-right">IGST (₹)</th>
                    <th className="py-3 px-3 text-right">CGST (₹)</th>
                    <th className="py-3 px-3 text-right">SGST (₹)</th>
                    <th className="py-3 px-3 text-right">Total Value (₹)</th>
                    <th className="py-3 px-3 text-center">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredHsn.map((item, idx) => (
                    <tr key={`${item.hsn}-${item.rate}-${item.isB2b}-${idx}`} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">
                        <div className="flex items-center gap-1">
                          <span>{item.hsn}</span>
                          <GstCopyButton value={item.hsn} label="HSN" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-800 font-medium max-w-xs truncate" title={item.description}>
                        {item.description}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{item.uqc}</td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <span>{item.totalQty}</span>
                          <GstCopyButton value={item.totalQty.toString()} label="Qty" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-bold">{item.rate}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(item.taxableValue)}</span>
                          <GstCopyButton value={item.taxableValue.toFixed(2)} label="Taxable" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(item.igst)}</span>
                          {item.igst > 0 && <GstCopyButton value={item.igst.toFixed(2)} label="IGST" size="sm" />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(item.cgst)}</span>
                          {item.cgst > 0 && <GstCopyButton value={item.cgst.toFixed(2)} label="CGST" size="sm" />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(item.sgst)}</span>
                          {item.sgst > 0 && <GstCopyButton value={item.sgst.toFixed(2)} label="SGST" size="sm" />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(item.totalValue)}</span>
                          <GstCopyButton value={item.totalValue.toFixed(2)} label="Total Value" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.isB2b ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.isB2b ? 'B2B' : 'B2C'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. CREDIT / DEBIT NOTES SECTION */}
      {activeSection === 'cdnr' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 9B - Credit / Debit Notes</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
                  Customer Returns
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Sales returns issued during this tax period.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCdnr}
                disabled={gstr1.cdnr.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
              <button
                onClick={handleExportCdnrCsv}
                disabled={gstr1.cdnr.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {gstr1.cdnr.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              No sales returns or credit notes recorded in this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                  <tr>
                    <th className="py-3 px-3">Note No</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Orig Invoice</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">GSTIN</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="py-3 px-3 text-right">Note Value (₹)</th>
                    <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                    <th className="py-3 px-3 text-right">Tax (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {gstr1.cdnr.map((note) => (
                    <tr key={note.noteNo} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">{note.noteNo}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600">{note.date}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-700">{note.originalInvoiceNo}</td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800">{note.customerName}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-600">
                        {note.customerGstin || <span className="text-zinc-400 italic">Unregistered</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Credit (C)</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(note.noteValue)}</span>
                          <GstCopyButton value={note.noteValue.toFixed(2)} label="Note Value" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(note.taxableValue)}</span>
                          <GstCopyButton value={note.taxableValue.toFixed(2)} label="Taxable" size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <span>{formatIndianCurrency(note.igst + note.cgst + note.sgst)}</span>
                          <GstCopyButton value={(note.igst + note.cgst + note.sgst).toFixed(2)} label="Tax" size="sm" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 6. DOCUMENT SUMMARY SECTION */}
      {activeSection === 'docs' && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 text-lg">Table 13 - Documents Issued During the Tax Period</h3>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Outward tax invoice numbering sequence, total issued, cancelled, and net count for reconciliation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyDocs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Table
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                <tr>
                  <th className="py-3 px-3">Nature of Document</th>
                  <th className="py-3 px-3 text-center">From Serial No</th>
                  <th className="py-3 px-3 text-center">To Serial No</th>
                  <th className="py-3 px-3 text-right">Total Issued</th>
                  <th className="py-3 px-3 text-right">Cancelled</th>
                  <th className="py-3 px-3 text-right">Net Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <tr className="hover:bg-zinc-50/60">
                  <td className="py-3 px-3 font-semibold text-zinc-900">
                    {gstr1.docSummary.nature}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-zinc-800">
                    <div className="flex items-center justify-center gap-1">
                      <span>{gstr1.docSummary.fromNo}</span>
                      <GstCopyButton value={gstr1.docSummary.fromNo} label="From No" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-zinc-800">
                    <div className="flex items-center justify-center gap-1">
                      <span>{gstr1.docSummary.toNo}</span>
                      <GstCopyButton value={gstr1.docSummary.toNo} label="To No" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-zinc-900">
                    <div className="flex items-center justify-end gap-1">
                      <span>{gstr1.docSummary.totalIssued}</span>
                      <GstCopyButton value={gstr1.docSummary.totalIssued.toString()} label="Total Issued" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-red-600">
                    <div className="flex items-center justify-end gap-1">
                      <span>{gstr1.docSummary.cancelled}</span>
                      <GstCopyButton value={gstr1.docSummary.cancelled.toString()} label="Cancelled" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-emerald-700">
                    <div className="flex items-center justify-end gap-1">
                      <span>{gstr1.docSummary.netIssued}</span>
                      <GstCopyButton value={gstr1.docSummary.netIssued.toString()} label="Net Issued" size="sm" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

