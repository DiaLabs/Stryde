"use client";

import clsx from "clsx";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge, Button, Notice, ProgressBar, TeamChip } from "@/components/ui/primitives";
import { STAGES } from "@/lib/analysis/coordinator";
import { formatBytes, formatDuration } from "@/lib/format";
import { getCoordinator, useStryde, type MatchEntry } from "@/lib/store";

export function ProcessingView({ entry, title }: { entry: MatchEntry; title?: string }) {
  const cancel = useStryde((s) => s.cancelAnalysis);
  const stopEarly = useStryde((s) => s.stopEarly);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stopping, setStopping] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const s = entry.session;

  useEffect(() => {
    const c = getCoordinator(entry.id);
    if (c && previewRef.current) c.previewCanvas = previewRef.current;
    return () => {
      if (c) c.previewCanvas = null;
    };
  }, [entry.id]);

  useEffect(() => {
    const rec = entry.lastRecord;
    const o = overlayRef.current;
    const p = previewRef.current;
    if (!rec || !o || !p) return;
    o.width = p.width;
    o.height = p.height;
    const ctx = o.getContext("2d")!;
    ctx.clearRect(0, 0, o.width, o.height);
    ctx.lineWidth = 1.5;
    for (const pl of rec.players) {
      ctx.strokeStyle = "rgba(32,199,133,0.95)";
      ctx.strokeRect(pl.box.x * o.width, pl.box.y * o.height, pl.box.width * o.width, pl.box.height * o.height);
    }
    const best = rec.balls.slice().sort((a, b) => b.confidence - a.confidence)[0];
    if (best) {
      ctx.strokeStyle = "#FFD400";
      ctx.lineWidth = 2;
      const cx = (best.box.x + best.box.width / 2) * o.width;
      const cy = (best.box.y + best.box.height / 2) * o.height;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [entry.lastRecord]);

  const indeterminate = s.status === "loading" || s.status === "idle";

  const { phase, progressText } = useMemo(() => {
    const phase = s.status === "processing" ? 1 : s.status === "rendering" ? 3 : s.status === "complete" ? 5 : 0;
    const pct = indeterminate ? null : Math.round(s.progress * 100);
    const frames = s.totalFrames ? `${s.processedFrames ?? 0} / ${s.totalFrames}` : null;
    const provider = s.provider ? (s.provider === "webgpu" ? "GPU" : "CPU") : null;
    const parts = [pct !== null ? `${pct}%` : null, frames, provider].filter(Boolean);
    return { phase, progressText: parts.join(" · ") || "Starting…" };
  }, [s, indeterminate]);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 px-4 py-4 sm:px-8">
      <div className="w-full max-w-5xl rounded-2xl border border-line bg-card p-4 shadow-sm">
        {/* Compact header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-navy-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {entry.thumbnail && <img src={entry.thumbnail} alt="" className="size-full object-cover" />}
            </div>
            <div>
              {title && <p className="text-sm font-semibold">{title}</p>}
              <p className="flex items-center gap-x-2 text-sm">
                <TeamChip color={entry.config.teamAColor ?? "#9aa5ae"} name={entry.config.teamAName} />
                <span className="text-ink-2">vs</span>
                <TeamChip color={entry.config.teamBColor ?? "#9aa5ae"} name={entry.config.teamBName} />
              </p>
            </div>
          </div>
          <Badge tone="info">{entry.config.mode === "detailed" ? "More detailed" : "Faster"}</Badge>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium" aria-live="polite">
            {s.stage ?? "Starting…"}
          </p>
          <span className="text-xs tabular-nums text-ink-2">{progressText}</span>
        </div>
        <ProgressBar value={s.progress} indeterminate={indeterminate} className="mt-2" />

        {/* Live preview */}
        <div className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-navy-950">
          <canvas ref={previewRef} className="absolute inset-0 size-full object-contain" aria-label="Latest analyzed frame" />
          <canvas ref={overlayRef} className="absolute inset-0 size-full object-contain" aria-hidden />
          {!entry.lastRecord && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Waiting for the first frame…</div>
          )}
        </div>
        {entry.lastRecord && (
          <p className="mt-2 text-xs text-ink-2">
            {entry.lastRecord.players.length} people · {entry.lastRecord.balls.length} ball candidate{entry.lastRecord.balls.length === 1 ? "" : "s"} ·{" "}
            {entry.lastRecord.inferenceMs.toFixed(0)} ms inference
          </p>
        )}

        {/* Horizontal steps */}
        <ol className="mt-5 flex items-start justify-between gap-2">
          {STAGES.map((label, i) => {
            const done = phase === 1 ? i === 0 : i < phase;
            const active = phase === 1 ? i === 1 || i === 2 : i === phase;
            return (
              <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span
                  className={clsx(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                    done ? "border-brand bg-brand text-navy-950" : active ? "border-brand text-[#11704a]" : "border-line text-ink-2"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                </span>
                <span className={clsx("text-center text-[11px] leading-tight", done || active ? "text-ink" : "text-ink-2", active && "font-semibold")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Footer: notice + actions */}
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Notice tone="ok" className="sm:max-w-md">
            Analyzed inside this tab, never uploaded. Keep this tab open.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancel analysis
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={stopping || (s.processedFrames ?? 0) < 10}
              onClick={() => {
                setStopping(true);
                stopEarly(entry.id);
              }}
              title="Finish now and view results for the part already analyzed"
            >
              {stopping ? "Finishing…" : "Stop & view partial results"}
            </Button>
          </div>
        </div>

        {(s.warnings.length > 0 || entry.inputWarnings.length > 0) && (
          <div className="mt-4 space-y-2">
            {[...entry.inputWarnings, ...s.warnings].map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this analysis?"
        confirmLabel="Cancel analysis"
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          cancel(entry.id);
        }}
      >
        Work done so far will be discarded. You can restart the analysis afterwards.
      </ConfirmDialog>
    </div>
  );
}
