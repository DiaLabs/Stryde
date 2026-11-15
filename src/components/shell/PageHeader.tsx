import type { ReactNode } from "react";

/** Workspace page header (reference: bold title, quiet subtitle, primary action on the right). */
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-5 sm:px-6 lg:px-8 lg:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-3">
          {back}
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {subtitle && <div className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
