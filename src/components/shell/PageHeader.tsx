import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5 px-5 pt-8 pb-5 sm:px-10">
      <div className="min-w-0">
        {back}
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-[2rem]">{title}</h1>
        {subtitle && <div className="mt-2 max-w-3xl text-base leading-relaxed text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
