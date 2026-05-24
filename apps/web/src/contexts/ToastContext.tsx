import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'success' | 'error';

export type ToastEntry = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  toasts: ToastEntry[];
  showToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = crypto.randomUUID();
      setToasts((cur) => [...cur, { id, message, kind }]);
      const timer = setTimeout(() => {
        timers.current.delete(id);
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [],
  );

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
