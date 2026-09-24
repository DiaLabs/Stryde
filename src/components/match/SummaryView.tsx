"use client";

import { Card, CardHeader, Notice, QualityBadge, TeamChip } from "@/components/ui/primitives";
import { zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { formatClock, formatMetric } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { usePlayback } from "./playback";
import { isPartial } from "./QualityPanel";

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
          ? `Possession was roughly balanced in the analyzed footage (${pa.toFixed(0)}% / ${(100 - pa).toFixed(0)}%, estimated).`
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
        text: `${name}'s tracked players were concentrated in the ${thirdNames[k]} of the ${result.calibration.method === "homography" ? "pitch" : "camera view"} (${Math.round(max * 100)}% of presence).`,
        q: result.calibration.method === "homography" ? "medium" : "low",
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
      text: `${faster}'s visible players moved slightly faster on average (${formatMetric(a.averageSpeedMetersPerSecond.value, "m/s")} vs ${formatMetric(b.averageSpeedMetersPerSecond.value, "m/s")}).`,
      q: "low",
    });
  }
  if (a.compactness.value !== null && b.compactness.value !== null) {
    const tighter = a.compactness.value < b.compactness.value ? teamAName : teamBName;
    out.push({ text: `${tighter} kept a more compact shape among visible players.`, q: "low" });
  }
  return out;
}

export function SummaryView({ result, teamFrames }: { result: AnalysisResult; teamFrames: TeamFrame[] }) {
  const { seek } = usePlayback();
  const items = takeaways(result, teamFrames);
  const [a, b] = result.analytics;
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const kpis = [
    { label: `${teamAName} possession`, m: a.possessionPercent },
    { label: `${teamBName} possession`, m: b.possessionPercent },
    { label: "Estimated shots", m: { ...a.shotCount, value: a.shotCount.value !== null && b.shotCount.value !== null ? a.shotCount.value + b.shotCount.value : null } },
    { label: "Analyzed", m: { value: result.coverage.analyzedDurationSeconds, unit: "s", quality: "high" as const } },
  ];
  return (
    <div className="space-y-5">
      {isPartial(result) && (
        <Notice tone="warn" title="Partial analysis">
          Some metrics are unavailable or based on limited coverage. See the data-quality section for details.
        </Notice>
      )}
      <Card>
        <CardHeader
          title="Match summary"
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <TeamChip color={teamAColor} name={teamAName} /> vs <TeamChip color={teamBColor} name={teamBName} /> · {result.video.fileName}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 md:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-line p-3">
              <p className="text-xs text-ink-2">{k.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatMetric(k.m.value, k.m.unit, 0)}</p>
              {k.m.quality !== "high" && <QualityBadge quality={k.m.quality} className="mt-1" />}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Key takeaways" subtitle="Descriptive observations generated only from available metrics — not coaching advice." />
        {items.length ? (
          <ul className="space-y-2 px-5 pb-5">
            {items.map((t) => (
              <li key={t.text} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="flex-1">{t.text}</span>
                <QualityBadge quality={t.q} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-ink-2">Not enough reliable data to generate takeaways for this clip.</p>
        )}
      </Card>
      {result.events.length > 0 && (
        <Card>
          <CardHeader title="Event timeline" />
          <ul className="flex flex-wrap gap-2 px-5 pb-5">
            {result.events.map((e) => (
              <li key={e.eventId}>
                <button onClick={() => seek(Math.max(0, e.timestampSeconds - 1), { play: true })} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-page">
                  {e.type === "goal" ? "Possible goal" : "Est. shot"} · {formatClock(e.timestampSeconds)}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
