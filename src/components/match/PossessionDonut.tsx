"use client";

import clsx from "clsx";
import { Magnet } from "@/components/ui/primitives";
import type { AnalysisResult } from "@/lib/types";

const hatch = (c: string, estimated: boolean) =>
  estimated ? `repeating-linear-gradient(135deg, ${c} 0 6px, color-mix(in srgb, ${c} 55%, transparent) 6px 9px)` : c;

const UNKNOWN_FILL = "repeating-linear-gradient(135deg, var(--color-line-soft) 0 4px, var(--color-line) 4px 6px)";

/** Bar widths as shares of all analyzed time (unknown included), so the unknown middle is drawn. */
function possessionShares(result: AnalysisResult) {
  const a = result.analytics[0].possessionPercent;
  const b = result.analytics[1].possessionPercent;
  if (a.value === null || b.value === null) return null;
  const unknown = Math.max(0, result.possessionUnknownSeconds);
  const secA = result.analytics[0].possessionSeconds.value;
  const secB = result.analytics[1].possessionSeconds.value;
  let wa: number;
  let wb: number;
  if (secA !== null && secB !== null && secA + secB + unknown > 0) {
    const total = secA + secB + unknown;
    wa = secA / total;
    wb = secB / total;
  } else {
    // fall back to the percentages when seconds are missing
    const analyzed = Math.max(1e-9, result.coverage.analyzedDurationSeconds);
    const known = Math.max(0, 1 - unknown / analyzed);
    wa = (a.value / 100) * known;
    wb = (b.value / 100) * known;
  }
  return { pa: a.value, pb: b.value, wa, wb, wu: Math.max(0, 1 - wa - wb), unknown, estimated: a.quality !== "high" };
}

/** The split bar itself: Team A from the left, Team B from the right, unknown hatched between. */
function SplitBar({ wa, wb, wu, colorA, colorB, estimated, className }: { wa: number; wb: number; wu: number; colorA: string; colorB: string; estimated: boolean; className?: string }) {
  return (
    <div aria-hidden className={clsx("relative flex gap-0.5 overflow-hidden rounded-full bg-line-soft", className)}>
      <span className="team-fill h-full rounded-l-full" style={{ width: `${wa * 100}%`, background: hatch(colorA, estimated) }} />
      {wu > 0.002 && <span className="h-full" style={{ width: `${wu * 100}%`, background: UNKNOWN_FILL }} />}
      <span className="team-fill h-full rounded-r-full" style={{ width: `${wb * 100}%`, background: hatch(colorB, estimated) }} />
    </div>
  );
}

/**
 * Possession as in the reference "Match Stats" card: 58% · Possession · 42% over one split bar.
 * Team A fills from the left, Team B from the right, and time where the possessing team could not
 * be determined sits hatched in the middle. Percentages are shares of known time, so the unknown
 * section is shown but not counted. Hatched team fills and the dashed label mean "estimated".
 *
 * `compact` draws just the stat row and bar (for the Match Stats card); the default adds the team
 * names, larger figures and a plain-language note.
 */
export function PossessionBar({ result, compact = false }: { result: AnalysisResult; compact?: boolean }) {
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const s = possessionShares(result);
  if (!s) {
    const expl = result.analytics[0].possessionPercent.explanation;
    return <p className="text-[13px] leading-relaxed text-ink-2">{expl ?? "Possession is unavailable for this clip."}</p>;
  }
  const { pa, pb, wa, wb, wu, unknown, estimated } = s;
  const label = estimated ? "Possession (est.)" : "Possession";

  const caption = (
    <figcaption className="sr-only">
      {estimated ? "Estimated possession" : "Possession"}: {teamAName} {pa.toFixed(0)}%, {teamBName} {pb.toFixed(0)}% of known time.{" "}
      {unknown > 0 ? `${unknown.toFixed(0)} seconds where possession is unknown are not counted.` : ""}
    </figcaption>
  );

  if (compact) {
    return (
      <figure className="min-w-0">
        {caption}
        <div aria-hidden className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
          <span className="font-hud text-[26px] leading-none font-bold text-ink">{pa.toFixed(0)}%</span>
          <span className={clsx("text-center text-[13px] font-medium text-ink-2", estimated && "estimate")}>{label}</span>
          <span className="font-hud text-right text-[26px] leading-none font-bold text-ink">{pb.toFixed(0)}%</span>
        </div>
        <SplitBar wa={wa} wb={wb} wu={wu} colorA={teamAColor} colorB={teamBColor} estimated={estimated} className="mt-2.5 h-2" />
        {unknown > 0 && (
          <p aria-hidden className="mt-2 text-xs text-ink-2">
            Hatched grey: <span className="tabular font-medium text-ink">{unknown.toFixed(0)} s</span> with no team in possession, not counted.
          </p>
        )}
      </figure>
    );
  }

  return (
    <figure className="min-w-0">
      {caption}
      <div aria-hidden className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Magnet color={teamAColor} />
            <span className="truncate">{teamAName}</span>
          </p>
          <p className="font-hud mt-1 text-[40px] leading-none font-bold text-ink">{pa.toFixed(0)}%</p>
        </div>
        <p className={clsx("mb-1 shrink-0 text-center text-[13px] font-medium text-ink-2", estimated && "estimate")}>{label}</p>
        <div className="min-w-0 text-right">
          <p className="flex min-w-0 items-center justify-end gap-1.5 text-[13px] font-semibold text-ink">
            <span className="truncate">{teamBName}</span>
            <Magnet color={teamBColor} />
          </p>
          <p className="font-hud mt-1 text-[40px] leading-none font-bold text-ink">{pb.toFixed(0)}%</p>
        </div>
      </div>
      <SplitBar wa={wa} wb={wb} wu={wu} colorA={teamAColor} colorB={teamBColor} estimated={estimated} className="mt-3 h-2.5" />
      <p aria-hidden className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
        {estimated ? "Estimated share of the time a team had the ball." : "Share of the time a team had the ball."}
        {unknown > 0 && (
          <>
            {" "}
            The hatched grey middle is <span className="tabular font-medium text-ink">{unknown.toFixed(0)} s</span> where possession was unknown; it is not
            counted.
          </>
        )}
      </p>
    </figure>
  );
}

/** Kept under its old name so existing callers keep working; it draws the possession bar. */
export const PossessionDonut = PossessionBar;
