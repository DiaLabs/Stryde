"use client";

import clsx from "clsx";
import { Film, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, ViewTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge, Button, LinkButton, ProgressBar, TeamChip } from "@/components/ui/primitives";
import { formatDuration } from "@/lib/format";
import { isPartial } from "@/lib/result";
import { useStryde, type MatchEntry } from "@/lib/store";

/** Neutral dot for a team whose colour is still being detected. */
const PENDING_COLOR = "#9aa5ae";

export function teamsOf(m: MatchEntry) {
  const t = m.result?.teams;
  return {
    aName: t?.teamAName ?? m.config.teamAName,
    bName: t?.teamBName ?? m.config.teamBName,
    aColor: t?.teamAColor ?? m.config.teamAColor ?? PENDING_COLOR,
    bColor: t?.teamBColor ?? m.config.teamBColor ?? PENDING_COLOR,
  };
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function formatAnalyzedAt(ms: number) {
  return dateFormat.format(new Date(ms));
}

function isRunning(entry: MatchEntry) {
  const s = entry.session.status;
  return s === "loading" || s === "processing" || s === "rendering";
}

function Dot() {
  return <span className="size-1.5 rounded-full bg-current" aria-hidden />;
}

/** Status pill, as on the reference: Completed, Processing NN%, Failed. */
export function StatusBadge({ entry }: { entry: MatchEntry }) {
  const s = entry.session.status;
  if (s === "complete") {
    return entry.result && isPartial(entry.result) ? (
      <Badge tone="warn">
        <Dot /> Partial results
      </Badge>
    ) : (
      <Badge tone="ok">
        <Dot /> Completed
      </Badge>
    );
  }
  if (s === "failed")
    return (
      <Badge tone="danger">
        <Dot /> Failed
      </Badge>
    );
  if (s === "cancelled")
    return (
      <Badge tone="neutral">
        <Dot /> Cancelled
      </Badge>
    );
  if (s === "idle")
    return (
      <Badge tone="neutral">
        <Dot /> Waiting to start
      </Badge>
    );
  if (s === "loading")
    return (
      <Badge tone="info">
        <Dot /> Preparing
      </Badge>
    );
  return (
    <Badge tone="info">
      <Dot /> Processing <span className="tabular">{Math.round(entry.session.progress * 100)}%</span>
    </Badge>
  );
}

/** The pill plus, while a clip is being analyzed, a thin progress bar under it. */
export function StatusCell({ entry }: { entry: MatchEntry }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <StatusBadge entry={entry} />
      {isRunning(entry) && (
        <ProgressBar
          value={entry.session.progress}
          indeterminate={entry.session.status === "loading"}
          className="h-1 w-24"
          label={`Analysis progress, ${entry.config.teamAName} vs ${entry.config.teamBName}`}
        />
      )}
    </div>
  );
}

function Thumb({ entry, href, className }: { entry: MatchEntry; href: string; className?: string }) {
  return (
    <Link href={href} tabIndex={-1} aria-hidden className={clsx("block shrink-0", className)}>
      <ViewTransition name={`match-video-${entry.id}`} share="auto" default="none">
        <div className="relative aspect-video overflow-hidden rounded-md bg-navy-900 ring-1 ring-black/5">
          {entry.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.thumbnail} alt="" className="size-full object-cover" />
          ) : (
            <Film className="absolute inset-0 m-auto size-5 text-white/45" aria-hidden />
          )}
        </div>
      </ViewTransition>
    </Link>
  );
}

function Title({ entry, href }: { entry: MatchEntry; href: string }) {
  const t = teamsOf(entry);
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded text-sm font-semibold text-ink after:absolute after:inset-0 hover:text-brand-deep"
    >
      <TeamChip color={t.aColor} name={t.aName} className="max-w-full" />
      <span className="font-normal text-ink-2">vs</span>
      <TeamChip color={t.bColor} name={t.bName} className="max-w-full" />
    </Link>
  );
}

const modeLabel = (m: MatchEntry) => (m.config.mode === "detailed" ? "More detailed" : "Faster");

/**
 * Matches in this tab. `table` is the full list (Matches page): a table on wide screens and stacked
 * cards on phones. `compact` is the dashboard "Recent matches" list: thumbnail, title, meta, status, View.
 */
export function MatchList({ limit, variant = "table" }: { limit?: number; variant?: "table" | "compact" }) {
  const order = useStryde((s) => s.order);
  const matches = useStryde((s) => s.matches);
  const remove = useStryde((s) => s.removeMatch);
  const [confirm, setConfirm] = useState<string | null>(null);
  const ids = limit ? order.slice(0, limit) : order;
  if (!ids.length) return null;
  const confirming = confirm ? matches[confirm] : undefined;
  const confirmingTeams = confirming ? teamsOf(confirming) : null;

  if (variant === "compact") {
    return (
      <ul className="divide-y divide-line-soft">
        {ids.map((id) => {
          const m = matches[id];
          if (!m) return null;
          const href = `/app/match/${id}`;
          const t = teamsOf(m);
          return (
            <li key={id} className="relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-page/70 sm:gap-4">
              <Thumb entry={m} href={href} className="w-20 sm:w-24" />
              <div className="min-w-0 flex-1">
                <Title entry={m} href={href} />
                <p className="mt-0.5 truncate text-[13px] text-ink-2">
                  {formatAnalyzedAt(m.createdAt)} · <span className="tabular">{formatDuration(m.meta.durationSeconds)}</span>
                </p>
                <div className="mt-1.5 sm:hidden">
                  <StatusCell entry={m} />
                </div>
              </div>
              <div className="hidden w-36 shrink-0 sm:block">
                <StatusCell entry={m} />
              </div>
              <LinkButton href={href} variant="secondary" size="sm" className="relative z-10 shrink-0">
                View<span className="sr-only">
                  {" "}
                  {t.aName} vs {t.bName}
                </span>
              </LinkButton>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <div
        className="hidden grid-cols-[112px_minmax(0,1fr)_8.5rem_4.5rem_7rem_9.5rem_7.5rem] items-center gap-x-5 border-y border-line-soft bg-page/60 px-5 py-2.5 text-xs font-semibold text-ink-2 lg:grid"
        aria-hidden
      >
        <span>Clip</span>
        <span>Match</span>
        <span>Analyzed</span>
        <span>Length</span>
        <span>Mode</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <ul className="divide-y divide-line-soft border-t border-line-soft lg:border-t-0">
        {ids.map((id) => {
          const m = matches[id];
          if (!m) return null;
          const t = teamsOf(m);
          const href = `/app/match/${id}`;
          return (
            <li
              key={id}
              className="relative grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-page/70 lg:grid-cols-[112px_minmax(0,1fr)_8.5rem_4.5rem_7rem_9.5rem_7.5rem] lg:gap-x-5 lg:py-3"
            >
              <Thumb entry={m} href={href} />

              <div className="min-w-0">
                <Title entry={m} href={href} />
                <p className="mt-0.5 truncate text-[13px] text-ink-2" title={m.meta.fileName}>
                  {m.meta.fileName}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-2 lg:hidden">
                  {formatAnalyzedAt(m.createdAt)} · <span className="tabular">{formatDuration(m.meta.durationSeconds)}</span> · {modeLabel(m)}
                </p>
              </div>

              <p className="hidden text-[13px] text-ink lg:block">{formatAnalyzedAt(m.createdAt)}</p>
              <p className="hidden text-[13px] text-ink tabular lg:block">{formatDuration(m.meta.durationSeconds)}</p>
              <p className="hidden text-[13px] text-ink lg:block">{modeLabel(m)}</p>

              <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 lg:contents">
                <StatusCell entry={m} />
                <div className="relative z-10 flex items-center justify-end gap-1.5">
                  <LinkButton href={href} variant="secondary" size="sm">
                    View<span className="sr-only">
                      {" "}
                      {t.aName} vs {t.bName}
                    </span>
                  </LinkButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 px-0 hover:bg-danger-bg hover:text-danger"
                    aria-label={`Discard ${t.aName} vs ${t.bName}`}
                    title="Discard"
                    onClick={() => setConfirm(id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        title="Discard this analysis?"
        confirmLabel="Discard analysis"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) remove(confirm);
          setConfirm(null);
        }}
      >
        {confirmingTeams && (
          <>
            The results for {confirmingTeams.aName} vs {confirmingTeams.bName} are removed from this tab.{" "}
          </>
        )}
        Your original video file is not touched.
      </ConfirmDialog>
    </>
  );
}
