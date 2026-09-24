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
      <ul className="divide-y divide-line">
        {ids.map((id) => {
          const m = matches[id];
          if (!m) return null;
          return (
            <li key={id} className="flex items-center gap-4 px-5 py-3">
              <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-navy-900">
                {m.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnail} alt="" className="size-full object-cover" />
                ) : (
                  <Film className="absolute inset-0 m-auto size-5 text-white/40" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/app/match/${id}`} className="block truncate font-semibold text-ink hover:underline">
                  {m.config.teamAName} vs {m.config.teamBName}
                </Link>
                <p className="truncate text-xs text-ink-2">
                  {m.meta.fileName} · {formatDuration(m.meta.durationSeconds)} · {formatBytes(m.meta.fileSizeBytes)} ·{" "}
                  {m.config.mode === "detailed" ? "More detailed" : "Faster"}
                </p>
              </div>
              <StatusBadge entry={m} />
              <LinkButton href={`/app/match/${id}`} variant="secondary" size="sm">
                View
              </LinkButton>
              <Button variant="ghost" size="sm" aria-label={`Discard ${m.config.teamAName} vs ${m.config.teamBName}`} onClick={() => setConfirm(id)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
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
