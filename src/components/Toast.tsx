import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, ExternalLink } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  link?: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, link?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons = {
  success: <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />,
  error: <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />,
  info: <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
};

const styles = {
  success: 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/60',
  error: 'border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/60',
  info: 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/60',
};

const textStyles = {
  success: 'text-emerald-900 dark:text-emerald-100',
  error: 'text-red-900 dark:text-red-100',
  info: 'text-blue-900 dark:text-blue-100',
};

const linkStyles = {
  success: 'text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100',
  error: 'text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100',
  info: 'text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm max-w-sm w-full transition-all duration-300 ${styles[toast.type]} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <span className={`text-sm leading-snug ${textStyles[toast.type]}`}>{toast.message}</span>
        {toast.link && (
          <a
            href={toast.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1 mt-1 text-xs font-medium underline underline-offset-2 transition-colors ${linkStyles[toast.type]}`}
          >
            View post <ExternalLink size={11} />
          </a>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 300); }}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info', link?: string) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type, link }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
