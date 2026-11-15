"use client";

import clsx from "clsx";
import { Check, Film, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge, Button, Card, Notice, ProgressBar, TeamChip } from "@/components/ui/primitives";
import { STAGES } from "@/lib/analysis/coordinator";
import { formatDuration } from "@/lib/format";
import { attachPreviewCanvas, useStryde, type MatchEntry } from "@/lib/store";

const PENDING_COLOR = "#9aa5ae";
const MIN_FRAMES_FOR_PARTIAL = 10;

type StepState = "done" | "active" | "pending";

function StepIcon({ state, index }: { state: StepState; index: number }) {
  if (state === "done")
    return (
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-navy-950">
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "active")
    return (
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-card ring-2 ring-brand">
        <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
      </span>
    );
  return (
    <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-page text-xs font-semibold text-ink-2 ring-1 ring-line ring-inset tabular">
      {index + 1}
    </span>
  );
}

/** `title` is accepted for compatibility; the teams are shown as dots plus names instead. */
export function ProcessingView({ entry }: { entry: MatchEntry; title?: string }) {
  const cancel = useStryde((s) => s.cancelAnalysis);
  const stopEarly = useStryde((s) => s.stopEarly);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stopping, setStopping] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const s = entry.session;

  useEffect(() => {
    if (!previewRef.current) return;
    return attachPreviewCanvas(entry.id, previewRef.current);
  }, [entry.id]);

  // Detections over the live frame: thin white boxes for people, a HUD ring for the ball.
  useEffect(() => {
    const rec = entry.lastRecord;
    const o = overlayRef.current;
    const p = previewRef.current;
    if (!rec || !o || !p) return;
    o.width = p.width;
    o.height = p.height;
    const ctx = o.getContext("2d")!;
    ctx.clearRect(0, 0, o.width, o.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    for (const pl of rec.players) {
      ctx.strokeRect(pl.box.x * o.width, pl.box.y * o.height, pl.box.width * o.width, pl.box.height * o.height);
    }
    const best = rec.balls.slice().sort((a, b) => b.confidence - a.confidence)[0];
    if (best) {
      ctx.strokeStyle = "#FFD400";
      ctx.lineWidth = 2.5;
      const cx = (best.box.x + best.box.width / 2) * o.width;
      const cy = (best.box.y + best.box.height / 2) * o.height;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [entry.lastRecord]);

  const indeterminate = s.status === "loading" || s.status === "idle";
  const pct = Math.round(s.progress * 100);
  const current = s.status === "complete" ? STAGES.length : (s.stageIndex ?? 0);
  // the coordinator appends its own estimate to the stage text ("… ~2 min 5 s left")
  const eta = s.stage?.match(/~\s*(.+?)\s+left/)?.[1];
  const etaText = eta && eta !== "…" ? eta : null;
  const canStopEarly = (s.processedFrames ?? 0) >= MIN_FRAMES_FOR_PARTIAL;
  const warnings = [...entry.inputWarnings, ...s.warnings];
  const rec = entry.lastRecord;
  const mode = entry.config.mode === "detailed" ? "More detailed" : "Faster";

  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8">
      <Card className="overflow-hidden">
        {/* header: the match being processed */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-navy-900 sm:w-28">
              {entry.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <Film className="absolute inset-0 m-auto size-5 text-white/45" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-ink">Match processing</h1>
              <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-ink">
                <TeamChip color={entry.config.teamAColor ?? PENDING_COLOR} name={entry.config.teamAName} className="max-w-full" />
                <span className="font-normal text-ink-2">vs</span>
                <TeamChip color={entry.config.teamBColor ?? PENDING_COLOR} name={entry.config.teamBName} className="max-w-full" />
              </p>
              <p className="mt-0.5 truncate text-[13px] text-ink-2" title={entry.meta.fileName}>
                <span className="tabular">{formatDuration(entry.meta.durationSeconds)}</span> · {mode} mode · {entry.meta.fileName}
              </p>
            </div>
          </div>
          <div className="flex items-baseline gap-3 sm:block sm:text-right">
            <p className="text-[28px] leading-none font-bold tracking-tight text-ink tabular" aria-hidden={indeterminate || undefined}>
              {indeterminate ? "–" : `${pct}%`}
            </p>
            {etaText ? (
              <p className="text-[13px] text-ink-2 sm:mt-1.5">
                About <span className="estimate text-ink tabular">{etaText}</span> left
              </p>
            ) : (
              <p className="text-[13px] text-ink-2 sm:mt-1.5">{indeterminate ? "Getting ready" : "Working…"}</p>
            )}
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-6 p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* steps */}
          <div className="min-w-0">
            <ol aria-label="Analysis steps">
              {STAGES.map((label, i) => {
                const state: StepState = i < current ? "done" : i === current ? "active" : "pending";
                const last = i === STAGES.length - 1;
                return (
                  <li key={label} aria-current={state === "active" ? "step" : undefined} className="relative flex gap-3.5 pb-6 last:pb-0">
                    {!last && <span className={clsx("absolute top-9 bottom-1 left-4 w-px -translate-x-1/2", state === "done" ? "bg-brand" : "bg-line")} aria-hidden />}
                    <StepIcon state={state} index={i} />
                    <div className="min-w-0 flex-1 pt-1">
                      <p className={clsx("text-sm", state === "pending" ? "text-ink-2" : "font-semibold text-ink")}>
                        {i + 1}. {label}
                        <span className="sr-only">{state === "done" ? ", done" : state === "active" ? ", in progress" : ", pending"}</span>
                      </p>
                      {state === "done" && <p className="mt-0.5 text-xs text-ink-2">Completed</p>}
                      {state === "pending" && <p className="mt-0.5 text-xs text-ink-2/80">Pending</p>}
                      {state === "active" && (
                        <>
                          <p className="mt-0.5 text-xs font-semibold text-brand-deep">
                            {indeterminate ? "Starting…" : <>Processing… <span className="tabular">{pct}%</span></>}
                          </p>
                          <ProgressBar value={s.progress} indeterminate={indeterminate} className="mt-2 max-w-[18rem]" label="Analysis progress" />
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="sr-only" aria-live="polite">
              {STAGES[current] ?? s.stage ?? "Starting"}
            </p>
            {s.provider && (
              <p className="mt-6 text-xs text-ink-2">
                Running on the <span className="font-semibold text-ink">{s.provider === "webgpu" ? "graphics card (WebGPU)" : s.provider === "webgl" ? "graphics card (WebGL)" : "processor"}</span> of this device.
              </p>
            )}
          </div>

          {/* live preview */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                Preview
                <Badge tone="ok">
                  <span className={clsx("size-1.5 rounded-full bg-current", rec && "animate-pulse")} aria-hidden /> Live
                </Badge>
              </p>
              {rec && (
                <p className="text-xs text-ink-2">
                  <span className="tabular text-ink">{rec.inferenceMs.toFixed(0)}</span> ms per frame
                </p>
              )}
            </div>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-navy-950 ring-1 ring-black/10">
              {!rec && entry.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.thumbnail} alt="" className="absolute inset-0 size-full object-contain opacity-40" />
              )}
              <canvas ref={previewRef} className="absolute inset-0 size-full object-contain" aria-label="Latest analyzed frame" />
              <canvas ref={overlayRef} className="absolute inset-0 size-full object-contain" aria-hidden />
              {!rec && <p className="absolute inset-0 grid place-items-center text-sm text-white/75">Waiting for the first frame…</p>}
            </div>
            <div className="mt-2 flex min-h-5 flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-2">
              <span>
                {s.totalFrames ? (
                  <>
                    Processing frame <span className="tabular text-ink">{(s.processedFrames ?? 0).toLocaleString()}</span> /{" "}
                    <span className="tabular text-ink">{s.totalFrames.toLocaleString()}</span>
                  </>
                ) : (
                  "Preparing frames…"
                )}
              </span>
              {rec && (
                <span>
                  <span className="tabular text-ink">{rec.players.length}</span> people ·{" "}
                  <span className="tabular text-ink">{rec.balls.length}</span> possible ball{rec.balls.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-2 px-5 pb-5">
            {warnings.map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        )}

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft bg-page/50 px-5 py-4">
          <div className="min-w-0 max-w-xl space-y-1 text-xs leading-relaxed text-ink-2">
            <p className="flex items-start gap-1.5">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              This may take a few minutes. It runs inside this tab and is never uploaded, so keep the tab open.
            </p>
            <p>{canStopEarly ? "Stopping early keeps what has been analyzed so far and shows partial results." : "Stopping early becomes possible once a few frames are done."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={stopping || !canStopEarly}
              onClick={() => {
                setStopping(true);
                stopEarly(entry.id);
              }}
            >
              {stopping ? "Finishing…" : "Stop early and see results"}
            </Button>
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel analysis
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this analysis?"
        confirmLabel="Cancel and discard progress"
        cancelLabel="Keep analyzing"
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          cancel(entry.id);
        }}
      >
        The work done so far is thrown away. Your video stays selected, so you can restart the analysis afterwards.
      </ConfirmDialog>
    </div>
  );
}
