"use client";

import { Film, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, LinkButton } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatBytes, formatDuration } from "@/lib/format";
import { useStryde, type MatchEntry } from "@/lib/store";

export function StatusBadge({ entry }: { entry: MatchEntry }) {
  const s = entry.session.status;
  if (s === "complete") {
    const partial = entry.result && (entry.result.warnings.length > 0 || (entry.result.coverage.fraction ?? 1) < 0.98);
    return partial ? <Badge tone="warn">Completed · partial</Badge> : <Badge tone="ok">Completed</Badge>;
  }
  if (s === "failed") return <Badge tone="danger">Failed</Badge>;
  if (s === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  if (s === "idle") return <Badge tone="neutral">Queued</Badge>;
  return (
    <Badge tone="info">
      <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      Processing {Math.round(entry.session.progress * 100)}%
    </Badge>
  );
}

export function MatchList({ limit }: { limit?: number }) {
  const order = useStryde((s) => s.order);
  const matches = useStryde((s) => s.matches);
  const remove = useStryde((s) => s.removeMatch);
  const [confirm, setConfirm] = useState<string | null>(null);
  const ids = limit ? order.slice(0, limit) : order;
  if (!ids.length) return null;
  return (
    <>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {ids.map((id) => {
          const m = matches[id];
          if (!m) return null;
          return (
            <div key={id} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-card transition-shadow hover:shadow-md">
              <Link href={`/app/match/${id}`} className="relative aspect-video overflow-hidden bg-navy-900">
                {m.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <Film className="absolute inset-0 m-auto size-8 text-white/40" aria-hidden />
                )}
                <div className="absolute top-2 right-2">
                  <StatusBadge entry={m} />
                </div>
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <Link href={`/app/match/${id}`} className="truncate text-base font-semibold text-ink hover:underline">
                  {m.config.teamAName} vs {m.config.teamBName}
                </Link>
                <p className="truncate text-sm text-ink-2">
                  {m.meta.fileName} · {formatDuration(m.meta.durationSeconds)}
                </p>
                <p className="mt-1 truncate text-xs text-ink-2">
                  {formatBytes(m.meta.fileSizeBytes)} · {m.config.mode === "detailed" ? "More detailed" : "Faster"}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <LinkButton href={`/app/match/${id}`} variant="secondary" size="sm" className="flex-1">
                    View
                  </LinkButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Discard ${m.config.teamAName} vs ${m.config.teamBName}`}
                    onClick={() => setConfirm(id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!confirm}
        title="Discard this analysis?"
        confirmLabel="Discard"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) remove(confirm);
          setConfirm(null);
        }}
      >
        The results and in-memory video reference are removed from this tab. Your original file is not affected.
      </ConfirmDialog>
    </>
  );
}
