import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-3), { id, kind, title, message }]);
      window.setTimeout(() => remove(id), kind === "error" ? 7000 : 4200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, message) => push("success", title, message),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[360px] flex-col gap-2.5">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-lift backdrop-blur-xl"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  item.kind === "success" && "bg-sage/70 text-moss",
                  item.kind === "error" && "bg-rose/70 text-[#a95f66]",
                  item.kind === "info" && "bg-powder/80 text-slateblue",
                )}
              >
                {item.kind === "success" ? (
                  <Check size={14} strokeWidth={2.6} />
                ) : item.kind === "error" ? (
                  <AlertCircle size={14} strokeWidth={2.4} />
                ) : (
                  <Info size={14} strokeWidth={2.4} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-snug text-ink">{item.title}</p>
                {item.message ? (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{item.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded-lg p-1 text-muted/60 transition hover:bg-ink/5 hover:text-ink"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

export function useAsyncAction() {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } finally {
      setPending(null);
    }
  }, []);
  return { pending, run, isPending: (key: string) => pending === key };
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin", className)} />;
}

export function useInterval(callback: () => void, delay: number | null) {
  const saved = React.useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(() => saved.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
