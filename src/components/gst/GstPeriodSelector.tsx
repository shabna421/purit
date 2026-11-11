import React from 'react';
import { Calendar, Download, FileSpreadsheet, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { GstPeriodOption } from '../../utils/gstUtils';

interface GstPeriodSelectorProps {
  periods: GstPeriodOption[];
  selectedPeriodKey: string;
  onSelectPeriod: (key: string) => void;
  frequency: 'monthly' | 'quarterly';
  isFiled: boolean;
  filingDetails?: { filedAt: number; arn?: string; notes?: string };
  onOpenFilingModal: () => void;
  onExportAllExcel: () => void;
  onExportGstr1Json: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export const GstPeriodSelector: React.FC<GstPeriodSelectorProps> = ({
  periods,
  selectedPeriodKey,
  onSelectPeriod,
  frequency,
  isFiled,
  filingDetails,
  onOpenFilingModal,
  onExportAllExcel,
  onExportGstr1Json,
  onRefresh,
  loading,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-zinc-200/90 rounded-2xl p-4 shadow-xs">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
            <Calendar className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            {frequency === 'quarterly' ? 'Tax Quarter' : 'Tax Month'}
          </span>
        </div>

        <select
          value={selectedPeriodKey}
          onChange={(e) => onSelectPeriod(e.target.value)}
          className="px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Filed / Pending Status Badge */}
        {isFiled ? (
          <button
            type="button"
            onClick={onOpenFilingModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors shadow-2xs"
            title="Click to view filing details or edit ARN"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>FILED</span>
            {filingDetails?.arn && (
              <span className="font-mono text-[11px] text-emerald-800">({filingDetails.arn})</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenFilingModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors shadow-2xs"
            title="Click to mark this month as filed"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>PENDING FILING</span>
          </button>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
          title="Refresh GST report data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onExportAllExcel}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-xs font-bold transition-colors shadow-2xs"
          title="Download complete GSTR-1 and GSTR-3B multi-sheet Excel file"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Export All (Excel)</span>
        </button>

        <button
          type="button"
          onClick={onExportGstr1Json}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-sm shadow-orange-100"
          title="Export official GSTR-1 JSON for GST Offline Tool upload"
        >
          <Download className="w-4 h-4" />
          <span>GSTR-1 JSON</span>
        </button>
      </div>
    </div>
  );
};

