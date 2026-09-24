"use client";

import { Activity, Film, Map, Upload, Video } from "lucide-react";
import { CapabilityCard } from "@/components/shell/CapabilityCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { MatchList } from "@/components/match/MatchList";
import { PossessionDonut } from "@/components/match/PossessionDonut";
import { Card, CardHeader, EmptyState, LinkButton, QualityBadge } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

export default function HomePage() {
  const count = useStryde((s) => s.order.length);
  const latest = useStryde((s) => {
    const id = s.order.find((i) => s.matches[i]?.result);
    return id ? s.matches[id] : undefined;
  });

  return (
    <div className="pb-12">
      <PageHeader
        title="Welcome to Stryde"
        subtitle="Turn a short soccer clip into annotated playback and team insights — analyzed privately in your browser."
        actions={
          <LinkButton href="/app/analyze" size="lg">
            <Upload className="size-4" /> Upload match
          </LinkButton>
        }
      />
      <div className="mx-auto grid max-w-[1520px] gap-6 px-5 sm:px-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="This session's matches" subtitle="Results stay in this browser tab until you close it." />
            {count ? (
              <MatchList limit={6} />
            ) : (
              <EmptyState
                icon={<Film className="size-5" />}
                title="No matches analyzed yet"
                action={
                  <LinkButton href="/app/analyze">
                    <Upload className="size-4" /> Upload match
                  </LinkButton>
                }
              >
                Choose a 30–60 second soccer clip (720p, 25 fps recommended). Stryde detects and tracks players, groups them into teams and builds team
                analytics.
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardHeader title="How it works" />
            <ol className="grid gap-6 px-6 pb-6 sm:grid-cols-3">
              {[
                { icon: Video, t: "Choose a clip", d: "Pick a short local video, name the teams, and start analysis." },
                { icon: Activity, t: "Analyze in browser", d: "Players and the ball are detected, tracked, and grouped by jersey color." },
                { icon: Map, t: "Explore results", d: "Review annotated playback, team stats, heatmaps, and events." },
              ].map((s) => (
                <li key={s.t}>
                  <div className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-[#11704a]">
                    <s.icon className="size-5" aria-hidden />
                  </div>
                  <p className="font-semibold text-ink">{s.t}</p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{s.d}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {latest?.result && (
            <Card>
              <CardHeader
                title="Latest match overview"
                subtitle={`${latest.config.teamAName} vs ${latest.config.teamBName}`}
                action={<QualityBadge quality={latest.result.analytics[0].possessionPercent.quality} label="Estimated" />}
              />
              <div className="px-6 pb-6">
                <PossessionDonut result={latest.result} />
                <LinkButton href={`/app/match/${latest.id}`} variant="secondary" className="mt-4 w-full">
                  Open match analysis
                </LinkButton>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Your device" subtitle="Analysis capability in this browser" />
            <div className="px-6 pb-6">
              <CapabilityCard />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
