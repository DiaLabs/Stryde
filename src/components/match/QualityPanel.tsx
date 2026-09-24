"use client";

import { Notice, QualityBadge } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";

export function isPartial(result: AnalysisResult): boolean {
  return (
    (result.coverage.fraction ?? 1) < 0.98 ||
    result.analytics.some((a) => a.possessionPercent.quality === "unavailable") ||
    result.eventAnalysis.shots === "unavailable" ||
    result.warnings.some((w) => /stopped|could not/i.test(w))
  );
}

export function QualityPanel({ result }: { result: AnalysisResult }) {
  const c = result.coverage;
  const p = result.processing;
  const rows: [string, React.ReactNode][] = [
    ["Analyzed", `${formatClock(c.analyzedDurationSeconds)} of ${formatClock(c.videoDurationSeconds)}`],
    ["Sampled frames", `${c.sampledFrameCount}${c.expectedFrameCount ? ` of ${c.expectedFrameCount}` : ""} · ${c.sampleFps} per second`],
    ["Ball detected in", `${Math.round((result.ball.length / Math.max(1, c.sampledFrameCount)) * 100)}% of sampled frames`],
    [
      "Possession known",
      `${Math.round(
        (result.possessionTimeline.filter((s) => s.teamId !== "unknown").length / Math.max(1, result.possessionTimeline.length)) * 100
      )}% of analyzed time`,
    ],
    [
      "Pitch mapping",
      result.calibration.method === "homography" ? (
        <span className="inline-flex items-center gap-1.5">
          Homography <QualityBadge quality={result.calibration.quality} label={result.calibration.quality} />
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          Image-space <QualityBadge quality="low" label="approximate" />
        </span>
      ),
    ],
    ["Model", `${p.model} · ${p.inputSize}px · ${p.provider === "webgpu" ? "WebGPU" : "WebAssembly"}`],
    ["Processing time", `${(p.durationMs / 1000).toFixed(0)} s`],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {result.calibration.notes && <p className="text-xs text-ink-2">{result.calibration.notes}</p>}
      {[...result.processing.adaptations, ...result.warnings].length > 0 && (
        <div className="space-y-2">
          {[...new Set([...result.processing.adaptations, ...result.warnings])].map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}
