"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, XCircle } from "lucide-react";
import Link from "next/link";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { QualityLevel } from "@/lib/types";

/*
 * Shared UI primitives, styled after docs/reference-assets/UI.jpeg: white panels on a light
 * workspace, green primary actions, navy chrome. Solid = measured, dashed/hatched = estimated.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "navy";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-navy-950 hover:bg-brand-hover shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]",
  navy: "bg-brand-deep text-white hover:bg-[#0c6844]",
  secondary: "border border-line bg-card text-ink hover:bg-page hover:border-[#cfd6db]",
  ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
  danger: "border border-danger/35 bg-card text-danger hover:bg-danger-bg",
  dark: "border border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={clsx(base, sizes[size], variants[variant], className)} {...rest}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={clsx(base, sizes[size], variants[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-xl border border-line bg-card shadow-[var(--shadow-card)]", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A heading for a group inside a panel. */
export function SectionTitle({ title, children, action, id }: { title: ReactNode; children?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {children && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** KPI tile as on the reference dashboard: big value, label, optional footnote. */
export function StatTile({ value, label, note, className }: { value: ReactNode; label: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-line bg-card px-4 py-3.5 shadow-[var(--shadow-card)]", className)}>
      <p className="text-[26px] leading-none font-bold tracking-tight text-ink tabular">{value}</p>
      <p className="mt-2 text-[13px] text-ink-2">{label}</p>
      {note && <p className="mt-0.5 text-xs font-medium text-ok">{note}</p>}
    </div>
  );
}

const qualityStyles: Record<QualityLevel, { label: string; cls: string }> = {
  high: { label: "High confidence", cls: "bg-ok-bg text-ok" },
  medium: { label: "Estimated", cls: "bg-info-bg text-info" },
  low: { label: "Low confidence", cls: "bg-warn-bg text-warn" },
  unavailable: { label: "Unavailable", cls: "bg-page text-ink-2 ring-1 ring-line ring-inset" },
};

export function QualityBadge({ quality, label, className }: { quality: QualityLevel; label?: string; className?: string }) {
  const q = qualityStyles[quality];
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", q.cls, className)}>{label ?? q.label}</span>;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "dark"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-page text-ink-2 ring-1 ring-line ring-inset",
    ok: "bg-ok-bg text-ok",
    warn: "bg-warn-bg text-warn",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
    dark: "bg-white/10 text-white",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "danger" ? XCircle : tone === "ok" ? CheckCircle2 : Info;
  const cls = {
    info: "border-info/15 bg-info-bg text-info",
    warn: "border-warn/15 bg-warn-bg text-warn",
    danger: "border-danger/20 bg-danger-bg text-danger",
    ok: "border-brand/20 bg-ok-bg text-ok",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "text-[13px] leading-relaxed opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  indeterminate,
  className,
  dark,
  label = "Progress",
}: {
  value: number;
  indeterminate?: boolean;
  className?: string;
  dark?: boolean;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className={clsx("relative h-1.5 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-line-soft", className)}
    >
      {indeterminate ? (
        <div className="animate-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-brand" />
      ) : (
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  dark,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  label: string;
  size?: "sm" | "md";
  dark?: boolean;
}) {
  // arrow keys move the selection, as in a native radio group
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === value);
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const next = enabled[(i + step + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={clsx("inline-flex flex-wrap rounded-lg p-0.5", dark ? "bg-white/10" : "border border-line bg-page")}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              "rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              on ? (dark ? "bg-white text-navy-950" : "bg-card text-ink shadow-sm") : dark ? "text-white/70 hover:text-white" : "text-ink-2 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, hint, dark }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: string; dark?: boolean }) {
  const id = useId();
  return (
    <div className={clsx("flex items-center justify-between gap-3 py-1.5 text-sm", disabled && "opacity-50")} title={hint}>
      <label htmlFor={id} className={clsx(dark ? "text-white/90" : "text-ink", !disabled && "cursor-pointer")}>
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : dark ? "bg-white/25" : "bg-line")}
      >
        <span className={clsx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center sm:py-12">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-soft text-ok">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={text} className="rounded-full text-ink-2/70 hover:text-ink">
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-60 -translate-x-1/2 rounded-md bg-navy-950 px-2.5 py-1.5 text-xs leading-snug font-normal text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** A team marker: a dot in the team colour, always next to the team name. */
export function Magnet({ color, size = 10, className, label }: { color: string; size?: number; className?: string; label?: string }) {
  return (
    <span
      className={clsx("inline-block shrink-0 rounded-full ring-1 ring-black/15", className)}
      style={{ background: color, width: size, height: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

export function TeamChip({ color, name, className }: { color: string; name: string; className?: string }) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Magnet color={color} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Side-by-side comparison row (reference "Match Stats"): Team A value | label | Team B value,
 * with bars growing out from the centre. `estimated` hatches the bars.
 */
export function MirrorBar({
  label,
  a,
  b,
  unit = "",
  format = (v) => `${Math.round(v)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`,
  colorA,
  colorB,
  estimated,
  max,
}: {
  label: ReactNode;
  a: number | null;
  b: number | null;
  /** appended to rounded values ("%" or a unit like "m"); usable from server components */
  unit?: string;
  /** custom formatter (client components only) */
  format?: (v: number) => string;
  colorA: string;
  colorB: string;
  estimated?: boolean;
  max?: number;
}) {
  const m = max ?? Math.max(a ?? 0, b ?? 0, 1e-9);
  const pa = a == null ? 0 : Math.max(0, Math.min(1, a / m));
  const pb = b == null ? 0 : Math.max(0, Math.min(1, b / m));
  const fill = (c: string) => (estimated ? `repeating-linear-gradient(135deg, ${c} 0 5px, color-mix(in srgb, ${c} 55%, transparent) 5px 8px)` : c);
  return (
    <div className="py-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
        <span className="font-hud text-[19px] font-semibold text-ink">{a == null ? "–" : format(a)}</span>
        <span className={clsx("text-center text-xs font-medium text-ink-2", estimated && "estimate")}>{label}</span>
        <span className="font-hud text-right text-[19px] font-semibold text-ink">{b == null ? "–" : format(b)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <span className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-line-soft">
          <span className="team-fill h-full rounded-l-full" style={{ width: `${pa * 100}%`, background: fill(colorA) }} />
        </span>
        <span className="flex h-1.5 overflow-hidden rounded-r-full bg-line-soft">
          <span className="team-fill h-full rounded-r-full" style={{ width: `${pb * 100}%`, background: fill(colorB) }} />
        </span>
      </div>
    </div>
  );
}
