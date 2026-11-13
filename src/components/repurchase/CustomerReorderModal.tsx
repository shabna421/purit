import React from 'react';
import { X, Repeat, User, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Customer, Sale, Item } from '../../types';
import { ProductRepurchasePrediction } from '../../utils/repurchasePrediction';
import { CustomerReorderTimelineTable } from './CustomerReorderTimelineTable';

interface CustomerReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | { id: string; name: string; shopName?: string };
  sales: Sale[];
  productCatalog: Map<string, Item>;
  onProductClick?: (prediction: ProductRepurchasePrediction) => void;
}

export const CustomerReorderModal: React.FC<CustomerReorderModalProps> = ({
  isOpen,
  onClose,
  customer,
  sales,
  productCatalog,
  onProductClick,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative w-full max-w-5xl rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-zinc-100 flex items-center justify-between gap-4 bg-zinc-50/70">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs shadow-orange-500/30 shrink-0">
                <Repeat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 truncate">
                    {customer.name}
                  </h3>
                  {customer.shopName && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                      {customer.shopName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Past reorder timelines, purchase intervals, and next order predictions
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition-colors shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            <CustomerReorderTimelineTable
              sales={sales}
              productCatalog={productCatalog}
              customerId={customer.id}
              customerName={customer.name}
              onProductClick={onProductClick}
              onClose={onClose}
            />
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

