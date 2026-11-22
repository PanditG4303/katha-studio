import React, { forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { cn, statusLabel, statusTone } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */
type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-cream shadow-[0_10px_28px_-14px_rgba(63,58,70,0.7)] hover:bg-[#4b4553] active:translate-y-px",
  secondary:
    "border border-ink/10 bg-white/80 text-ink hover:border-ink/20 hover:bg-white active:translate-y-px",
  ghost: "text-ink/60 hover:bg-ink/[0.05] hover:text-ink",
  soft: "bg-lavender/60 text-ink hover:bg-lavender/90",
  danger: "bg-[#b56c6c] text-white hover:bg-[#a55f5f]",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-[12px] gap-1.5",
  md: "h-10 rounded-xl px-4 text-[13px] gap-2",
  lg: "h-11 rounded-xl px-5 text-[13.5px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 transition hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.04] text-ink/60">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */
export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: "sage" | "blue" | "peach" | "lavender" | "rose" | "neutral" | "ink";
  className?: string;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    sage: "bg-sage/70 text-[#50694f]",
    blue: "bg-powder/80 text-[#5b7088]",
    peach: "bg-peach/80 text-[#9a6a4f]",
    lavender: "bg-lavender/80 text-[#71618c]",
    rose: "bg-rose/80 text-[#9c5c63]",
    neutral: "bg-ink/[0.055] text-ink/60",
    ink: "bg-ink text-cream",
  };
  const dots: Record<string, string> = {
    sage: "bg-moss",
    blue: "bg-slateblue",
    peach: "bg-clay",
    lavender: "bg-[#9a88b8]",
    rose: "bg-[#b56c6c]",
    neutral: "bg-ink/40",
    ink: "bg-cream",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold leading-none tracking-[0.01em]",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  return (
    <Badge tone={statusTone(status) as "sage"} dot={dot}>
      {statusLabel(status)}
    </Badge>
  );
}

/* ------------------------------------------------------------------- Input */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn("field", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn("field-area", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn("field appearance-none pr-9", className)} {...props}>
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted/60"
        />
      </div>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <label className="field-label">{label}</label> : null}
      {children}
      {error ? <p className="mt-1 text-[11px] font-semibold text-[#b56c6c]">{error}</p> : null}
      {hint && !error ? <p className="mt-1.5 text-[11px] leading-relaxed text-muted/80">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Toggle */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || "Toggle"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40",
        checked ? "bg-moss" : "bg-ink/15",
      )}
    >
      <span
        className={cn(
          "inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[19px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------- Modal */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#3f3a46]/25 backdrop-blur-[3px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[26px] border border-white/90 bg-[#fdfbf7] shadow-lift",
              widths[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink/[0.06] px-6 py-5">
              <div>
                <h2 className="display text-[22px] font-medium leading-tight">{title}</h2>
                {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p> : null}
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-ink/[0.06] bg-white/50 px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------- Drawer */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#3f3a46]/20 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            className={cn(
              "absolute right-0 top-0 flex h-full w-full flex-col border-l border-white/80 bg-[#fdfbf7] shadow-lift",
              width,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink/[0.06] px-7 py-6">
              <div className="min-w-0">
                <h2 className="display truncate text-[24px] font-medium leading-tight">{title}</h2>
                {subtitle ? <div className="mt-1 text-[12.5px] text-muted">{subtitle}</div> : null}
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">{children}</div>
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-ink/[0.06] bg-white/60 px-7 py-4">
                {footer}
              </div>
            ) : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* --------------------------------------------------------------------- Tabs */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl bg-ink/[0.045] p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative rounded-lg px-3 py-1.5 text-[12px] font-bold transition",
            value === tab.id ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className={cn("ml-1.5 text-[10px]", value === tab.id ? "text-muted" : "text-ink/35")}>
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- EmptyState */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/10 bg-white/30 text-center",
        compact ? "px-6 py-8" : "px-8 py-14",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-ink/40 shadow-sm">
          {icon}
        </div>
      ) : null}
      <p className="text-[13.5px] font-bold text-ink">{title}</p>
      {message ? <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted">{message}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Progress */
export function Progress({
  value,
  className,
  tone = "moss",
}: {
  value: number;
  className?: string;
  tone?: "moss" | "clay" | "slate";
}) {
  const tones = {
    moss: "bg-moss",
    clay: "bg-clay",
    slate: "bg-slateblue",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- Misc */
export function Stat({
  label,
  value,
  hint,
  tone = "cream",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "cream" | "sage" | "lavender" | "peach" | "powder";
  icon?: React.ReactNode;
}) {
  const tones = {
    cream: "bg-white/60",
    sage: "bg-sage/45",
    lavender: "bg-lavender/45",
    peach: "bg-peach/45",
    powder: "bg-powder/45",
  };
  return (
    <div className={cn("rounded-2xl border border-white/70 p-4", tones[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
        {icon ? <span className="text-ink/35">{icon}</span> : null}
      </div>
      <p className="display mt-2 text-[27px] font-medium leading-none">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-lavender to-powder font-bold text-ink/60",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : letters || "K"}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? <Check size={13} /> : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard may be blocked.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-ink/[0.05] py-2.5 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted/80">{label}</span>
      <span className={cn("max-w-[70%] text-right text-[12px] text-ink/80", mono && "font-mono text-[11px]")}>
        {value || "—"}
      </span>
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
