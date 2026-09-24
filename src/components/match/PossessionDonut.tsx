"use client";

import { TeamChip } from "@/components/ui/primitives";
import type { AnalysisResult } from "@/lib/types";

export function PossessionDonut({ result }: { result: AnalysisResult }) {
  const a = result.analytics[0].possessionPercent;
  const b = result.analytics[1].possessionPercent;
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  if (a.value === null || b.value === null) {
    return <p className="text-sm text-ink-2">{a.explanation ?? "Possession unavailable for this clip."}</p>;
  }
  const r = 42;
  const c = 2 * Math.PI * r;
  const aLen = (a.value / 100) * c;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={`Estimated possession ${teamAName} ${a.value.toFixed(0)}%, ${teamBName} ${b.value.toFixed(0)}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke={teamBColor} strokeWidth="12" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={teamAColor} strokeWidth="12" strokeDasharray={`${aLen} ${c - aLen}`} />
        <circle cx="50" cy="50" r={r - 6.5} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      </svg>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="text-xs font-medium tracking-wide text-ink-2 uppercase">Estimated possession</p>
        <div className="flex items-center justify-between gap-3">
          <TeamChip color={teamAColor} name={teamAName} />
          <span className="font-semibold tabular-nums">{a.value.toFixed(0)}%</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <TeamChip color={teamBColor} name={teamBName} />
          <span className="font-semibold tabular-nums">{b.value.toFixed(0)}%</span>
        </div>
        <p className="text-xs text-ink-2">{result.possessionUnknownSeconds.toFixed(0)} s unknown excluded</p>
      </div>
    </div>
  );
}
