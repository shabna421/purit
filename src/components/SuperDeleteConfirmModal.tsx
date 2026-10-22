import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface SuperDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: string;
  confirmLabel?: string;
}

export default function SuperDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message = 'This action cannot be undone. All associated data will be permanently removed.',
  confirmLabel = 'Delete Permanently',
}: SuperDeleteConfirmModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset input when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().toLowerCase() !== 'yes' || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-red-100 bg-white shadow-2xl shadow-red-900/10"
          >
            {/* Header / Accent Bar */}
            <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-6 flex items-start gap-4 border-b border-red-50/50">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-lg font-bold text-zinc-900 leading-6">{title}</h3>
                <p className="mt-1 text-xs text-red-600 font-semibold tracking-wider uppercase">Super Confirmation Required</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>

              <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4 space-y-2">
                <label htmlFor="super-delete-input" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  To confirm, type <span className="text-red-600 font-bold select-none normal-case">"YES"</span> below:
                </label>
                <input
                  id="super-delete-input"
                  type="text"
                  required
                  autoFocus
                  autoComplete="off"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder='Type "YES" here'
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-800 outline-none transition-all placeholder:text-zinc-300 focus:border-red-400 focus:ring-4 focus:ring-red-100"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inputValue.trim().toLowerCase() !== 'yes' || isSubmitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-100 hover:bg-red-700 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{isSubmitting ? 'Deleting...' : confirmLabel}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
