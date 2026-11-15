"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Card, CardHeader, Notice, ProgressBar } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";

export { isPartial } from "@/lib/result";

/** Coverage and processing facts: a coverage meter, then a definition list. */
export function QualityPanel({ result, className }: { result: AnalysisResult; className?: string }) {
  const c = result.coverage;
  const p = result.processing;
  const covered = c.videoDurationSeconds > 0 ? Math.min(1, c.analyzedDurationSeconds / c.videoDurationSeconds) : 0;
  const ballPct = Math.round((result.ball.length / Math.max(1, c.sampledFrameCount)) * 100);
  const possPct = Math.round(
    (result.possessionTimeline.filter((s) => s.teamId !== "unknown").length / Math.max(1, result.possessionTimeline.length)) * 100
  );
  const rows: [string, ReactNode][] = [
    [
      "Sampled frames",
      c.expectedFrameCount ? (
        <>
          {c.sampledFrameCount} <Quiet>of {c.expectedFrameCount}</Quiet>
        </>
      ) : (
        c.sampledFrameCount
      ),
    ],
    [
      "Sample rate",
      <>
        {c.sampleFps} <Quiet>frames a second</Quiet>
      </>,
    ],
    [
      "Ball seen in",
      <>
        {ballPct}% <Quiet>of sampled frames</Quiet>
      </>,
    ],
    [
      "Possession known for",
      <>
        {possPct}% <Quiet>of analyzed time</Quiet>
      </>,
    ],
    ["Analysis mode", p.mode === "detailed" ? "More detailed" : "Faster"],
    [
      "Detection model",
      <>
        {p.model} <Quiet>{p.inputSize} px input</Quiet>
      </>,
    ],
    ["Ran on", p.provider === "webgpu" ? "Graphics card (WebGPU)" : p.provider === "webgl" ? "Graphics card (WebGL)" : "Processor (WebAssembly)"],
    [
      "Processing time",
      <>
        {(p.durationMs / 1000).toFixed(0)} <Quiet>seconds</Quiet>
      </>,
    ],
  ];
  const notes = [...new Set([...p.adaptations, ...result.warnings])];
  return (
    <Card className={clsx("min-w-0", className)}>
      <CardHeader title="Data quality and coverage" subtitle="How much of the clip was analyzed and what the figures rest on." />
      <div className="px-5 pb-5">
        <div className="rounded-lg border border-line-soft bg-page px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-2">Clip analyzed</span>
            <span className="text-[13px] text-ink-2 tabular">
              <span className="font-hud text-xl font-semibold text-ink">{formatClock(c.analyzedDurationSeconds)}</span> of{" "}
              {formatClock(c.videoDurationSeconds)}
            </span>
          </div>
          <ProgressBar value={covered} label="Share of the clip analyzed" className="mt-2.5" />
        </div>
        <dl className="mt-3 divide-y divide-line-soft">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 py-2.5">
              <dt className="text-[13px] text-ink-2">{k}</dt>
              <dd className="min-w-0 text-right text-sm font-semibold break-words text-ink tabular">{v}</dd>
            </div>
          ))}
        </dl>
        {notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {notes.map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <span className="font-normal text-ink-2">{children}</span>;
}
