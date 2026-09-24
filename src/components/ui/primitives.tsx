"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, XCircle } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { QualityLevel } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-navy-950 hover:bg-brand-hover font-semibold",
  secondary: "bg-card text-ink border border-line hover:bg-page",
  ghost: "text-ink-2 hover:text-ink hover:bg-black/5",
  danger: "bg-card text-danger border border-danger/40 hover:bg-danger-bg",
  dark: "bg-white/10 text-white hover:bg-white/15 border border-white/15",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className
      )}
      {...rest}
    >
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
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg transition-colors",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const qualityStyles: Record<QualityLevel, { label: string; cls: string }> = {
  high: { label: "High confidence", cls: "bg-ok-bg text-[#11704a]" },
  medium: { label: "Estimated", cls: "bg-info-bg text-info" },
  low: { label: "Low confidence", cls: "bg-warn-bg text-warn" },
  unavailable: { label: "Unavailable", cls: "bg-page text-ink-2 border border-line" },
};

export function QualityBadge({ quality, label, className }: { quality: QualityLevel; label?: string; className?: string }) {
  const q = qualityStyles[quality];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", q.cls, className)}>
      {label ?? q.label}
    </span>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "dark"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-page text-ink-2 border border-line",
    ok: "bg-ok-bg text-[#11704a]",
    warn: "bg-warn-bg text-warn",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
    dark: "bg-white/10 text-white",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
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
    info: "bg-info-bg text-info border-info/15",
    warn: "bg-warn-bg text-warn border-warn/15",
    danger: "bg-danger-bg text-danger border-danger/20",
    ok: "bg-ok-bg text-[#11704a] border-brand/20",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("flex gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "text-[13px] leading-relaxed opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, indeterminate, className, dark }: { value: number; indeterminate?: boolean; className?: string; dark?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className={clsx("relative h-2 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-page border border-line", className)}
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
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line bg-page p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <label className={clsx("flex items-center justify-between gap-3 py-1.5 text-sm", disabled ? "opacity-50" : "cursor-pointer")} title={hint}>
      <span className="text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : "bg-line")}
      >
        <span className={clsx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-[#11704a]">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={text} className="text-ink-2 hover:text-ink">
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

export function TeamChip({ color, name, className }: { color: string; name: string; className?: string }) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="size-3 shrink-0 rounded-sm border border-black/20" style={{ background: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
