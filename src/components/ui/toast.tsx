"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  LoaderCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  variant: ToastVariant;
  title: string;
  description: string;
  persistent?: boolean;
  loading?: boolean;
}

interface ToastMessage extends ToastInput {
  id: number;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
}

const TOAST_DURATION_MS = 5000;
const MAX_VISIBLE_TOASTS = 3;

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<
  ToastVariant,
  { Icon: LucideIcon; icon: string; title: string; border: string }
> = {
  success: {
    Icon: CheckCircle2,
    icon: "text-emerald-700 dark:text-emerald-400",
    title: "text-emerald-950 dark:text-emerald-200",
    border: "border-emerald-500/35",
  },
  error: {
    Icon: AlertCircle,
    icon: "text-red-700 dark:text-red-400",
    title: "text-red-950 dark:text-red-200",
    border: "border-red-500/35",
  },
  info: {
    Icon: Info,
    icon: "text-[#0353a4] dark:text-[#87c2fd]",
    title: "text-[#023e7d] dark:text-[#87c2fd]",
    border: "border-[#0353a4]/35 dark:border-[#87c2fd]/35",
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const styles = variantStyles[toast.variant];
  const Icon = toast.loading ? LoaderCircle : styles.Icon;

  useEffect(() => {
    if (toast.persistent) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.id, toast.persistent]);

  return (
    <aside
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-[var(--bg-card)]/95 p-3.5 shadow-xl backdrop-blur-md",
        "transition-all duration-200",
        styles.border
      )}
    >
      <Icon
        size={20}
        className={cn("mt-0.5 shrink-0", styles.icon, toast.loading && "animate-spin")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn("text-xs font-bold leading-tight", styles.title)}>
          {toast.title}
        </p>
        <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
          {toast.description}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </aside>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextIdRef = useRef(1);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { ...toast, id }]);
    return id;
  }, []);

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
