import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, RotateCcw, Calendar, FileText, Hash, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface GstFilingModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodLabel: string;
  periodKey: string;
  isFiled: boolean;
  initialFilingDetails?: { filedAt: number; arn?: string; notes?: string };
  onSave: (info: { filedAt: number; arn?: string; notes?: string }) => Promise<void>;
  onUnmark: () => Promise<void>;
}

export const GstFilingModal: React.FC<GstFilingModalProps> = ({
  isOpen,
  onClose,
  periodLabel,
  periodKey,
  isFiled,
  initialFilingDetails,
  onSave,
  onUnmark,
}) => {
  const [filingDate, setFilingDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [arn, setArn] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  const [confirmUnmark, setConfirmUnmark] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialFilingDetails?.filedAt) {
        setFilingDate(format(new Date(initialFilingDetails.filedAt), 'yyyy-MM-dd'));
      } else {
        setFilingDate(format(new Date(), 'yyyy-MM-dd'));
      }
      setArn(initialFilingDetails?.arn || '');
      setNotes(initialFilingDetails?.notes || '');
      setConfirmUnmark(false);
    }
  }, [isOpen, initialFilingDetails]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const filedTimestamp = filingDate ? new Date(filingDate).getTime() : Date.now();
      await onSave({
        filedAt: filedTimestamp,
        arn: arn.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnmarkSubmit = async () => {
    setUnmarking(true);
    try {
      await onUnmark();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setUnmarking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isFiled ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-lg">
                {isFiled ? 'Update GST Filing Status' : 'Mark Period as Filed'}
              </h3>
              <p className="text-xs text-zinc-500 font-medium">Return Period: {periodLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Notice */}
          <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/80 text-xs text-zinc-600 leading-relaxed">
            Marking <strong className="text-zinc-900">{periodLabel}</strong> as filed locks this period and triggers a warning whenever someone edits or adds a bill dated in this month.
          </div>

          {/* Filing Date */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Filing Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                required
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          </div>

          {/* ARN Number */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              ARN / Reference Number (Optional)
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. AA321026001234V"
                value={arn}
                onChange={(e) => setArn(e.target.value.toUpperCase())}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none uppercase"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Application Reference Number generated by the GST Portal</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
              Notes / Remarks (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Filed via auditor Suresh; GSTR-3B challan paid."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'Saving...' : isFiled ? 'Update Filing Details' : 'Confirm as Filed'}
            </button>

            {isFiled && (
              <div className="pt-2 border-t border-zinc-100">
                {!confirmUnmark ? (
                  <button
                    type="button"
                    onClick={() => setConfirmUnmark(true)}
                    className="w-full py-2 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Unmark as Filed
                  </button>
                ) : (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-center space-y-2">
                    <p className="text-xs text-red-800 font-bold">Unmark {periodLabel} as filed?</p>
                    <p className="text-[11px] text-red-600">The period status will return to Pending.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmUnmark(false)}
                        className="flex-1 py-1.5 px-3 bg-white border border-zinc-200 rounded-lg text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleUnmarkSubmit}
                        disabled={unmarking}
                        className="flex-1 py-1.5 px-3 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                      >
                        {unmarking ? 'Unmarking...' : 'Yes, Unmark'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

