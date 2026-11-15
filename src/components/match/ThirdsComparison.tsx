"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Magnet, QualityBadge, SectionTitle } from "@/components/ui/primitives";
import type { AnalysisResult } from "@/lib/types";

/*
 * The thirds are thirds of the camera view (left to right), not defensive/attacking thirds: the
 * analysis cannot tell which way each team is attacking, so the labels say what is measured.
 */
const THIRDS = [
  { label: "Left third", short: "Left" },
  { label: "Middle third", short: "Middle" },
  { label: "Right third", short: "Right" },
];

/** A small pitch drawing (reference "Possession by Third") with one third lit and the rest dimmed. */
function MiniPitch({ third }: { third: number }) {
  const L = 105;
  const W = 68;
  const line = { fill: "none", stroke: "rgba(255,255,255,0.85)", strokeWidth: 0.9 } as const;
  return (
    <svg viewBox={`-3 -3 ${L + 6} ${W + 6}`} className="block h-auto w-full" aria-hidden focusable="false">
      <rect x={-3} y={-3} width={L + 6} height={W + 6} rx={4} style={{ fill: "var(--color-pitch)" }} />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={i * 17.5 + 8.75} y={0} width={8.75} height={W} style={{ fill: "var(--color-pitch-2)" }} />
      ))}
      {/* dim the two thirds that are not the subject */}
      {[0, 1, 2].map((k) =>
        k === third ? null : <rect key={k} x={(k * L) / 3} y={0} width={L / 3} height={W} style={{ fill: "var(--color-navy-950)" }} fillOpacity={0.42} />
      )}
      <rect x={(third * L) / 3} y={0} width={L / 3} height={W} fill="#fff" fillOpacity={0.1} />
      {/* markings */}
      <rect x={0} y={0} width={L} height={W} {...line} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      <circle cx={L / 2} cy={W / 2} r={9.15} {...line} />
      <rect x={0} y={W / 2 - 20.16} width={16.5} height={40.32} {...line} />
      <rect x={L - 16.5} y={W / 2 - 20.16} width={16.5} height={40.32} {...line} />
      <rect x={0} y={W / 2 - 9.16} width={5.5} height={18.32} {...line} />
      <rect x={L - 5.5} y={W / 2 - 9.16} width={5.5} height={18.32} {...line} />
      {/* the lit third's edge */}
      <rect x={(third * L) / 3} y={0} width={L / 3} height={W} fill="none" stroke="#fff" strokeWidth={1.6} />
    </svg>
  );
}

/**
 * Share of each team's tracked presence per third of the camera view, drawn as three mini pitch
 * cards with Team A % | Team B % under each. Each team's shares add up to 100% across the thirds.
 */
export function ThirdsComparison({ result, title, description }: { result: AnalysisResult; title?: ReactNode; description?: ReactNode }) {
  const [a, b] = result.analytics;
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const quality = a.thirds[0]?.quality ?? "unavailable";
  const estimated = quality === "medium" || quality === "low";
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${v.toFixed(0)}%`);

  return (
    <div className="min-w-0">
      {title && (
        <div className="mb-4">
          <SectionTitle title={title}>{description}</SectionTitle>
        </div>
      )}
      <ul className="grid grid-cols-3 gap-2 sm:gap-4">
        {THIRDS.map((t, i) => {
          const va = a.thirds[i]?.value ?? null;
          const vb = b.thirds[i]?.value ?? null;
          return (
            <li key={t.label} className="min-w-0">
              <MiniPitch third={i} />
              <p className={clsx("mt-2 truncate text-center text-xs font-medium text-ink-2 sm:text-[13px]", estimated && "estimate")}>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </p>
              <p className="mt-1.5 flex items-center justify-between gap-1">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Magnet color={teamAColor} size={8} />
                  <span className="sr-only">{teamAName}: </span>
                  <span className="font-hud text-[17px] leading-none font-bold text-ink sm:text-[19px]">{fmt(va)}</span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1">
                  <span className="sr-only">{teamBName}: </span>
                  <span className="font-hud text-[17px] leading-none font-semibold text-ink-2 sm:text-[19px]">{fmt(vb)}</span>
                  <Magnet color={teamBColor} size={8} />
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Magnet color={teamAColor} size={8} />
          {teamAName}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Magnet color={teamBColor} size={8} />
          {teamBName}
        </span>
        <span className="min-w-0 basis-full sm:basis-auto">
          Thirds of the camera view. Each team&apos;s presence adds up to 100%{estimated ? "; dashed labels are estimates" : ""}.
        </span>
        {(quality === "low" || quality === "unavailable") && <QualityBadge quality={quality} />}
      </div>
    </div>
  );
}
