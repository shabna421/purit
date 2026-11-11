import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { GstValidationWarning } from '../../utils/gstUtils';
import { Link } from 'react-router-dom';

interface GstWarningsPanelProps {
  warnings: GstValidationWarning[];
}

export const GstWarningsPanel: React.FC<GstWarningsPanelProps> = ({ warnings }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!warnings || warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-800 text-sm">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <span className="font-bold">Zero Validation Anomalies:</span> All GSTINs, HSN codes, tax calculations, and invoice sequences for this period are valid and ready to file.
        </div>
      </div>
    );
  }

  const errorCount = warnings.filter(w => w.type === 'error').length;
  const warningCount = warnings.filter(w => w.type === 'warning').length;

  return (
    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl overflow-hidden shadow-sm transition-all">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
              <span>GST Validation Notices</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200/80 text-amber-900">
                {warnings.length} {warnings.length === 1 ? 'Notice' : 'Notices'}
              </span>
              {errorCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                  {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                </span>
              )}
              {warningCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {warningCount} {warningCount === 1 ? 'Warning' : 'Warnings'}
                </span>
              )}
            </h4>
            <p className="text-xs text-amber-800 mt-0.5">
              Review discrepancies before uploading to the GST portal to prevent portal rejections.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 text-amber-700 hover:text-amber-900 rounded-lg hover:bg-amber-200/50 transition-colors"
          aria-label={isExpanded ? 'Collapse notices' : 'Expand notices'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-2 border-t border-amber-200/60">
          <div className="divide-y divide-amber-200/50">
            {warnings.map((warning) => (
              <div
                key={warning.id}
                className="py-2.5 first:pt-3 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2.5">
                  {warning.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${warning.type === 'error' ? 'text-red-900' : 'text-amber-900'}`}>
                        {warning.title}
                      </span>
                      {warning.invoiceNo && (
                        <span className="font-mono text-xs px-1.5 py-0.5 bg-white border border-amber-300 rounded text-amber-950 font-semibold">
                          #{warning.invoiceNo}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{warning.message}</p>
                  </div>
                </div>

                {warning.saleId && (
                  <Link
                    to={`/sales/${warning.saleId}/invoice`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-amber-950 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-amber-300 transition-colors shrink-0 self-start sm:self-auto"
                  >
                    <span>View Bill</span>
                    <ExternalLink className="w-3 h-3 text-amber-700" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

