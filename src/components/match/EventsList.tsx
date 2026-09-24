"use client";

import { Crosshair, Goal, PlayCircle } from "lucide-react";
import { EmptyState, Notice, QualityBadge, TeamChip } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { usePlayback } from "./playback";

export function EventsList({ result, compact = false }: { result: AnalysisResult; compact?: boolean }) {
  const { seek } = usePlayback();
  const { events, eventAnalysis } = result;
  const teamName = (t: string) => (t === "team_a" ? result.teams.teamAName : t === "team_b" ? result.teams.teamBName : "Team unknown");
  const teamColor = (t: string) => (t === "team_a" ? result.teams.teamAColor : t === "team_b" ? result.teams.teamBColor : "#B8C2CA");

  if (eventAnalysis.shots === "unavailable") {
    return (
      <Notice tone="warn" title="Event analysis unavailable">
        {eventAnalysis.notes.join(" ")}
      </Notice>
    );
  }
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <EmptyState icon={<Crosshair className="size-5" />} title="No shot or goal candidates detected">
          Event analysis ran, but no ball movement matched the shot criteria. This does not guarantee that no shots happened — small or occluded balls are
          often missed.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {events.map((e) => (
            <li key={e.eventId}>
              <button
                onClick={() => seek(Math.max(0, e.timestampSeconds - 1), { play: true })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-page"
                aria-label={`Play ${e.type === "goal" ? "possible goal" : "estimated shot"} at ${formatClock(e.timestampSeconds)}`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${e.type === "goal" ? "bg-brand-soft text-[#11704a]" : "bg-warn-bg text-warn"}`}>
                  {e.type === "goal" ? <Goal className="size-4" /> : <Crosshair className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {e.type === "goal" ? "Possible goal" : "Estimated shot"}
                    <span className="font-normal text-ink-2 tabular-nums">{formatClock(e.timestampSeconds, true)}</span>
                    <TeamChip color={teamColor(e.teamId)} name={teamName(e.teamId)} className="text-xs font-normal text-ink-2" />
                  </span>
                  {!compact && e.description && <span className="mt-0.5 block text-xs text-ink-2">{e.description}</span>}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <QualityBadge quality={e.quality} label={`${Math.round(e.confidence * 100)}% conf.`} />
                  <PlayCircle className="size-4 text-ink-2" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {!compact && eventAnalysis.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-2">
          {eventAnalysis.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
