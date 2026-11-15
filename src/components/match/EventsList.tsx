"use client";

import clsx from "clsx";
import { Crosshair, Play } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Magnet, Notice } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import type { AnalysisResult, MatchEvent } from "@/lib/types";
import { usePlaybackControls } from "./playback";

/** Where the ball started, in the picture (image space, not pitch space). */
function startSide(e: MatchEvent): string | null {
  const p = e.trajectory?.[0];
  if (!p) return null;
  return p.x < 0.36 ? "the left of the picture" : p.x > 0.64 ? "the right of the picture" : "the middle of the picture";
}

function sentence(e: MatchEvent, team: string | null): string {
  const side = startSide(e);
  if (e.type === "goal") return team ? `Possible goal for ${team}` : "Possible goal, team unknown";
  if (team) return side ? `${team} shot from ${side}` : `${team} shot`;
  return side ? `Shot from ${side}, team unknown` : "Shot, team unknown";
}

/**
 * Key moments as a timeline: clock, team dot on a rail, the event in a sentence and an
 * "estimated" badge. Selecting a row plays the video from a second before the moment.
 */
export function EventsList({
  result,
  compact = false,
  className,
}: {
  result: AnalysisResult;
  compact?: boolean;
  className?: string;
}) {
  // seek only: this list never re-renders on clock ticks
  const { seek } = usePlaybackControls();
  const { events, eventAnalysis } = result;
  const teamName = (t: string) => (t === "team_a" ? result.teams.teamAName : t === "team_b" ? result.teams.teamBName : null);
  const teamColor = (t: string) => (t === "team_a" ? result.teams.teamAColor : t === "team_b" ? result.teams.teamBColor : "var(--color-line)");

  const header = (
    <CardHeader
      title="Key moments"
      subtitle="Shots and possible goals, estimated from fast ball movement. Select one to play it."
      action={events.length > 0 ? <Badge>{events.length}</Badge> : undefined}
    />
  );

  if (eventAnalysis.shots === "unavailable") {
    return (
      <Card className={clsx("min-w-0", className)}>
        {header}
        <div className="px-5 pb-5">
          <Notice tone="warn" title="Event analysis unavailable">
            {eventAnalysis.notes.join(" ")}
          </Notice>
        </div>
      </Card>
    );
  }

  return (
    <Card className={clsx("flex min-w-0 flex-col", className)}>
      {header}
      {events.length === 0 ? (
        <EmptyState icon={<Crosshair className="size-5" aria-hidden />} title="No shots or possible goals found">
          Event analysis ran, but no ball movement looked like a shot. That does not mean there were none: a small or hidden ball is often missed.
        </EmptyState>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {events.map((e, i) => {
            const text = sentence(e, teamName(e.teamId));
            const pct = Math.round(e.confidence * 100);
            const first = i === 0;
            const last = i === events.length - 1;
            return (
              <li key={e.eventId}>
                <button
                  type="button"
                  onClick={() => seek(Math.max(0, e.timestampSeconds - 1), { play: true })}
                  aria-label={`Play from ${formatClock(e.timestampSeconds)}: ${text}, estimated, ${pct}% confidence`}
                  className="group grid w-full grid-cols-[3rem_12px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-page"
                >
                  <span className="font-hud pt-px text-[17px] leading-5 font-semibold text-ink">{formatClock(e.timestampSeconds)}</span>
                  {/* the timeline rail runs through every dot */}
                  <span aria-hidden className="relative flex justify-center self-stretch">
                    {events.length > 1 && (
                      <span className={clsx("absolute w-px bg-line", first ? "top-[11px] -bottom-3" : last ? "-top-3 h-[23px]" : "-inset-y-3")} />
                    )}
                    <span className="relative mt-[3px] rounded-full bg-card p-0.5 group-hover:bg-page">
                      <Magnet color={teamColor(e.teamId)} size={12} />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-semibold text-ink">{text}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
                      {e.type === "goal" ? "Possible goal" : "Shot"}
                      {!compact && e.description ? ` · ${e.description}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 pt-px">
                    <Badge tone="info">Est. {pct}%</Badge>
                    <Play className="hidden size-3.5 fill-current sm:block text-ink-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {!compact && eventAnalysis.notes.length > 0 && (
        <ul className="space-y-1 border-t border-line-soft px-5 py-4 text-[13px] leading-relaxed text-ink-2">
          {eventAnalysis.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
