"use client";

import { useMemo, useState } from "react";
import { frameAt, teamShape, zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { Badge, Segmented } from "@/components/ui/primitives";
import { usePlayback } from "./playback";
import { PitchView, scopeRange, type PitchLayer, type PitchScope, type PitchTeam } from "./PitchView";

export function CoordinateBadge({ result }: { result: AnalysisResult }) {
  const c = result.calibration;
  if (c.method === "homography")
    return (
      <Badge tone={c.quality === "high" ? "ok" : "info"}>
        Calibrated pitch · {c.quality} quality · {Math.round((c.validFraction ?? 0) * 100)}% of frames
      </Badge>
    );
  return <Badge tone="warn">Image-space approximation</Badge>;
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
  const [team, setTeam] = useState<PitchTeam>("both");
  const [layer, setLayer] = useState<PitchLayer>(defaultLayer);
  const [scope, setScope] = useState<PitchScope>(defaultScope);
  const { teamAName, teamBName } = result.teams;
  const calibrated = result.calibration.method === "homography";

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

  const live = frameAt(teamFrames, time, (1 / result.coverage.sampleFps) * 1.5);
  const shapes = live
    ? (["team_a", "team_b"] as const).map((tm) => ({ tm, shape: teamShape(live[tm]) }))
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Team"
          size="sm"
          value={team}
          onChange={setTeam}
          options={[
            { value: "team_a", label: teamAName },
            { value: "team_b", label: teamBName },
            { value: "both", label: "Both" },
          ]}
        />
        <Segmented
          label="Visualization"
          size="sm"
          value={layer}
          onChange={setLayer}
          options={[
            { value: "occupancy", label: "Occupancy" },
            { value: "movement", label: "Movement" },
            { value: "distribution", label: "Distribution" },
            { value: "zones", label: "Zones" },
          ]}
        />
        {layer !== "distribution" && (
          <Segmented
            label="Time scope"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: "upto", label: "Up to now", title: "From kickoff of the clip to the current video time" },
              { value: "window", label: "±5 s", title: "Ten-second window around the current video time" },
              { value: "full", label: "Full clip" },
            ]}
          />
        )}
      </div>

      <PitchView result={result} teamFrames={teamFrames} team={team} layer={layer} scope={scope} time={time} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <CoordinateBadge result={result} />
        <span>
          {layer === "distribution"
            ? live
              ? `Snapshot at ${formatClock(time, true)} · hull and centroid of visible players`
              : "No analyzed frame at this time"
            : layer === "movement"
              ? "Density weighted by frame-to-frame player movement"
              : layer === "zones"
                ? "Share of each team's presence per zone"
                : "Density of tracked player presence"}
          {layer !== "distribution" && scope !== "full" ? ` · synced to ${formatClock(time)}` : ""}
        </span>
      </div>

      {layer === "distribution" && live && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {shapes.map(({ tm, shape }) => (
            <div key={tm} className="rounded-lg border border-line p-2">
              <p className="font-semibold text-ink">{tm === "team_a" ? teamAName : teamBName}</p>
              {shape ? (
                calibrated ? (
                  <p className="text-ink-2">
                    {shape.count} visible · width {shape.width.toFixed(0)} m · depth {shape.depth.toFixed(0)} m
                  </p>
                ) : (
                  <p className="text-ink-2">{shape.count} visible · shape in image-space (not to scale)</p>
                )
              ) : (
                <p className="text-ink-2">Fewer than 3 players visible</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!compact && (
        <p className="text-xs text-ink-2">
          {summary.join(" ")} {calibrated ? "" : "Positions are camera-stabilized image coordinates stretched to the pitch, not true pitch locations. Calibrate to map positions accurately."}
        </p>
      )}
    </div>
  );
}
