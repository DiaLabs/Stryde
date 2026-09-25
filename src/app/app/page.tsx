"use client";

import { Film, Lock, Sparkles, Zap } from "lucide-react";
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
    <div className="pb-10">
      <PageHeader title="Welcome to Stryde" subtitle="Turn a short soccer clip into annotated playback and team insights — analyzed privately in your browser." />

      <div className="mx-auto grid max-w-[1400px] gap-5 px-5 sm:px-10 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="This session's matches" subtitle="Results stay in this browser tab until you close it." />
            {count ? (
              <MatchList limit={6} />
            ) : (
              <EmptyState
                icon={<Film className="size-5" />}
                title="No matches analyzed yet"
                action={
                  <LinkButton href="/app/analyze" size="lg">
                    Upload match
                  </LinkButton>
                }
              >
                Choose a 30–60 second soccer clip. Stryde detects and tracks players, groups them into teams, and builds analytics — all in your browser.
              </EmptyState>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Lock, t: "Private", d: "Your clip never leaves this browser." },
              { icon: Zap, t: "GPU or CPU", d: "WebGPU when available, WebAssembly fallback." },
              { icon: Sparkles, t: "Steady footage", d: "Static or slow pans work best." },
            ].map((s) => (
              <div key={s.t} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[#11704a]">
                  <s.icon className="size-4" aria-hidden />
                </div>
                <div>
                  <p className="text-[15px] font-semibold">{s.t}</p>
                  <p className="text-sm leading-snug text-ink-2">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
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
