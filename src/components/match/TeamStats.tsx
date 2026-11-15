"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { InfoTip, Magnet, QualityBadge, SectionTitle } from "@/components/ui/primitives";
import { formatMetric } from "@/lib/format";
import type { AnalysisResult, MetricValue, QualityLevel, TeamAnalytics } from "@/lib/types";
import { PossessionBar } from "./PossessionDonut";

type StatKey = Exclude<keyof TeamAnalytics, "teamId" | "thirds" | "occupancyGrid">;
type Row = { key: StatKey; label: string; digits?: number };

const ROWS: Row[] = [
  { key: "possessionPercent", label: "Possession" },
  { key: "possessionSeconds", label: "Possession time", digits: 0 },
  { key: "shotCount", label: "Shots" },
  { key: "goalCount", label: "Possible goals" },
  { key: "averageVisiblePlayers", label: "Players visible", digits: 1 },
  { key: "distanceMeters", label: "Tracked distance", digits: 0 },
  { key: "averageSpeedMetersPerSecond", label: "Average speed", digits: 1 },
  { key: "widthMeters", label: "Team width", digits: 1 },
  { key: "depthMeters", label: "Team depth", digits: 1 },
  { key: "compactness", label: "Compactness", digits: 1 },
];

/** Worst of the two sides' quality, so a row is never shown as more certain than its weaker value. */
function rowQuality(a: QualityLevel, b: QualityLevel): QualityLevel {
  const order: QualityLevel[] = ["unavailable", "low", "medium", "high"];
  if (a === "unavailable") return b;
  if (b === "unavailable") return a;
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

/** Team A on the left, Team B on the right: the header every mirrored comparison sits under. */
export function TeamAxisHeader({ result }: { result: AnalysisResult }) {
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2.5 text-[13px] font-semibold text-ink">
      <span className="flex min-w-0 items-center gap-1.5">
        <Magnet color={teamAColor} />
        <span className="truncate">{teamAName}</span>
      </span>
      <span aria-hidden className="shrink-0 text-xs font-medium text-ink-2">
        vs
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="truncate">{teamBName}</span>
        <Magnet color={teamBColor} />
      </span>
    </div>
  );
}

/**
 * Team figures in the reference "Match Stats" style: possession as a split bar on top, then rows of
 * Team A value | metric | Team B value. A dashed label marks an estimate; a quality badge appears
 * only where confidence is low or the value is unavailable, so the card stays quiet.
 */
export function TeamStats({
  result,
  compact = false,
  title,
  description,
  keys,
}: {
  result: AnalysisResult;
  compact?: boolean;
  /** Optional heading drawn as a SectionTitle above the rows. */
  title?: ReactNode;
  description?: ReactNode;
  /** Show only these metrics, in this order. */
  keys?: StatKey[];
}) {
  const [a, b] = result.analytics;
  const { teamAName, teamBName } = result.teams;
  const rows = keys ? keys.map((k) => ROWS.find((r) => r.key === k)).filter((r): r is Row => !!r) : compact ? ROWS.slice(0, 5) : ROWS;
  const showPossession = rows.some((r) => r.key === "possessionPercent");
  const statRows = rows.filter((r) => r.key !== "possessionPercent");
  const anyEstimated = rows.some((r) => {
    const q = rowQuality((a[r.key] as MetricValue).quality, (b[r.key] as MetricValue).quality);
    return q === "medium" || q === "low";
  });

  return (
    <div className="min-w-0">
      {title && (
        <div className="mb-4">
          <SectionTitle title={title}>{description}</SectionTitle>
        </div>
      )}
      <TeamAxisHeader result={result} />
      {showPossession && (
        <div className="border-b border-line-soft py-4">
          <PossessionBar result={result} compact />
        </div>
      )}
      <ul className="divide-y divide-line-soft">
        {statRows.map((r) => {
          const va = a[r.key] as MetricValue;
          const vb = b[r.key] as MetricValue;
          const q = rowQuality(va.quality, vb.quality);
          const expl = va.explanation ?? vb.explanation;
          const unit = va.value !== null ? va.unit : vb.unit;
          const fa = formatMetric(va.value, unit, r.digits);
          const fb = formatMetric(vb.value, unit, r.digits);
          const estimated = q === "medium" || q === "low";
          return (
            <li key={r.key} className="grid grid-cols-[minmax(3.5rem,1fr)_auto_minmax(3.5rem,1fr)] items-center gap-3 py-2.5">
              <span className="font-hud text-[20px] leading-none font-semibold text-ink">
                <span className="sr-only">{teamAName}: </span>
                {fa}
              </span>
              <span className="flex flex-col items-center gap-1 text-center">
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2">
                  <span className={clsx(estimated && "estimate")}>{r.label}</span>
                  {expl && <InfoTip text={expl} />}
                </span>
                {(q === "low" || q === "unavailable") && <QualityBadge quality={q} />}
              </span>
              <span className="font-hud text-right text-[20px] leading-none font-semibold text-ink">
                <span className="sr-only">{teamBName}: </span>
                {fb}
              </span>
            </li>
          );
        })}
      </ul>
      {(anyEstimated || !compact) && (
        <p className="mt-3 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-2">
          {anyEstimated && "Dashed labels and hatched bars are estimates. "}
          {!compact && "Values cover only players the camera could see."}
        </p>
      )}
    </div>
  );
}
