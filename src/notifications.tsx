import React, { createContext, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
}

interface NotificationContextType {
  notify: (message: string, options?: { title?: string; variant?: ToastVariant }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const toastStyles: Record<ToastVariant, { icon: React.ElementType; frame: string; iconColor: string }> = {
  success: {
    icon: CheckCircle2,
    frame: 'border-green-200 bg-green-50/95',
    iconColor: 'text-green-600',
  },
  error: {
    icon: AlertCircle,
    frame: 'border-red-200 bg-red-50/95',
    iconColor: 'text-red-600',
  },
  info: {
    icon: Info,
    frame: 'border-blue-200 bg-blue-50/95',
    iconColor: 'text-blue-600',
  },
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = (id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  };

  const notify = (message: string, options?: { title?: string; variant?: ToastVariant }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = {
      id,
      title: options?.title,
      message,
      variant: options?.variant || 'info',
    };

    setToasts(current => [...current, toast]);
    window.setTimeout(() => dismiss(id), 3600);
  };

  const value = useMemo<NotificationContextType>(() => ({
    notify,
    success: (message, title) => notify(message, { title, variant: 'success' }),
    error: (message, title) => notify(message, { title, variant: 'error' }),
    info: (message, title) => notify(message, { title, variant: 'info' }),
  }), []);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => {
            const Icon = toastStyles[toast.variant].icon;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${toastStyles[toast.variant].frame}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${toastStyles[toast.variant].iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {toast.title && <p className="text-sm font-bold text-zinc-900">{toast.title}</p>}
                    <p className="text-sm text-zinc-700">{toast.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/70 hover:text-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
