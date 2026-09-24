"use client";

import { QualityBadge } from "@/components/ui/primitives";
import type { AnalysisResult } from "@/lib/types";
import { readableTextColor } from "@/lib/vision/color";

export function ThirdsComparison({ result }: { result: AnalysisResult }) {
  const [a, b] = result.analytics;
  const labels = result.calibration.method === "homography" ? ["Left third", "Middle third", "Right third"] : ["Left of view", "Centre of view", "Right of view"];
  const { teamAColor, teamBColor, teamAName, teamBName } = result.teams;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {labels.map((l, i) => {
          const va = a.thirds[i].value;
          const vb = b.thirds[i].value;
          return (
            <div key={l} className="rounded-lg border border-line p-3 text-center">
              <div className="pitch-stripes relative mx-auto mb-2 h-12 w-full overflow-hidden rounded">
                <div className="absolute inset-y-0 border-x border-white/70" style={{ left: `${i * 33.33}%`, width: "33.33%", background: "rgba(255,255,255,0.25)" }} />
              </div>
              <p className="text-xs font-semibold">{l}</p>
              <div className="mt-1.5 flex justify-center gap-2 text-sm font-bold tabular-nums">
                {[
                  [va, teamAColor, teamAName],
                  [vb, teamBColor, teamBName],
                ].map(([v, color, name]) => (
                  <span
                    key={name as string}
                    title={name as string}
                    className="rounded px-1.5 py-0.5 ring-1 ring-black/10"
                    style={{ background: color as string, color: readableTextColor(color as string) }}
                  >
                    {v === null ? "–" : `${(v as number).toFixed(0)}%`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>Share of each team&apos;s tracked presence per third ({teamAName} left value, {teamBName} right value).</span>
        <QualityBadge quality={a.thirds[0].quality} />
      </div>
    </div>
  );
}
