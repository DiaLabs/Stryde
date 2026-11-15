"use client";

import clsx from "clsx";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, Magnet, QualityBadge } from "@/components/ui/primitives";
import type { MatchEntry } from "@/lib/store";
import type { AnalysisResult } from "@/lib/types";

const field =
  "h-10 w-full min-w-0 rounded-lg border border-line bg-card px-3 text-sm text-ink transition-colors hover:border-[#cfd6db] focus-visible:border-brand";

export function TeamSettingsPanel({
  entry,
  result,
  onColors,
  onNames,
  className,
}: {
  entry: MatchEntry;
  result: AnalysisResult;
  onColors: (a: string | undefined, b: string | undefined) => void;
  onNames: (a: string, b: string) => void;
  className?: string;
}) {
  const [nameA, setNameA] = useState(result.teams.teamAName);
  const [nameB, setNameB] = useState(result.teams.teamBName);
  const conf = result.teams.colorConfidence;
  const confQ = conf >= 0.6 ? "medium" : "low";
  const counts = (["team_a", "team_b", "unknown"] as const).map((t) => result.tracks.filter((tr) => tr.teamId === t && tr.observations.length >= 3).length);
  const userSet = result.teams.colorSource === "user" || !!entry.overrides.teamAColor || !!entry.overrides.teamBColor;
  const commitNames = () => onNames(nameA.trim() || "Team A", nameB.trim() || "Team B");

  return (
    <Card className={clsx("min-w-0", className)}>
      <CardHeader
        title="Team names and colours"
        subtitle="Teams are split by shirt colour. Correct a colour and team assignment, possession and every team figure are worked out again from the stored detections straight away."
      />
      <div className="px-5 pb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-line-soft bg-page px-3.5 py-2.5 text-[13px]">
          <span className="text-ink-2">Colours</span>
          <span className="font-semibold text-ink">{result.teams.colorSource === "user" ? "set by you" : "detected automatically"}</span>
          <QualityBadge quality={confQ} label={`${Math.round(conf * 100)}% separation`} className="ml-auto" />
        </div>

        <div className="mt-2 divide-y divide-line-soft">
          {(
            [
              ["A", nameA, setNameA, result.teams.teamAColor, counts[0]],
              ["B", nameB, setNameB, result.teams.teamBColor, counts[1]],
            ] as const
          ).map(([k, name, setName, color, count]) => (
            <fieldset key={k} className="min-w-0 py-4">
              <legend className="sr-only">Team {k}</legend>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span aria-hidden className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Magnet color={color} size={12} />
                  Team {k}
                </span>
                <span className="text-[13px] text-ink-2">
                  <span className="font-semibold text-ink tabular">{count}</span> players tracked
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] font-medium text-ink-2" htmlFor={`team-name-${k}`}>
                    Name
                  </label>
                  <input
                    id={`team-name-${k}`}
                    value={name}
                    maxLength={32}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitNames}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNames();
                    }}
                    className={field}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-ink-2" htmlFor={`team-color-${k}`}>
                    Shirt colour
                  </label>
                  <input
                    id={`team-color-${k}`}
                    type="color"
                    value={color}
                    onChange={(e) => (k === "A" ? onColors(e.target.value, result.teams.teamBColor) : onColors(result.teams.teamAColor, e.target.value))}
                    className="block h-10 w-full min-w-[5.5rem] cursor-pointer rounded-lg border border-line bg-card p-1 transition-colors hover:border-[#cfd6db]"
                  />
                </div>
              </div>
            </fieldset>
          ))}
        </div>

        <p className="border-t border-line-soft pt-4 text-[13px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink tabular">{counts[2]}</span> tracked players could not be placed in either team (unclear colours, referees
          or goalkeepers). The video is not processed again; tracks, ball detections and events cannot be edited.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => onColors(result.teams.teamBColor, result.teams.teamAColor)}>
            <ArrowLeftRight className="size-4" aria-hidden /> Swap team colours
          </Button>
          <Button variant="secondary" size="sm" disabled={!userSet} onClick={() => onColors("", "")}>
            <RotateCcw className="size-4" aria-hidden /> Use detected colours
          </Button>
        </div>
      </div>
    </Card>
  );
}
