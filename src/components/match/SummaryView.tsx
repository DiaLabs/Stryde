"use client";

import { Play } from "lucide-react";
import { Card, CardHeader, Magnet, Notice, QualityBadge } from "@/components/ui/primitives";
import { zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { formatClock, formatMetric } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { PitchPanel } from "./PitchPanel";
import { usePlaybackControls } from "./playback";
import { isPartial } from "./QualityPanel";
import { TeamStats } from "./TeamStats";

/** Descriptive, evidence-based takeaways. Only statements backed by available metrics are produced. */
function takeaways(result: AnalysisResult, teamFrames: TeamFrame[]): { text: string; q: "medium" | "low" }[] {
  const out: { text: string; q: "medium" | "low" }[] = [];
  const [a, b] = result.analytics;
  const { teamAName, teamBName } = result.teams;
  const pa = a.possessionPercent.value;
  if (pa !== null) {
    const diff = Math.abs(pa - 50);
    const leader = pa >= 50 ? teamAName : teamBName;
    out.push({
      text:
        diff < 6
          ? `Possession was roughly balanced in the analyzed footage (${pa.toFixed(0)}% to ${(100 - pa).toFixed(0)}%, estimated).`
          : `${leader} had more of the estimated possession (${Math.max(pa, 100 - pa).toFixed(0)}%).`,
      q: a.possessionPercent.quality === "medium" ? "medium" : "low",
    });
    const unknownShare = result.possessionUnknownSeconds / Math.max(1, result.coverage.analyzedDurationSeconds);
    if (unknownShare > 0.4)
      out.push({ text: `Possession could not be determined for ${Math.round(unknownShare * 100)}% of the clip, so the split above is indicative only.`, q: "low" });
  }
  const thirdNames = ["left third", "middle third", "right third"];
  for (const [tm, name] of [
    ["team_a", teamAName],
    ["team_b", teamBName],
  ] as const) {
    const z = zoneShares(teamFrames, tm);
    if (z.total <= 0) continue;
    const max = Math.max(...z.thirds);
    const k = z.thirds.indexOf(max);
    if (max > 0.45)
      out.push({
        text: `${name}'s tracked players were concentrated in the ${thirdNames[k]} of the camera view (${Math.round(max * 100)}% of presence).`,
        q: "low",
      });
  }
  const shots = result.events.filter((e) => e.type === "shot");
  if (shots.length)
    out.push({
      text: `${shots.length} possible shot${shots.length > 1 ? "s" : ""} detected (${shots.filter((s) => s.teamId === "team_a").length} ${teamAName}, ${shots.filter((s) => s.teamId === "team_b").length} ${teamBName}, ${shots.filter((s) => s.teamId === "unknown").length} unattributed).`,
      q: "low",
    });
  if (a.averageSpeedMetersPerSecond.value !== null && b.averageSpeedMetersPerSecond.value !== null) {
    const faster = a.averageSpeedMetersPerSecond.value > b.averageSpeedMetersPerSecond.value ? teamAName : teamBName;
    out.push({
      text: `${faster}'s visible players moved slightly faster on average (${formatMetric(a.averageSpeedMetersPerSecond.value, "m/s")} against ${formatMetric(b.averageSpeedMetersPerSecond.value, "m/s")}).`,
      q: "low",
    });
  }
  if (a.compactness.value !== null && b.compactness.value !== null) {
    const tighter = a.compactness.value < b.compactness.value ? teamAName : teamBName;
    out.push({ text: `${tighter} kept a more compact shape among visible players.`, q: "low" });
  }
  return out;
}

/**
 * The overview a coach reads first, laid out as reference panels: the Match Stats card
 * (possession split, then the few comparisons that matter) beside the pitch card, stacked on narrow
 * screens; then plain-language observations and the moments worth replaying.
 */
export function SummaryView({ result, teamFrames }: { result: AnalysisResult; teamFrames: TeamFrame[] }) {
  const { seek } = usePlaybackControls();
  const items = takeaways(result, teamFrames);
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const analyzed = result.coverage.analyzedDurationSeconds;
  const nameOf = (id: string) => (id === "team_a" ? teamAName : id === "team_b" ? teamBName : null);
  const colorOf = (id: string) => (id === "team_a" ? teamAColor : id === "team_b" ? teamBColor : null);

  return (
    <div className="space-y-5">
      {isPartial(result) && (
        <Notice tone="warn" title="Partial analysis">
          Some metrics are unavailable or based on limited coverage. The data quality section explains what is missing.
        </Notice>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="min-w-0">
          <CardHeader
            title="Match stats"
            subtitle={
              <>
                From <span className="tabular font-medium text-ink">{formatClock(analyzed)}</span> of analyzed footage in{" "}
                <span className="break-all">{result.video.fileName}</span>.
              </>
            }
          />
          <div className="px-5 pb-5">
            <TeamStats result={result} keys={["possessionPercent", "shotCount", "distanceMeters", "widthMeters", "compactness"]} compact />
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="On the pitch" subtitle="Where each team spent the clip. Scrub the video to see the positions at any moment." />
          <div className="px-5 pb-5">
            <PitchPanel result={result} teamFrames={teamFrames} defaultLayer="occupancy" defaultScope="full" compact />
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="min-w-0">
          <CardHeader title="What the footage shows" subtitle="Descriptive observations from the measured data, not coaching advice." />
          <div className="px-5 pb-3">
            {items.length ? (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {items.map((t) => (
                  <li key={t.text} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-3">
                    <span className="max-w-prose min-w-0 flex-1 basis-56 text-sm leading-relaxed text-ink">{t.text}</span>
                    <QualityBadge quality={t.q} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pb-2 text-sm leading-relaxed text-ink-2">There is not enough reliable data in this clip to say anything with confidence.</p>
            )}
          </div>
        </Card>

        {result.events.length > 0 && (
          <Card className="min-w-0">
            <CardHeader title="Moments to replay" subtitle="Estimated events. Choose one to play it from a second before." />
            <ul className="space-y-1 px-3 pb-3">
              {result.events.map((e) => {
                const name = nameOf(e.teamId);
                const color = colorOf(e.teamId);
                return (
                  <li key={e.eventId}>
                    <button
                      type="button"
                      onClick={() => seek(Math.max(0, e.timestampSeconds - 1), { play: true })}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-page"
                    >
                      <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-brand-soft sm:grid text-ok transition-colors group-hover:bg-brand group-hover:text-navy-950">
                        <Play className="size-3.5 translate-x-px fill-current" aria-hidden />
                      </span>
                      <span className="font-hud w-12 shrink-0 text-[19px] leading-none font-semibold text-ink">{formatClock(e.timestampSeconds)}</span>
                      <span className="estimate min-w-0 flex-1 truncate text-sm font-semibold text-ink">{e.type === "goal" ? "Possible goal" : "Possible shot"}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                        {color && <Magnet color={color} />}
                        <span className="max-w-[6rem] truncate sm:max-w-[9rem]">{name ?? "Team unknown"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
