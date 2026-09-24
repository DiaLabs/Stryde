"use client";

import clsx from "clsx";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge, Button, Card, Notice, ProgressBar, TeamChip } from "@/components/ui/primitives";
import { STAGES } from "@/lib/analysis/coordinator";
import { formatBytes, formatDuration } from "@/lib/format";
import { getCoordinator, useStryde, type MatchEntry } from "@/lib/store";

export function ProcessingView({ entry }: { entry: MatchEntry }) {
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
  return (
    <div className="grid gap-5 px-4 pb-12 sm:px-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <Card>
        <div className="flex items-center gap-4 border-b border-line px-5 py-4">
          <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-navy-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {entry.thumbnail && <img src={entry.thumbnail} alt="" className="size-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 font-semibold">
              <TeamChip color={entry.config.teamAColor ?? "#9aa5ae"} name={entry.config.teamAName} />
              <span className="text-ink-2">vs</span>
              <TeamChip color={entry.config.teamBColor ?? "#9aa5ae"} name={entry.config.teamBName} />
            </p>
            <p className="truncate text-xs text-ink-2">
              {entry.meta.fileName} · {formatDuration(entry.meta.durationSeconds)} · {entry.meta.width}×{entry.meta.height}
              {entry.meta.frameRate ? ` · ${entry.meta.frameRate} fps` : ""} · {formatBytes(entry.meta.fileSizeBytes)}
            </p>
          </div>
          <Badge tone="info">{entry.config.mode === "detailed" ? "More detailed" : "Faster"}</Badge>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold" aria-live="polite">
              {s.stage ?? "Starting…"}
            </p>
            {!indeterminate && <span className="text-sm font-semibold tabular-nums">{Math.round(s.progress * 100)}%</span>}
          </div>
          <ProgressBar value={s.progress} indeterminate={indeterminate} className="mt-3" />
          {s.totalFrames ? (
            <p className="mt-2 text-xs text-ink-2">
              {s.processedFrames ?? 0} of {s.totalFrames} sampled frames analyzed
              {s.provider ? ` · ${s.provider === "webgpu" ? "GPU (WebGPU)" : "CPU (WebAssembly)"}` : ""}
            </p>
          ) : s.stage?.startsWith("Loading analysis engine") ? (
            <p className="mt-2 text-xs text-ink-2">Waiting for the analysis engine to finish loading…</p>
          ) : (
            <p className="mt-2 text-xs text-ink-2">Preparing your video for analysis…</p>
          )}

          <ol className="mt-6 space-y-3">
            {STAGES.map((label, i) => {
              // Detection (1) and tracking/teams (2) run together per frame.
              const phase = s.status === "processing" ? 1 : s.status === "rendering" ? 3 : s.status === "complete" ? 5 : 0;
              const done = phase === 1 ? i === 0 : i < phase;
              const active = phase === 1 ? i === 1 || i === 2 : i === phase;
              return (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={clsx(
                      "grid size-7 shrink-0 place-items-center rounded-full border",
                      done ? "border-brand bg-brand text-navy-950" : active ? "border-brand text-[#11704a]" : "border-line text-ink-2"
                    )}
                  >
                    {done ? <Check className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : i + 1}
                  </span>
                  <span className={clsx(done || active ? "text-ink" : "text-ink-2", active && "font-semibold")}>{label}</span>
                  <span className="ml-auto text-xs text-ink-2">{done ? "Done" : active ? "In progress" : "Pending"}</span>
                </li>
              );
            })}
          </ol>

          {(s.warnings.length > 0 || entry.inputWarnings.length > 0) && (
            <div className="mt-5 space-y-2">
              {[...entry.inputWarnings, ...s.warnings].map((w) => (
                <Notice key={w} tone="warn">
                  {w}
                </Notice>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel analysis
            </Button>
            <Button
              variant="secondary"
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
      </Card>

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <span className="text-xs text-ink-2">Latest analyzed frame · raw detections</span>
          </div>
          <div className="relative aspect-video bg-navy-950">
            <canvas ref={previewRef} className="absolute inset-0 size-full object-contain" aria-label="Latest analyzed frame" />
            <canvas ref={overlayRef} className="absolute inset-0 size-full object-contain" aria-hidden />
            {!entry.lastRecord && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Waiting for the first frame…</div>
            )}
          </div>
          {entry.lastRecord && (
            <p className="px-5 py-2 text-xs text-ink-2">
              {entry.lastRecord.players.length} people · {entry.lastRecord.balls.length} ball candidate{entry.lastRecord.balls.length === 1 ? "" : "s"} ·{" "}
              {entry.lastRecord.inferenceMs.toFixed(0)} ms inference
            </p>
          )}
        </Card>
        <Notice tone="ok" title="Processing locally">
          Your video is analyzed inside this tab and is not uploaded. Keep this tab open — closing or reloading it stops the analysis and discards results.
        </Notice>
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
