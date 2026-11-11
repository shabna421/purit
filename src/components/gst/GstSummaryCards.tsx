import React from 'react';
import { FileText, Calculator, Landmark, ShieldAlert, ArrowUpRight, Copy, Download } from 'lucide-react';
import { GstFilingReport, formatIndianCurrency, formatIndianNumber, copyTableAsTsv, exportTableToCsv } from '../../utils/gstUtils';
import { GstCopyButton } from './GstCopyButton';

interface GstSummaryCardsProps {
  report: GstFilingReport;
}

export const GstSummaryCards: React.FC<GstSummaryCardsProps> = ({ report }) => {
  const { summary } = report;

  const handleCopyRateTable = () => {
    const headers = ['Rate (%)', 'Taxable Value (₹)', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Cess (₹)', 'Total Tax (₹)', 'Invoice Value (₹)', 'Bill Count'];
    const rows = summary.rateWiseBreakdown.map(r => [
      `${r.rate}%`,
      r.taxableValue.toFixed(2),
      r.cgst.toFixed(2),
      r.sgst.toFixed(2),
      r.igst.toFixed(2),
      r.cess.toFixed(2),
      r.totalTax.toFixed(2),
      r.invoiceValue.toFixed(2),
      r.billCount.toString(),
    ]);
    // Add total row
    rows.push([
      'Total',
      summary.totalTaxableValue.toFixed(2),
      summary.totalCgst.toFixed(2),
      summary.totalSgst.toFixed(2),
      summary.totalIgst.toFixed(2),
      summary.totalCess.toFixed(2),
      summary.totalTax.toFixed(2),
      summary.totalInvoiceValue.toFixed(2),
      summary.totalBillsCount.toString(),
    ]);

    copyTableAsTsv(headers, rows);
  };

  const handleExportRateCsv = () => {
    const headers = ['Rate (%)', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total Tax', 'Invoice Value', 'Bill Count'];
    const rows = summary.rateWiseBreakdown.map(r => [
      `${r.rate}%`,
      r.taxableValue.toFixed(2),
      r.cgst.toFixed(2),
      r.sgst.toFixed(2),
      r.igst.toFixed(2),
      r.cess.toFixed(2),
      r.totalTax.toFixed(2),
      r.invoiceValue.toFixed(2),
      r.billCount.toString(),
    ]);
    rows.push([
      'Total',
      summary.totalTaxableValue.toFixed(2),
      summary.totalCgst.toFixed(2),
      summary.totalSgst.toFixed(2),
      summary.totalIgst.toFixed(2),
      summary.totalCess.toFixed(2),
      summary.totalTax.toFixed(2),
      summary.totalInvoiceValue.toFixed(2),
      summary.totalBillsCount.toString(),
    ]);

    exportTableToCsv(`GST_Rate_Summary_${report.periodKey}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* 6 Metric Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total GST Bills */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">GST Invoices</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-zinc-900 tracking-tight">{summary.totalBillsCount}</span>
            <GstCopyButton value={summary.totalBillsCount.toString()} label="Bills Count" />
          </div>
          <p className="mt-1 text-xs text-zinc-400">Bills with active tax in this period</p>
        </div>

        {/* Total Taxable Value */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Taxable Value</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Calculator className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-zinc-900 tracking-tight">
              {formatIndianCurrency(summary.totalTaxableValue)}
            </span>
            <GstCopyButton value={summary.totalTaxableValue.toFixed(2)} label="Taxable Value" />
          </div>
          <p className="mt-1 text-xs text-zinc-400">Net sales before GST</p>
        </div>

        {/* Total CGST + SGST (Intra-state) */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">CGST + SGST</span>
            <span className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <Landmark className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-orange-600 tracking-tight">
              {formatIndianCurrency(summary.totalCgst + summary.totalSgst)}
            </span>
            <GstCopyButton value={(summary.totalCgst + summary.totalSgst).toFixed(2)} label="CGST + SGST" />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-1">
              <span>CGST:</span>
              <span className="font-semibold text-zinc-700">{formatIndianCurrency(summary.totalCgst)}</span>
              <GstCopyButton value={summary.totalCgst.toFixed(2)} label="CGST" size="sm" />
            </div>
            <div className="flex items-center gap-1">
              <span>SGST:</span>
              <span className="font-semibold text-zinc-700">{formatIndianCurrency(summary.totalSgst)}</span>
              <GstCopyButton value={summary.totalSgst.toFixed(2)} label="SGST" size="sm" />
            </div>
          </div>
        </div>

        {/* Total IGST (Inter-state) */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">IGST</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-purple-700 tracking-tight">
              {formatIndianCurrency(summary.totalIgst)}
            </span>
            <GstCopyButton value={summary.totalIgst.toFixed(2)} label="IGST" />
          </div>
          <p className="mt-1 text-xs text-zinc-400">Inter-state integrated GST</p>
        </div>

        {/* Total Invoice Value */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow sm:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total Invoice Value (Gross Sales)</span>
            <span className="px-2.5 py-1 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-lg">Taxable + Total Tax</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-zinc-900 tracking-tight">
                {formatIndianCurrency(summary.totalInvoiceValue)}
              </span>
              <span className="text-sm text-zinc-500">
                (Tax: <strong className="text-zinc-800">{formatIndianCurrency(summary.totalTax)}</strong>)
              </span>
            </div>
            <GstCopyButton value={summary.totalInvoiceValue.toFixed(2)} label="Total Invoice Value" />
          </div>
          <p className="mt-1 text-xs text-zinc-400">Sum of all final invoices issued in this tax period</p>
        </div>

        {/* Cess if present or Tax Overview */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow transition-shadow sm:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total Output GST Collected</span>
            <span className="px-2.5 py-1 bg-emerald-100/70 text-emerald-800 text-xs font-bold rounded-lg">GSTR-3B 3.1(a)</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-700 tracking-tight">
              {formatIndianCurrency(summary.totalTax)}
            </span>
            <GstCopyButton value={summary.totalTax.toFixed(2)} label="Total Tax" />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
            <span>CGST: {formatIndianCurrency(summary.totalCgst)}</span>
            <span>SGST: {formatIndianCurrency(summary.totalSgst)}</span>
            <span>IGST: {formatIndianCurrency(summary.totalIgst)}</span>
            {summary.totalCess > 0 && <span>Cess: {formatIndianCurrency(summary.totalCess)}</span>}
          </div>
        </div>
      </div>

      {/* Dynamic Rate-Wise Breakdown Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div>
            <h3 className="font-bold text-zinc-900 text-lg">Dynamic Rate-wise GST Breakdown</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Rates dynamically identified from invoice lines for this period</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyRateTable}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              title="Copy table as Tab-Separated Values to paste directly in Excel"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-600" />
              Copy Table
            </button>
            <button
              onClick={handleExportRateCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
              title="Export rate table to CSV file"
            >
              <Download className="w-3.5 h-3.5 text-zinc-600" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/75 text-zinc-600 text-xs uppercase font-bold tracking-wider">
                <th className="py-3 px-3">GST Rate</th>
                <th className="py-3 px-3 text-right">Taxable Value</th>
                <th className="py-3 px-3 text-right">CGST</th>
                <th className="py-3 px-3 text-right">SGST</th>
                <th className="py-3 px-3 text-right">IGST</th>
                <th className="py-3 px-3 text-right">Cess</th>
                <th className="py-3 px-3 text-right">Total Tax</th>
                <th className="py-3 px-3 text-right">Invoice Value</th>
                <th className="py-3 px-3 text-center">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {summary.rateWiseBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-400 text-sm">
                    No GST invoices found in this period.
                  </td>
                </tr>
              ) : (
                summary.rateWiseBreakdown.map((row) => (
                  <tr key={row.rate} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="py-3 px-3 font-bold text-zinc-900">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-800">
                        {row.rate}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.taxableValue)}</span>
                        <GstCopyButton value={row.taxableValue.toFixed(2)} label={`${row.rate}% Taxable`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.cgst)}</span>
                        <GstCopyButton value={row.cgst.toFixed(2)} label={`${row.rate}% CGST`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.sgst)}</span>
                        <GstCopyButton value={row.sgst.toFixed(2)} label={`${row.rate}% SGST`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.igst)}</span>
                        <GstCopyButton value={row.igst.toFixed(2)} label={`${row.rate}% IGST`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.cess)}</span>
                        {row.cess > 0 && <GstCopyButton value={row.cess.toFixed(2)} label={`${row.rate}% Cess`} size="sm" />}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.totalTax)}</span>
                        <GstCopyButton value={row.totalTax.toFixed(2)} label={`${row.rate}% Total Tax`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-zinc-900 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{formatIndianCurrency(row.invoiceValue)}</span>
                        <GstCopyButton value={row.invoiceValue.toFixed(2)} label={`${row.rate}% Invoice Value`} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center text-zinc-600 font-medium">
                      {row.billCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {summary.rateWiseBreakdown.length > 0 && (
              <tfoot>
                <tr className="bg-zinc-100/75 border-t-2 border-zinc-300 font-extrabold text-zinc-900 text-xs uppercase">
                  <td className="py-3 px-3">Total</td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalTaxableValue)}</span>
                      <GstCopyButton value={summary.totalTaxableValue.toFixed(2)} label="Total Taxable Value" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalCgst)}</span>
                      <GstCopyButton value={summary.totalCgst.toFixed(2)} label="Total CGST" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalSgst)}</span>
                      <GstCopyButton value={summary.totalSgst.toFixed(2)} label="Total SGST" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalIgst)}</span>
                      <GstCopyButton value={summary.totalIgst.toFixed(2)} label="Total IGST" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalCess)}</span>
                      {summary.totalCess > 0 && <GstCopyButton value={summary.totalCess.toFixed(2)} label="Total Cess" size="sm" />}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap text-emerald-700">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalTax)}</span>
                      <GstCopyButton value={summary.totalTax.toFixed(2)} label="Total Tax" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap text-zinc-900">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{formatIndianCurrency(summary.totalInvoiceValue)}</span>
                      <GstCopyButton value={summary.totalInvoiceValue.toFixed(2)} label="Total Invoice Value" size="sm" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-zinc-900">
                    {summary.totalBillsCount}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

