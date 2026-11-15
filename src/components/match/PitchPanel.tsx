"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { frameAt, teamShape, zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { readableTextColor } from "@/lib/vision/color";
import { Badge, Magnet, Segmented } from "@/components/ui/primitives";
import { usePlayback } from "./playback";
import { PitchView, scopeRange, teamHeatLegend, teamLetters, type PitchLayer, type PitchScope, type PitchTeam } from "./PitchView";

export function CoordinateBadge() {
  return <Badge tone="info">Camera view</Badge>;
}

const isHeatmapLayer = (l: PitchLayer) => l === "occupancy" || l === "movement";

/** A player dot as drawn on the pitch: team colour, white rim, the team's letter, on a grass chip. */
function PitchDot({ color, letter, held }: { color: string; letter: string; held?: boolean }) {
  return (
    <span aria-hidden className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-pitch">
      <span
        className={clsx("inline-flex size-4 items-center justify-center rounded-full border-[1.5px] border-white text-[9px] leading-none font-bold", held && "border-dashed")}
        style={{ background: color, color: readableTextColor(color) }}
      >
        {letter}
      </span>
    </span>
  );
}

export function PitchPanel({
  result,
  teamFrames,
  defaultLayer = "occupancy",
  defaultScope = "upto",
  compact = false,
}: {
  result: AnalysisResult;
  teamFrames: TeamFrame[];
  defaultLayer?: PitchLayer;
  defaultScope?: PitchScope;
  compact?: boolean;
}) {
  const { time } = usePlayback();
  const [layer, setLayer] = useState<PitchLayer>(defaultLayer);
  const [teamChoice, setTeamChoice] = useState<PitchTeam>(isHeatmapLayer(defaultLayer) ? "team_a" : "both");
  const [scope, setScope] = useState<PitchScope>(defaultScope);
  const isHeatmap = isHeatmapLayer(layer);
  // a heatmap shows one team at a time, so its ramp is that team's colour and it is labelled by name
  const team: PitchTeam = isHeatmap && teamChoice === "both" ? "team_a" : teamChoice;

  // switching layer settles the team scope in the same update (no effect, no wrong first frame)
  const changeLayer = (next: PitchLayer) => {
    const nextHeat = isHeatmapLayer(next);
    if (nextHeat && teamChoice === "both") setTeamChoice("team_a");
    else if (!nextHeat && isHeatmap && teamChoice !== "both") setTeamChoice("both");
    setLayer(next);
  };

  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const [letterA, letterB] = teamLetters(teamAName, teamBName);
  const coarseTime = scope === "full" ? 0 : Math.round(time);
  const summary = useMemo(() => {
    const range = scopeRange(scope, coarseTime, result.video.durationSeconds);
    const teams = team === "both" ? (["team_a", "team_b"] as const) : ([team] as const);
    return teams.map((tm) => {
      const z = zoneShares(teamFrames, tm, range);
      const name = tm === "team_a" ? teamAName : teamBName;
      if (z.total <= 0) return `${name}: no mapped positions in this period.`;
      const [l, m, r] = z.thirds.map((v) => Math.round(v * 100));
      return `${name}: ${l}% left third, ${m}% middle third, ${r}% right third.`;
    });
  }, [teamFrames, team, scope, coarseTime, result.video.durationSeconds, teamAName, teamBName]);

  const interval = 1 / result.coverage.sampleFps;
  const live = frameAt(teamFrames, time, interval * 1.5);
  const liveHeld = live ? Math.abs(live.t - time) > interval * 0.55 : false;
  const shapes = live ? (["team_a", "team_b"] as const).map((tm) => ({ tm, shape: teamShape(live[tm]) })) : [];

  const teamOptions = [
    { value: "team_a" as const, label: <TeamOption color={teamAColor} name={teamAName} /> },
    { value: "team_b" as const, label: <TeamOption color={teamBColor} name={teamBName} /> },
    ...(isHeatmap ? [] : [{ value: "both" as const, label: "Both" }]),
  ];

  const caption =
    layer === "distribution"
      ? live
        ? `Team shape at ${formatClock(time, true)}: outline and centre of the visible players.`
        : "No analyzed frame at this time."
      : layer === "movement"
        ? "Where players moved most, weighted by distance covered between frames."
        : layer === "zones"
          ? "Share of each team's presence in each ninth of the pitch."
          : "Where tracked players spent their time.";
  const synced = layer !== "distribution" && scope !== "full" ? ` Synced to ${formatClock(time)}.` : "";

  const shownTeams = team === "both" ? (["team_a", "team_b"] as const) : ([team] as const);
  const colorOf = (tm: "team_a" | "team_b") => (tm === "team_a" ? teamAColor : teamBColor);
  const nameOf = (tm: "team_a" | "team_b") => (tm === "team_a" ? teamAName : teamBName);
  const letterOf = (tm: "team_a" | "team_b") => (tm === "team_a" ? letterA : letterB);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Visualization"
          value={layer}
          onChange={changeLayer}
          size="sm"
          options={[
            { value: "occupancy", label: "Heatmap" },
            { value: "movement", label: "Movement" },
            { value: "distribution", label: "Shape" },
            { value: "zones", label: "Zones" },
          ]}
        />
        <Segmented label="Team" value={team} onChange={setTeamChoice} size="sm" options={teamOptions} />
        {layer !== "distribution" && (
          <Segmented
            label="Time scope"
            value={scope}
            onChange={setScope}
            size="sm"
            options={[
              { value: "upto", label: "Up to now", title: "From the start of the clip to the current video time" },
              { value: "window", label: "±5 s", title: "Ten-second window around the current video time" },
              { value: "full", label: "Full clip" },
            ]}
          />
        )}
      </div>

      <PitchView result={result} teamFrames={teamFrames} team={team} layer={layer} scope={scope} time={time} />

      {/* what is drawn, and whose it is */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
        {isHeatmap &&
          shownTeams.map((tm) => (
            <span key={tm} className="inline-flex min-w-0 items-center gap-2">
              <TeamName color={colorOf(tm)} name={nameOf(tm)} />
              <span className="inline-flex items-center gap-1.5 text-xs">
                Low
                <span aria-hidden className="pitch-stripes inline-block h-2 w-20 overflow-hidden rounded-full ring-1 ring-navy-950/10">
                  <span className="block size-full" style={{ background: teamHeatLegend(colorOf(tm)) }} />
                </span>
                High
              </span>
            </span>
          ))}
        {layer === "zones" &&
          (shownTeams.length > 1 ? (
            <span>
              In each zone, <TeamName color={teamAColor} name={teamAName} /> is the left value and <TeamName color={teamBColor} name={teamBName} /> the right.
            </span>
          ) : (
            <TeamName color={colorOf(shownTeams[0])} name={nameOf(shownTeams[0])} />
          ))}
        {live && (
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {shownTeams.map((tm) => (
              <span key={tm} className="inline-flex items-center gap-1.5">
                <PitchDot color={colorOf(tm)} letter={letterOf(tm)} />
                {nameOf(tm)}
              </span>
            ))}
            {result.calibration.method === "homography" && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-grid size-5 place-items-center rounded-full bg-pitch">
                  <span className="size-2.5 rounded-full bg-hud ring-1 ring-navy-950" />
                </span>
                Ball
              </span>
            )}
            {liveHeld && (
              <span className="inline-flex items-center gap-1.5">
                <PitchDot color="#ffffff" letter="" held />
                Dashed rim: held from the nearest analyzed frame
              </span>
            )}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-2">
        <CoordinateBadge />
        <span>
          {caption}
          {synced}
        </span>
      </div>

      {layer === "distribution" && live && (
        <div className="grid grid-cols-2 gap-4 border-t border-line-soft pt-4 text-[13px]">
          {shapes.map(({ tm, shape }) => (
            <div key={tm} className={tm === "team_b" ? "text-right" : undefined}>
              <p className={clsx("flex min-w-0 items-center gap-1.5 font-semibold text-ink", tm === "team_b" && "flex-row-reverse")}>
                <Magnet color={colorOf(tm)} />
                <span className="truncate">{nameOf(tm)}</span>
              </p>
              {shape ? (
                <p className="mt-0.5 text-ink-2">
                  <span className="font-hud text-[19px] font-semibold text-ink">{shape.count}</span> visible
                </p>
              ) : (
                <p className="mt-0.5 text-ink-2">Fewer than 3 players visible</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!compact && <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">{summary.join(" ")}</p>}
    </div>
  );
}

function TeamOption({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex max-w-[9rem] items-center gap-1.5">
      <Magnet color={color} size={10} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function TeamName({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 align-middle font-semibold text-ink">
      <Magnet color={color} />
      {name}
    </span>
  );
}
