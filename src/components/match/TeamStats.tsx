"use client";

import { InfoTip, QualityBadge, TeamChip } from "@/components/ui/primitives";
import { formatMetric } from "@/lib/format";
import type { AnalysisResult, MetricValue, TeamAnalytics } from "@/lib/types";

type Row = { key: keyof TeamAnalytics; label: string; digits?: number };

const ROWS: Row[] = [
  { key: "possessionPercent", label: "Possession" },
  { key: "possessionSeconds", label: "Possession time", digits: 0 },
  { key: "shotCount", label: "Shots (estimated)" },
  { key: "goalCount", label: "Possible goals" },
  { key: "averageVisiblePlayers", label: "Avg. players visible", digits: 1 },
  { key: "distanceMeters", label: "Tracked distance", digits: 0 },
  { key: "averageSpeedMetersPerSecond", label: "Avg. speed", digits: 1 },
  { key: "widthMeters", label: "Team width", digits: 1 },
  { key: "depthMeters", label: "Team depth", digits: 1 },
  { key: "compactness", label: "Compactness", digits: 1 },
];

export function TeamStats({ result, compact = false }: { result: AnalysisResult; compact?: boolean }) {
  const [a, b] = result.analytics;
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const rows = compact ? ROWS.slice(0, 5) : ROWS;
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line px-5 pb-3 text-sm font-semibold">
        <TeamChip color={teamAColor} name={teamAName} />
        <span className="text-xs font-medium text-ink-2">vs</span>
        <TeamChip color={teamBColor} name={teamBName} className="justify-self-end" />
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const va = a[r.key] as MetricValue;
          const vb = b[r.key] as MetricValue;
          const both = va.value !== null && vb.value !== null;
          const total = both ? (va.value as number) + (vb.value as number) : 0;
          const share = both && total > 0 ? (va.value as number) / total : 0.5;
          const q = va.quality === "unavailable" ? vb.quality : va.quality;
          const expl = va.explanation ?? vb.explanation;
          return (
            <li key={r.key} className="px-5 py-2.5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className="text-base font-semibold tabular-nums">{formatMetric(va.value, va.unit, r.digits)}</span>
                <span className="flex items-center gap-1.5 text-center text-xs text-ink-2">
                  {r.label}
                  {expl && <InfoTip text={expl} />}
                </span>
                <span className="justify-self-end text-base font-semibold tabular-nums">{formatMetric(vb.value, vb.unit, r.digits)}</span>
              </div>
              {both && total > 0 ? (
                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-page" aria-hidden>
                  <span style={{ width: `${share * 100}%`, background: teamAColor }} className="border-r border-white" />
                  <span style={{ width: `${(1 - share) * 100}%`, background: teamBColor }} />
                </div>
              ) : null}
              {q !== "medium" && q !== "high" && (
                <div className="mt-1 flex justify-center">
                  <QualityBadge quality={q} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
