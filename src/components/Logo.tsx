import { cn } from "@/lib/utils";

export function LogoMark({ size = 38, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-[13px] bg-gradient-to-br from-[#eee3f6] via-[#f3e9dd] to-[#dfeadf] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_16px_-10px_rgba(70,55,80,0.5)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.52} height={size * 0.56} viewBox="0 0 24 26" fill="none" aria-hidden>
        <path
          d="M12 2.2c.4 3.4-2.7 4.9-4.4 7.3-1.5 2.2-1.9 5.2-.1 7.5 1.2 1.6 3.2 2.6 5.3 2.3 2.7-.4 4.4-2.7 4.2-5.3-.2-2.3-1.8-3.8-2.6-5.8-.8-2.1-.9-4.1-2.4-6z"
          fill="url(#flameGradient)"
        />
        <path
          d="M12.4 11.4c.3 1.7-1.7 2.4-2.1 4-.3 1.2.4 2.5 1.7 2.8 1.5.3 2.9-.7 3-2.2.1-1.1-.7-2-1.2-3-.4-.8-.8-1.2-1.4-1.6z"
          fill="#fdf6ec"
          opacity="0.75"
        />
        <path d="M6 22.6h12" stroke="#8f7f9f" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 20.8v1.8" stroke="#8f7f9f" strokeWidth="1.6" strokeLinecap="round" />
        <defs>
          <linearGradient id="flameGradient" x1="7" y1="3" x2="17" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f2cba7" />
            <stop offset="1" stopColor="#c99077" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function LogoWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={compact ? 32 : 36} />
      <div className="leading-none">
        <p className="display text-[19px] font-medium tracking-[-0.02em] text-ink">Katha</p>
        <p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.28em] text-muted/70">Studio</p>
      </div>
    </div>
  );
}
