import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function useConfirm() {
  return useContext(ConfirmContext);
}

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ ...opts, resolve });
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const close = (value: boolean) => {
    setVisible(false);
    setTimeout(() => {
      setDialog(null);
      resolveRef.current?.(value);
      resolveRef.current = null;
    }, 200);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div
          className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-all duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => close(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div
            className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-6 transition-all duration-200 ${
              visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {dialog.destructive && (
              <div className="flex items-center justify-center w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
            )}
            {dialog.title && (
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{dialog.title}</h3>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">{dialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => close(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {dialog.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${
                  dialog.destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {dialog.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
