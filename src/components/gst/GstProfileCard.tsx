import React, { useState } from 'react';
import { OrganizationSettings } from '../../types';
import { Building2, Pencil, CheckCircle2, AlertCircle, ShieldCheck, X } from 'lucide-react';
import { isValidGstin, getStateFromGstin, GST_STATES } from '../../utils/gstUtils';
import { useNotifications } from '../../notifications';

interface GstProfileCardProps {
  settings: OrganizationSettings;
  onUpdateSettings: (updated: Partial<OrganizationSettings>) => Promise<void>;
}

export const GstProfileCard: React.FC<GstProfileCardProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { success, error: notifyError } = useNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentGstin = settings.gstin?.trim() || '';
  const isGstinValid = isValidGstin(currentGstin);
  const stateInfo = getStateFromGstin(currentGstin);
  const stateCode = settings.businessStateCode || stateInfo?.code || '32';
  const stateName = settings.businessState || stateInfo?.name || GST_STATES[stateCode] || 'Kerala';
  const filingFrequency = settings.filingFrequency || 'monthly';
  const roundDecimals = settings.roundDecimals !== false;

  // Form State
  const [formGstin, setFormGstin] = useState(currentGstin);
  const [formFrequency, setFormFrequency] = useState<'monthly' | 'quarterly'>(filingFrequency);
  const [formRoundDecimals, setFormRoundDecimals] = useState(roundDecimals);

  const formDerivedState = getStateFromGstin(formGstin);
  const formGstinValid = isValidGstin(formGstin);

  const handleOpenModal = () => {
    setFormGstin(settings.gstin || '');
    setFormFrequency(settings.filingFrequency || 'monthly');
    setFormRoundDecimals(settings.roundDecimals !== false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGstin = formGstin.trim().toUpperCase();
    if (cleanGstin && !isValidGstin(cleanGstin)) {
      notifyError('Please enter a valid 15-character GSTIN (e.g. 32ABCDE1234F1Z5)');
      return;
    }

    setSaving(true);
    try {
      const derivedState = getStateFromGstin(cleanGstin);
      const bStateCode = derivedState?.code || (cleanGstin.length >= 2 ? cleanGstin.slice(0, 2) : '32');
      const bStateName = derivedState?.name || GST_STATES[bStateCode] || 'Kerala';

      await onUpdateSettings({
        gstin: cleanGstin,
        businessState: bStateName,
        businessStateCode: bStateCode,
        filingFrequency: formFrequency,
        roundDecimals: formRoundDecimals,
      });

      success('GST Profile updated successfully');
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Failed to update GST profile:', err);
      notifyError(err.message || 'Failed to update GST profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Business GST Profile</span>
                {isGstinValid ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <CheckCircle2 className="w-3 h-3" /> Valid GSTIN
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertCircle className="w-3 h-3" /> Needs Attention
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 mt-1">
                <span className="text-lg font-bold font-mono text-zinc-900 tracking-tight">
                  {currentGstin || 'Not Configured'}
                </span>
                <span className="text-xs text-zinc-400">•</span>
                <span className="text-sm font-semibold text-zinc-700">
                  {stateName} ({stateCode})
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                <span>Frequency: <strong className="text-zinc-700 capitalize">{filingFrequency}</strong></span>
                <span>•</span>
                <span>Rounding: <strong className="text-zinc-700">{roundDecimals ? '2 Decimals' : 'Exact'}</strong></span>
                <span>•</span>
                <span>Type: <strong className="text-zinc-700">Regular Taxpayer</strong></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 text-orange-600 rounded-xl text-xs font-bold transition-colors shrink-0 shadow-2xs"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit GST Profile
          </button>
        </div>
      </div>

      {/* Edit GST Profile Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-100 z-10">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Edit Business GST Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Business GSTIN (15 Alphanumeric) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={15}
                  placeholder="e.g. 32ABCDE1234F1Z5"
                  value={formGstin}
                  onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <div className="flex items-center justify-between mt-1 text-xs">
                  {formGstin ? (
                    formGstinValid ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Valid 15-character GSTIN
                      </span>
                    ) : (
                      <span className="text-rose-500 font-medium">
                        Must match format: 2 digits + 10 PAN + 1 + Z + 1
                      </span>
                    )
                  ) : (
                    <span className="text-zinc-400">First 2 digits determine your home state.</span>
                  )}
                  <span className="text-zinc-400">{formGstin.length}/15</span>
                </div>
              </div>

              {/* State and State Code derived */}
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                  Derived State & Code
                </span>
                <p className="text-sm font-bold text-zinc-800">
                  {formDerivedState ? `${formDerivedState.name} (Code: ${formDerivedState.code})` : 'Enter GSTIN to automatically derive state'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Used automatically to separate Intra-state (CGST + SGST) from Inter-state (IGST).
                </p>
              </div>

              {/* Filing Frequency */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Filing Frequency (QRMP Scheme)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormFrequency('monthly')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                      formFrequency === 'monthly'
                        ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-2xs'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Monthly (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFrequency('quarterly')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                      formFrequency === 'quarterly'
                        ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-2xs'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Quarterly (QRMP)
                  </button>
                </div>
              </div>

              {/* Rounding option */}
              <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formRoundDecimals}
                  onChange={(e) => setFormRoundDecimals(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 focus:ring-orange-400 border-zinc-300 accent-orange-500"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-800 block">Round Amounts to 2 Decimals</span>
                  <span className="text-[11px] text-zinc-500 block">
                    Recommended for official GST filing reports & exports.
                  </span>
                </div>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (formGstin.length > 0 && !formGstinValid)}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-md shadow-orange-100 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

