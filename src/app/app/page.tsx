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
      <div className="grid gap-5 px-4 sm:px-8 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="This session's matches" subtitle="Analyses stay in this tab's memory only and are cleared when it closes." />
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
            <ol className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
              {[
                { icon: Video, t: "1. Choose a clip", d: "Name the teams, pick Faster or More Detailed and choose a local video. Analysis starts automatically." },
                { icon: Activity, t: "2. Browser analysis", d: "A detection model runs on your GPU or CPU to find players and the ball, track them and group them by jersey color." },
                { icon: Map, t: "3. Explore", d: "Watch annotated playback with a broadcast HUD, compare teams, and explore synchronized heatmaps and events." },
              ].map((s) => (
                <li key={s.t} className="rounded-lg border border-line bg-page/60 p-4">
                  <s.icon className="size-5 text-[#11704a]" aria-hidden />
                  <p className="mt-2 font-semibold">{s.t}</p>
                  <p className="mt-1 text-sm text-ink-2">{s.d}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          {latest?.result && (
            <Card>
              <CardHeader
                title="Latest match overview"
                subtitle={`${latest.config.teamAName} vs ${latest.config.teamBName}`}
                action={<QualityBadge quality={latest.result.analytics[0].possessionPercent.quality} label="Estimated" />}
              />
              <div className="px-5 pb-5">
                <PossessionDonut result={latest.result} />
                <LinkButton href={`/app/match/${latest.id}`} variant="secondary" className="mt-4 w-full">
                  Open match analysis
                </LinkButton>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Your device" subtitle="Analysis capability in this browser" />
            <div className="px-5 pb-5">
              <CapabilityCard />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
