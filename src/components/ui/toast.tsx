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

const TOAST_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 3;

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<
  ToastVariant,
  { Icon: LucideIcon; icon: string; border: string }
> = {
  success: {
    Icon: CheckCircle2,
    icon: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
  },
  error: {
    Icon: AlertCircle,
    icon: "text-destructive",
    border: "border-destructive/40",
  },
  info: {
    Icon: Info,
    icon: "text-primary",
    border: "border-primary/30",
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
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-3.5 text-card-foreground shadow-lg",
        styles.border
      )}
    >
      <Icon
        size={18}
        className={cn("mt-0.5 shrink-0", styles.icon, toast.loading && "animate-spin")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold leading-tight text-foreground">
          {toast.title}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          {toast.description}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-96 flex-col gap-2">
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
