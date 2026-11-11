import React from 'react';
import { Landmark, ArrowUpRight, Copy, Download, Info, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';
import {
  GstFilingReport,
  formatIndianCurrency,
  copyTableAsTsv,
  exportTableToCsv,
} from '../../utils/gstUtils';
import { GstCopyButton } from './GstCopyButton';

interface GstGstr3bTabProps {
  report: GstFilingReport;
}

export const GstGstr3bTab: React.FC<GstGstr3bTabProps> = ({ report }) => {
  const { gstr3b, periodKey } = report;

  const handleCopyTable31 = () => {
    const headers = ['Nature of Supplies', 'Total Taxable Value (₹)', 'Integrated Tax (₹)', 'Central Tax (₹)', 'State/UT Tax (₹)', 'Cess (₹)'];
    const rows = [
      [
        '(a) Outward taxable supplies (other than zero/nil/exempt)',
        gstr3b.table31a.taxableValue.toFixed(2),
        gstr3b.table31a.igst.toFixed(2),
        gstr3b.table31a.cgst.toFixed(2),
        gstr3b.table31a.sgst.toFixed(2),
        gstr3b.table31a.cess.toFixed(2),
      ],
      [
        '(c) Other outward supplies (Nil rated, exempted)',
        gstr3b.table31c.taxableValue.toFixed(2),
        '0.00',
        '0.00',
        '0.00',
        '0.00',
      ],
    ];
    copyTableAsTsv(headers, rows);
  };

  const handleExportTable31Csv = () => {
    const headers = ['Nature of Supplies', 'Total Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'];
    const rows = [
      [
        '(a) Outward taxable supplies',
        gstr3b.table31a.taxableValue.toFixed(2),
        gstr3b.table31a.igst.toFixed(2),
        gstr3b.table31a.cgst.toFixed(2),
        gstr3b.table31a.sgst.toFixed(2),
        gstr3b.table31a.cess.toFixed(2),
      ],
      [
        '(c) Nil rated and exempted supplies',
        gstr3b.table31c.taxableValue.toFixed(2),
        '0.00',
        '0.00',
        '0.00',
        '0.00',
      ],
    ];
    exportTableToCsv(`GSTR3B_Table31_${periodKey}.csv`, headers, rows);
  };

  const handleCopyTable32 = () => {
    const headers = ['Place of Supply', 'Total Taxable Value (₹)', 'Integrated Tax (₹)'];
    const rows = gstr3b.table32.map(i => [
      i.pos,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
    ]);
    copyTableAsTsv(headers, rows);
  };

  const handleExportTable32Csv = () => {
    const headers = ['Place of Supply', 'Total Taxable Value', 'Integrated Tax'];
    const rows = gstr3b.table32.map(i => [
      i.pos,
      i.taxableValue.toFixed(2),
      i.igst.toFixed(2),
    ]);
    exportTableToCsv(`GSTR3B_Table32_${periodKey}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Help Banner */}
      <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <span className="font-bold">GSTR-3B Direct Entry Assistant:</span> Each section below matches the exact table numbering and fields in the official GST Portal GSTR-3B return. Click the <span className="font-semibold text-blue-700 bg-white px-1.5 py-0.5 border border-blue-200 rounded">Copy</span> button next to each amount to paste it directly into its corresponding portal box.
        </div>
      </div>

      {/* TABLE 3.1: TAX ON OUTWARD SUPPLIES */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-900 text-lg">3.1 Details of Outward Supplies and inward supplies liable to reverse charge</h3>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Copy these totals directly into GSTR-3B Table 3.1.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTable31}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Table
            </button>
            <button
              onClick={handleExportTable31Csv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* 3.1(a) Outward Taxable Supplies */}
        <div className="bg-zinc-50/60 border border-zinc-200/90 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-md">
                3.1 (a)
              </span>
              <span className="font-bold text-zinc-900 text-sm">
                Outward taxable supplies (other than zero rated, nil rated and exempted)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            {/* Taxable Value */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Total Taxable Value</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-zinc-900 tracking-tight">
                  {formatIndianCurrency(gstr3b.table31a.taxableValue)}
                </span>
                <GstCopyButton value={gstr3b.table31a.taxableValue.toFixed(2)} label="3.1(a) Taxable Value" size="sm" />
              </div>
            </div>

            {/* Integrated Tax */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Integrated Tax (IGST)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-purple-700 tracking-tight">
                  {formatIndianCurrency(gstr3b.table31a.igst)}
                </span>
                <GstCopyButton value={gstr3b.table31a.igst.toFixed(2)} label="3.1(a) IGST" size="sm" />
              </div>
            </div>

            {/* Central Tax */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Central Tax (CGST)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-orange-600 tracking-tight">
                  {formatIndianCurrency(gstr3b.table31a.cgst)}
                </span>
                <GstCopyButton value={gstr3b.table31a.cgst.toFixed(2)} label="3.1(a) CGST" size="sm" />
              </div>
            </div>

            {/* State Tax */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">State/UT Tax (SGST)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-orange-600 tracking-tight">
                  {formatIndianCurrency(gstr3b.table31a.sgst)}
                </span>
                <GstCopyButton value={gstr3b.table31a.sgst.toFixed(2)} label="3.1(a) SGST" size="sm" />
              </div>
            </div>

            {/* Cess */}
            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Cess</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-zinc-700 tracking-tight">
                  {formatIndianCurrency(gstr3b.table31a.cess)}
                </span>
                <GstCopyButton value={gstr3b.table31a.cess.toFixed(2)} label="3.1(a) Cess" size="sm" />
              </div>
            </div>
          </div>
        </div>

        {/* 3.1(c) Nil Rated / Exempt */}
        <div className="bg-zinc-50/60 border border-zinc-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-zinc-200 text-zinc-800 font-extrabold text-xs rounded-md">
              3.1 (c)
            </span>
            <span className="font-bold text-zinc-900 text-sm">
              Other outward supplies (Nil rated, exempted)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Total Taxable Value:</span>
            <span className="text-base font-extrabold text-zinc-900">
              {formatIndianCurrency(gstr3b.table31c.taxableValue)}
            </span>
            <GstCopyButton value={gstr3b.table31c.taxableValue.toFixed(2)} label="3.1(c) Nil-rated Taxable Value" size="sm" />
          </div>
        </div>
      </div>

      {/* TABLE 3.2: INTER-STATE SUPPLIES TO UNREGISTERED PERSONS */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-900 text-lg">3.2 Inter-State supplies made to unregistered persons</h3>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Breakdown of inter-state consumer supplies state-wise (subset of 3.1a).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTable32}
              disabled={gstr3b.table32.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Table
            </button>
            <button
              onClick={handleExportTable32Csv}
              disabled={gstr3b.table32.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-700 text-xs font-bold rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {gstr3b.table32.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-sm">
            No inter-state supplies to unregistered customers in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600 uppercase font-bold border-b border-zinc-200">
                <tr>
                  <th className="py-3 px-3">Place of Supply (State / UT)</th>
                  <th className="py-3 px-3 text-right">Total Taxable Value (₹)</th>
                  <th className="py-3 px-3 text-right">Amount of Integrated Tax (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {gstr3b.table32.map((row) => (
                  <tr key={row.pos} className="hover:bg-zinc-50/60">
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 font-mono">
                      <div className="flex items-center gap-1">
                        <span>{row.pos}</span>
                        <GstCopyButton value={row.pos} label="POS" size="sm" />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <span>{formatIndianCurrency(row.taxableValue)}</span>
                        <GstCopyButton value={row.taxableValue.toFixed(2)} label="3.2 Taxable Value" size="sm" />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-700 font-bold whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <span>{formatIndianCurrency(row.igst)}</span>
                        <GstCopyButton value={row.igst.toFixed(2)} label="3.2 IGST" size="sm" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TABLE 4: ELIGIBLE ITC (INPUT TAX CREDIT) */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-zinc-900 text-lg">4. Eligible ITC (Input Tax Credit)</h3>
            <span className={`px-2 py-0.5 font-bold text-xs rounded-full ${
              gstr3b.table4.hasPurchaseData ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
            }`}>
              {gstr3b.table4.hasPurchaseData ? `${gstr3b.table4.purchaseCount} Purchases Logged` : 'No purchase data'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Credit on inward supplies (purchases) from registered suppliers to offset against output tax.
          </p>
        </div>

        {!gstr3b.table4.hasPurchaseData ? (
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-zinc-600 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-zinc-800">No Purchase Bills Recorded for this Period:</span>{' '}
              Purchases can be recorded in Purit under the Purchases module. If recorded with supplier GSTINs, the tax paid will automatically show here as eligible Input Tax Credit to offset against your output tax payable.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Integrated Tax (IGST ITC)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-purple-700 tracking-tight">
                  {formatIndianCurrency(gstr3b.table4.igst)}
                </span>
                <GstCopyButton value={gstr3b.table4.igst.toFixed(2)} label="ITC IGST" size="sm" />
              </div>
            </div>

            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Central Tax (CGST ITC)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-orange-600 tracking-tight">
                  {formatIndianCurrency(gstr3b.table4.cgst)}
                </span>
                <GstCopyButton value={gstr3b.table4.cgst.toFixed(2)} label="ITC CGST" size="sm" />
              </div>
            </div>

            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">State Tax (SGST ITC)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-orange-600 tracking-tight">
                  {formatIndianCurrency(gstr3b.table4.sgst)}
                </span>
                <GstCopyButton value={gstr3b.table4.sgst.toFixed(2)} label="ITC SGST" size="sm" />
              </div>
            </div>

            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <span className="text-[11px] font-bold text-zinc-500 uppercase">Total Eligible ITC</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-extrabold text-emerald-700 tracking-tight">
                  {formatIndianCurrency(gstr3b.table4.totalItc)}
                </span>
                <GstCopyButton value={gstr3b.table4.totalItc.toFixed(2)} label="Total ITC" size="sm" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TABLE 5: NET TAX PAYABLE (OUTPUT TAX - ITC) */}
      <div className="bg-white border-2 border-orange-200/90 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="pb-4 border-b border-orange-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-900 text-lg">Net GST Payable (Output Tax − Eligible ITC)</h3>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-800 font-bold text-xs rounded-full">
                Cash Liability
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Net liability to be paid in cash through challan on the GST portal after offsetting available ITC.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* IGST Payable */}
          <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-200/80">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">IGST Payable</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-purple-800 tracking-tight">
                {formatIndianCurrency(gstr3b.netTaxPayable.igst)}
              </span>
              <GstCopyButton value={gstr3b.netTaxPayable.igst.toFixed(2)} label="IGST Net Payable" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Output: {formatIndianCurrency(gstr3b.table31a.igst)} − ITC: {formatIndianCurrency(gstr3b.table4.igst)}</p>
          </div>

          {/* CGST Payable */}
          <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-200/80">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">CGST Payable</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-orange-600 tracking-tight">
                {formatIndianCurrency(gstr3b.netTaxPayable.cgst)}
              </span>
              <GstCopyButton value={gstr3b.netTaxPayable.cgst.toFixed(2)} label="CGST Net Payable" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Output: {formatIndianCurrency(gstr3b.table31a.cgst)} − ITC: {formatIndianCurrency(gstr3b.table4.cgst)}</p>
          </div>

          {/* SGST Payable */}
          <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-200/80">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">SGST Payable</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-orange-600 tracking-tight">
                {formatIndianCurrency(gstr3b.netTaxPayable.sgst)}
              </span>
              <GstCopyButton value={gstr3b.netTaxPayable.sgst.toFixed(2)} label="SGST Net Payable" />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Output: {formatIndianCurrency(gstr3b.table31a.sgst)} − ITC: {formatIndianCurrency(gstr3b.table4.sgst)}</p>
          </div>

          {/* Total Net Payable */}
          <div className="bg-orange-500 text-white p-4 rounded-xl shadow-md shadow-orange-100 flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-100">Total Cash Tax Payable</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold tracking-tight">
                {formatIndianCurrency(gstr3b.netTaxPayable.total)}
              </span>
              <GstCopyButton value={gstr3b.netTaxPayable.total.toFixed(2)} label="Total Net Tax" className="bg-white/20 text-white hover:bg-white/30" />
            </div>
            <p className="mt-1 text-[11px] text-orange-100">Payment challan amount</p>
          </div>
        </div>
      </div>
    </div>
  );
};

