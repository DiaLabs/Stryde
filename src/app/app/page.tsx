"use client";

import { ArrowRight, CircleDot, Film, Info, LayoutGrid, Upload, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { MatchList } from "@/components/match/MatchList";
import { CapabilityCard } from "@/components/shell/CapabilityCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Magnet, StatTile } from "@/components/ui/primitives";
import { isPartial } from "@/lib/result";
import { useStryde, type MatchEntry } from "@/lib/store";
import type { AnalysisResult } from "@/lib/types";

const RECENT = 5;
const THIRD_LABELS = ["left third", "middle third", "right third"];

const noSubscribe = () => () => {};
function greetingNow() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}
/** Time-of-day greeting; the server renders a neutral one so hydration never mismatches. */
function useGreeting() {
  return useSyncExternalStore(noSubscribe, greetingNow, () => "Welcome");
}

type Done = MatchEntry & { result: AnalysisResult };

function pct(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? null : Math.round(v);
}

/* ---------- Team overview: possession donut for the latest finished match ---------- */

function PossessionRing({ result }: { result: AnalysisResult }) {
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const a = pct(result.analytics[0]?.possessionPercent.value);
  const b = pct(result.analytics[1]?.possessionPercent.value);
  const estimated = result.analytics[0]?.possessionPercent.quality !== "high";

  if (a === null || b === null) {
    return (
      <p className="px-5 pb-5 text-[13px] leading-relaxed text-ink-2">
        {result.analytics[0]?.possessionPercent.explanation ?? "Possession could not be estimated for this clip, usually because the ball was rarely visible."}
      </p>
    );
  }

  const r = 40;
  const c = 2 * Math.PI * r;
  const fa = a / (a + b || 1);
  const gap = a > 0 && b > 0 ? 1.6 : 0;
  const lenA = Math.max(0, fa * c - gap);
  const lenB = Math.max(0, (1 - fa) * c - gap);

  return (
    <figure className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 pb-5">
      <figcaption className="sr-only">
        {estimated ? "Estimated possession" : "Possession"}: {teamAName} {a}%, {teamBName} {b}%.
      </figcaption>
      <div className="relative size-36 shrink-0" aria-hidden>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth="12" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={teamBColor} strokeWidth="12" strokeDasharray={`${lenB} ${c}`} strokeDashoffset={-(fa * c)} />
          <circle cx="50" cy="50" r={r} fill="none" stroke={teamAColor} strokeWidth="12" strokeDasharray={`${lenA} ${c}`} />
          {/* faint edges keep pale kits visible on white */}
          <circle cx="50" cy="50" r={r + 6} fill="none" stroke="rgba(23,35,45,0.1)" strokeWidth="0.6" />
          <circle cx="50" cy="50" r={r - 6} fill="none" stroke="rgba(23,35,45,0.1)" strokeWidth="0.6" />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p className={`text-[26px] leading-none font-bold tracking-tight text-ink tabular ${estimated ? "estimate" : ""}`}>{a}%</p>
          <p className="mt-1 text-[11px] font-medium text-ink-2">possession</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 text-[13px]" aria-hidden>
        {[
          { name: teamAName, color: teamAColor, v: a },
          { name: teamBName, color: teamBColor, v: b },
        ].map((t) => (
          <li key={t.name + t.color} className="flex items-center gap-2">
            <Magnet color={t.color} />
            <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
            <span className="font-semibold text-ink tabular">{t.v}%</span>
          </li>
        ))}
        <li className="pt-1">{estimated ? <Badge tone="info">Estimate</Badge> : <Badge tone="ok">High confidence</Badge>}</li>
      </ul>
    </figure>
  );
}

/* ---------- Key insights derived from the latest result ---------- */

interface Insight {
  icon: LucideIcon;
  title: ReactNode;
  body: ReactNode;
}

function insightsFor(result: AnalysisResult): Insight[] {
  const out: Insight[] = [];
  const [A, B] = result.analytics;
  const { teamAName, teamBName } = result.teams;
  const a = pct(A?.possessionPercent.value);
  const b = pct(B?.possessionPercent.value);

  if (a !== null && b !== null) {
    if (Math.abs(a - b) <= 4) {
      out.push({ icon: CircleDot, title: "Possession was even", body: `${teamAName} ${a}%, ${teamBName} ${b}% of the time a team clearly had the ball.` });
    } else {
      const lead = a > b ? teamAName : teamBName;
      out.push({ icon: CircleDot, title: `${lead} had more of the ball`, body: `${Math.max(a, b)}% to ${Math.min(a, b)}% of the time a team clearly had it (estimate).` });
    }
  }

  for (const [team, name] of [
    [A, teamAName],
    [B, teamBName],
  ] as const) {
    if (out.length >= 2 || !team) break;
    const vals = team.thirds.map((m) => m.value);
    if (vals.some((v) => v === null) || team.thirds[0]?.quality === "unavailable") continue;
    const i = vals.indexOf(Math.max(...(vals as number[])));
    out.push({
      icon: LayoutGrid,
      title: `${name} spent most time in the ${THIRD_LABELS[i]}`,
      body: `${Math.round(vals[i] as number)}% of their tracked presence, measured across the camera view.`,
    });
  }

  const cov = result.coverage;
  const unknown = Math.round(result.possessionUnknownSeconds);
  if (isPartial(result)) {
    const share = cov.fraction != null ? `${Math.round(cov.fraction * 100)}% of the clip was analyzed.` : "Part of the clip was not analyzed.";
    out.push({ icon: Info, title: "Partial results", body: `${share} Treat the numbers as a rough guide.` });
  } else if (unknown > 0) {
    out.push({
      icon: Info,
      title: `Ball unclear for ${unknown} s`,
      body: "Moments where no team clearly had the ball are left out of the possession figures.",
    });
  } else {
    out.push({
      icon: Info,
      title: `${cov.sampledFrameCount} frames analyzed`,
      body: `Sampled ${cov.sampleFps} times a second across the whole clip.`,
    });
  }
  return out.slice(0, 3);
}

function KeyInsights({ result }: { result: AnalysisResult }) {
  const items = insightsFor(result);
  return (
    <ul className="space-y-4 px-5 pb-5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-ok">
            <it.icon className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">{it.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{it.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Page ---------- */

export default function HomePage() {
  const greeting = useGreeting();
  const order = useStryde((s) => s.order);
  const matches = useStryde((s) => s.matches);
  const count = order.length;

  const { done, latest, tracks, frames } = useMemo(() => {
    const done = order.map((id) => matches[id]).filter((m): m is Done => !!m && m.session.status === "complete" && !!m.result);
    const tracks = done.reduce((n, m) => n + m.result.analytics.reduce((k, a) => k + (a.trackCount.value ?? 0), 0), 0);
    const frames = done.reduce((n, m) => n + m.result.coverage.sampledFrameCount, 0);
    return { done, latest: done[0], tracks, frames };
  }, [order, matches]);

  const latestA = latest ? pct(latest.result.analytics[0]?.possessionPercent.value) : null;
  const latestEstimated = latest?.result.analytics[0]?.possessionPercent.quality !== "high";

  return (
    <div className="pb-16">
      <PageHeader
        title={greeting}
        subtitle={count ? "Here’s what’s happening with the matches in this tab." : "Upload a clip from your last match to see how each team played."}
        actions={
          <LinkButton href="/app/analyze" variant="navy">
            <Upload className="size-4" aria-hidden /> Upload match
          </LinkButton>
        }
      />

      <div className="mx-auto grid max-w-[1400px] gap-5 px-4 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatTile value={done.length} label="Matches analyzed" note={count > done.length ? `+${count - done.length} not finished` : "In this tab"} />
            <StatTile value={done.length ? tracks : "–"} label="Player tracks" note={done.length ? "May over-count players" : undefined} />
            <StatTile
              value={latestA === null ? "–" : <span className={latestEstimated ? "estimate" : undefined}>{latestA}%</span>}
              label={latest ? <span className="block truncate">{latest.result.teams.teamAName} possession</span> : "Possession"}
              note={latestA === null ? undefined : "Latest match"}
            />
            <StatTile value={done.length ? frames.toLocaleString() : "–"} label="Frames analyzed" note={done.length ? "Sampled, all matches" : undefined} />
          </section>

          <Card className="overflow-hidden">
            <CardHeader
              title="Recent matches"
              subtitle={count ? "Results stay in this tab until you close it." : undefined}
              action={
                count ? (
                  <Link
                    href="/app/matches"
                    className="inline-flex shrink-0 items-center gap-1 rounded text-[13px] font-semibold text-brand-deep hover:underline hover:underline-offset-4"
                  >
                    View all{count > RECENT ? ` ${count}` : ""} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : undefined
              }
            />
            {count ? (
              <div className="pb-2">
                <MatchList limit={RECENT} variant="compact" />
              </div>
            ) : (
              <EmptyState
                icon={<Film className="size-6" aria-hidden />}
                title="No matches analyzed yet"
                action={
                  <>
                    <LinkButton href="/app/analyze">
                      <Upload className="size-4" aria-hidden /> Upload match
                    </LinkButton>
                    <LinkButton href="/app/analyze?sample=1" variant="secondary">
                      Try the sample clip
                    </LinkButton>
                  </>
                }
              >
                A 30 to 60 second clip from a steady sideline camera gives the clearest picture. No clip to hand? Try the 48-second sample. Everything runs on this
                device.
              </EmptyState>
            )}
          </Card>

          <div className="hidden xl:block">
            <CapabilityCard />
          </div>
        </div>

        <aside className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:grid-cols-1" aria-label="Latest match">
          <Card>
            <CardHeader
              title="Team overview"
              subtitle={
                latest ? (
                  <span className="block truncate">
                    Latest: {latest.result.teams.teamAName} vs {latest.result.teams.teamBName}
                  </span>
                ) : (
                  "Possession for your latest finished match."
                )
              }
              action={
                latest ? (
                  <Link href={`/app/match/${latest.id}?tab=team`} className="shrink-0 rounded text-[13px] font-semibold text-brand-deep hover:underline hover:underline-offset-4">
                    Details
                  </Link>
                ) : undefined
              }
            />
            {latest ? (
              <PossessionRing result={latest.result} />
            ) : (
              <div className="flex items-center gap-4 px-5 pb-5">
                <svg viewBox="0 0 100 100" className="size-20 shrink-0" aria-hidden>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-line-soft)" strokeWidth="12" />
                </svg>
                <p className="text-[13px] leading-relaxed text-ink-2">The possession split appears here once a match has finished analyzing.</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Key insights" subtitle={latest ? undefined : "Read from your latest finished match."} />
            {latest ? (
              <KeyInsights result={latest.result} />
            ) : (
              <ul className="space-y-4 px-5 pb-5">
                {[
                  { icon: CircleDot, t: "Who had the ball", d: "Possession estimated from which team is nearest the ball." },
                  { icon: LayoutGrid, t: "Where each team played", d: "Time spent in each third of the camera view." },
                ].map((x) => (
                  <li key={x.t} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-page text-ink-2 ring-1 ring-line-soft ring-inset">
                      <x.icon className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{x.t}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{x.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="md:col-span-2 xl:hidden">
            <CapabilityCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
