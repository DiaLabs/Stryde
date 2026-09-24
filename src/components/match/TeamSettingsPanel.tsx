"use client";

import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button, QualityBadge } from "@/components/ui/primitives";
import type { MatchEntry } from "@/lib/store";
import type { AnalysisResult } from "@/lib/types";

export function TeamSettingsPanel({
  entry,
  result,
  onColors,
  onNames,
}: {
  entry: MatchEntry;
  result: AnalysisResult;
  onColors: (a: string | undefined, b: string | undefined) => void;
  onNames: (a: string, b: string) => void;
}) {
  const [nameA, setNameA] = useState(result.teams.teamAName);
  const [nameB, setNameB] = useState(result.teams.teamBName);
  const conf = result.teams.colorConfidence;
  const confQ = conf >= 0.6 ? "medium" : conf >= 0.3 ? "low" : "low";
  const counts = (["team_a", "team_b", "unknown"] as const).map((t) => result.tracks.filter((tr) => tr.teamId === t && tr.observations.length >= 3).length);
  const userSet = result.teams.colorSource === "user" || !!entry.overrides.teamAColor || !!entry.overrides.teamBColor;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-ink-2">
        Team assignment uses jersey colors. Correcting a color re-runs team assignment, possession and all team analytics instantly from the stored
        detections — the video is not re-processed. Tracks, ball detections and events themselves cannot be edited.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-2">Color source:</span>
        <span className="font-medium">{result.teams.colorSource === "user" ? "Set by you" : "Auto-detected"}</span>
        <QualityBadge quality={confQ} label={`Separation ${Math.round(conf * 100)}%`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["A", nameA, setNameA, result.teams.teamAColor, counts[0]],
            ["B", nameB, setNameB, result.teams.teamBColor, counts[1]],
          ] as const
        ).map(([k, name, setName, color, count]) => (
          <div key={k} className="space-y-2 rounded-lg border border-line p-3">
            <label className="block text-xs font-semibold text-ink-2" htmlFor={`name-${k}`}>
              Team {k} name
            </label>
            <input
              id={`name-${k}`}
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => onNames(nameA.trim() || "Team A", nameB.trim() || "Team B")}
              className="h-9 w-full rounded-md border border-line px-2 outline-none focus:border-brand"
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                aria-label={`Team ${k} jersey color`}
                onChange={(e) => (k === "A" ? onColors(e.target.value, result.teams.teamBColor) : onColors(result.teams.teamAColor, e.target.value))}
                className="h-9 w-12 cursor-pointer rounded border border-line p-0.5"
              />
              <span className="text-xs text-ink-2">{count} tracks assigned</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-2">{counts[2]} tracks are Unknown (ambiguous colors, referees or goalkeepers).</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onColors(result.teams.teamBColor, result.teams.teamAColor)}>
          <ArrowLeftRight className="size-4" /> Swap team colors
        </Button>
        <Button variant="secondary" size="sm" disabled={!userSet} onClick={() => onColors("", "")}>
          <RotateCcw className="size-4" /> Reset to auto-detected
        </Button>
      </div>
    </div>
  );
}
