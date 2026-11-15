"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, RotateCcw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useCallback, useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge, Button, Card, CardHeader, LinkButton, Magnet, TeamChip } from "@/components/ui/primitives";
import { buildTeamFrames } from "@/lib/analysis/analytics";
import { formatBytes, formatDuration, formatMetric } from "@/lib/format";
import { formatClock } from "@/lib/format";
import { buildRenderIndex } from "@/lib/render";
import { isPartial } from "@/lib/result";
import { useStryde, type MatchEntry } from "@/lib/store";
import type { AnalysisResult, OverlayOptions, TeamAnalytics } from "@/lib/types";
import { EventsList } from "./EventsList";
import { PitchPanel } from "./PitchPanel";
import { PlaybackProvider } from "./playback";
import { PossessionTimeline } from "./PossessionTimeline";
import { CalibrationPanel } from "./CalibrationPanel";
import { QualityPanel } from "./QualityPanel";
import { SummaryView } from "./SummaryView";
import { TeamSettingsPanel } from "./TeamSettingsPanel";
import { TeamStats } from "./TeamStats";
import { ThirdsComparison } from "./ThirdsComparison";
import { DEFAULT_OVERLAYS, VideoPlayer } from "./VideoPlayer";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team analysis" },
  { id: "events", label: "Events" },
  { id: "summary", label: "Summary" },
  { id: "teams", label: "Teams & quality" },
  { id: "calibration", label: "Pitch calibration" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

export function MatchWorkspace({ entry, result }: { entry: MatchEntry; result: AnalysisResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  // the URL is the source of truth (the top bar links to ?tab=team)
  const tab: TabId = isTab(tabParam) ? tabParam : "overview";
  // the tab strip answers a key press at once; the panel swaps with the navigation so
  // <ViewTransition> can crossfade it
  const [shownTab, setShownTab] = useOptimistic(tab);
  const [, startTransition] = useTransition();
  const applyOverrides = useStryde((s) => s.applyOverrides);
  const renameTeams = useStryde((s) => s.renameTeams);
  const retry = useStryde((s) => s.retryAnalysis);
  const removeMatch = useStryde((s) => s.removeMatch);
  const [overlays, setOverlays] = useState<OverlayOptions>(DEFAULT_OVERLAYS);
  const [confirm, setConfirm] = useState<"rerun" | "discard" | null>(null);

  const index = useMemo(() => buildRenderIndex(result), [result]);
  const calibrations = entry.overrides.calibrations ?? (entry.overrides.calibration ? [entry.overrides.calibration] : []);
  const teamFrames = useMemo(() => buildTeamFrames(result.tracks, result.frames, 1 / result.coverage.sampleFps), [result]);
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const uid = useId();
  const tabId = (id: TabId) => `${uid}-tab-${id}`;
  const panelId = `${uid}-panel`;

  // Discarding navigates away first and removes the match once this page has gone, so the
  // "no longer available" state never flashes.
  const discardOnLeave = useRef(false);
  useEffect(() => {
    const flag = discardOnLeave;
    const id = entry.id;
    return () => {
      if (flag.current) removeMatch(id);
    };
  }, [entry.id, removeMatch]);

  const setTab = (id: TabId) => {
    const sp = new URLSearchParams(params.toString());
    if (id === "overview") sp.delete("tab");
    else sp.set("tab", id);
    const qs = sp.toString();
    startTransition(() => {
      setShownTab(id);
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  // WAI-ARIA tabs: one tab stop, arrows move and select, Home and End jump to the ends
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === shownTab);
    let n: number;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    else return;
    e.preventDefault();
    const next = TABS[n].id;
    tabRefs.current[next]?.focus();
    setTab(next);
  };

  const onColors = useCallback(
    (a: string | undefined, b: string | undefined) => {
      if (colorTimer.current) clearTimeout(colorTimer.current);
      colorTimer.current = setTimeout(() => applyOverrides(entry.id, { teamAColor: a, teamBColor: b }), 120);
    },
    [applyOverrides, entry.id]
  );

  const partial = isPartial(result);
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const created = new Date(entry.createdAt);

  const pitchCard = (
    <Panel title="Tactical pitch" subtitle="Where each team is, in step with the video.">
      <PitchPanel result={result} teamFrames={teamFrames} compact />
    </Panel>
  );

  // the column beside the video: match stats, or what the tab is about when it reads with the video
  const side: ReactNode =
    tab === "events" ? (
      <EventsList result={result} compact />
    ) : tab === "team" ? (
      pitchCard
    ) : (
      <MatchStats result={result} onMore={() => setTab("team")} />
    );

  const panel: ReactNode = (() => {
    switch (tab) {
      case "overview":
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Tactical pitch"
              subtitle="Where each team is, in step with the video."
              action={
                <Button variant="ghost" size="sm" onClick={() => setTab("team")}>
                  Team analysis <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              }
            >
              <PitchPanel result={result} teamFrames={teamFrames} compact />
            </Panel>
            <EventsList result={result} compact />
            <Panel
              title="Possession over time"
              subtitle="Which team had the ball, estimated. Select a point on the strip to play from there."
              className="lg:col-span-2"
            >
              <PossessionTimeline result={result} />
            </Panel>
          </div>
        );
      case "team":
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Whole-clip heatmaps" subtitle="Where each team spent the analyzed clip.">
              <PitchPanel result={result} teamFrames={teamFrames} defaultLayer="movement" defaultScope="full" />
            </Panel>
            <Panel title="Team comparison" subtitle="Every team figure with how it was measured and how sure it is.">
              <TeamStats result={result} />
            </Panel>
            <Panel title="Presence by third" subtitle="How much each team was in the left, middle and right third of the camera view.">
              <ThirdsComparison result={result} />
            </Panel>
            <Panel title="Possession over time" subtitle="Which team had the ball, estimated.">
              <PossessionTimeline result={result} height={100} />
            </Panel>
          </div>
        );
      case "events":
        return (
          <div className="grid gap-5">
            <EventsList result={result} />
            <Panel
              title="Possession and events"
              subtitle="Events on the strip are estimates: yellow dots are shots, navy dots are possible goals. Select a point to play from there."
            >
              <PossessionTimeline result={result} />
            </Panel>
          </div>
        );
      case "summary":
        return <SummaryView result={result} teamFrames={teamFrames} />;
      case "teams":
        return (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <TeamSettingsPanel
              key={`${teamAName}|${teamBName}`}
              entry={entry}
              result={result}
              onColors={onColors}
              onNames={(a, b) => renameTeams(entry.id, a, b)}
            />
            <QualityPanel result={result} />
          </div>
        );
      case "calibration":
        return (
          <Card>
            <CardHeader
              title="Pitch calibration"
              subtitle={
                result.calibration.method === "homography"
                  ? "Calibration is active: distances, speeds and team shape use pitch coordinates."
                  : "Optional. Mark 4 or more pitch landmarks on one frame to unlock distances, speeds, team shape and real thirds."
              }
            />
            <div className="space-y-4 px-5 pb-5">
              {calibrations.length > 0 && (
                <div className="rounded-lg border border-line bg-page/60 px-4 py-3 text-sm">
                  <p className="font-semibold text-ink">
                    {calibrations.length === 1 ? "1 calibrated frame" : `${calibrations.length} calibrated frames`}
                    {result.calibration.validFraction !== undefined && (
                      <span className="font-normal text-ink-2">, covering {Math.round(result.calibration.validFraction * 100)}% of the clip</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-2">A panning camera moves away from a calibrated view; calibrate another frame from the uncovered part to extend coverage.</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {calibrations.map((c) => (
                      <li key={c.referenceFrameIndex} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-1 pl-3 text-[13px]">
                        Frame at {formatClock(result.frames.find((f) => f.frameIndex === c.referenceFrameIndex)?.timestampSeconds ?? 0)}, {c.points.length} points
                        <button
                          type="button"
                          onClick={() => applyOverrides(entry.id, { calibrations: calibrations.filter((x) => x.referenceFrameIndex !== c.referenceFrameIndex), calibration: null })}
                          className="rounded-full px-2 py-0.5 text-ink-2 hover:bg-danger-bg hover:text-danger"
                          aria-label={`Remove the calibrated frame at ${formatClock(result.frames.find((f) => f.frameIndex === c.referenceFrameIndex)?.timestampSeconds ?? 0)}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <CalibrationPanel
                src={entry.url}
                result={result}
                index={index}
                onApply={(cal) =>
                  applyOverrides(entry.id, {
                    calibration: null,
                    calibrations: cal ? [...calibrations.filter((x) => x.referenceFrameIndex !== cal.referenceFrameIndex), cal] : [],
                  })
                }
              />
            </div>
          </Card>
        );
    }
  })();

  return (
    <PlaybackProvider>
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-6 pb-5 lg:pt-8">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href="/app/matches"
              aria-label="Back to all matches"
              title="All matches"
              className="mt-px grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[22px] leading-tight font-bold tracking-tight text-ink sm:text-2xl">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Magnet color={teamAColor} size={12} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{teamAName}</span>
                </span>
                <span className="text-base font-medium text-ink-2">vs</span>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Magnet color={teamBColor} size={12} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{teamBName}</span>
                </span>
              </h1>
              <ul className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                <li>
                  <time dateTime={created.toISOString()}>
                    {created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })},{" "}
                    {created.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </li>
                <Sep />
                <li>
                  <span className="tabular">{formatDuration(entry.meta.durationSeconds)}</span> of footage
                </li>
                <Sep className="hidden sm:block" />
                <li className="hidden max-w-[18rem] truncate sm:block" title={`${entry.meta.fileName}, ${formatBytes(entry.meta.fileSizeBytes)}`}>
                  {entry.meta.fileName}
                </li>
                <Sep />
                <li>
                  {partial ? (
                    <Badge tone="warn" className="py-[3px]">
                      Partial analysis
                    </Badge>
                  ) : (
                    <Badge tone="ok" className="py-[3px]">
                      Completed
                    </Badge>
                  )}
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/app/analyze" variant="secondary" size="sm">
              <Upload className="size-4" aria-hidden /> Analyze another
            </LinkButton>
            <Button variant="secondary" size="sm" onClick={() => setConfirm("rerun")}>
              <RotateCcw className="size-4" aria-hidden /> Re-run
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirm("discard")}>
              <Trash2 className="size-4" aria-hidden /> Discard
            </Button>
          </div>
        </header>

        <div role="tablist" aria-label="Match views" onKeyDown={onTabKey} className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const selected = shownTab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "-mb-px shrink-0 rounded-t-md border-b-2 px-2 pt-2 pb-2.5 text-sm whitespace-nowrap transition-colors focus-visible:-outline-offset-2",
                  selected ? "border-brand font-semibold text-ink" : "border-transparent font-medium text-ink-2 hover:border-line hover:text-ink"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="pt-5 pb-16">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 self-start">
              <VideoPlayer
                src={entry.url}
                result={result}
                index={index}
                overlays={overlays}
                onOverlaysChange={setOverlays}
                transitionName={`match-video-${entry.id}`}
              />
            </div>
            {/* beside the video the events list takes the video's height and scrolls */}
            <div className={clsx("flex min-w-0 flex-col [&>*]:flex-1", tab === "events" && "xl:h-0 xl:min-h-full [&>*]:min-h-0")}>{side}</div>
          </div>
          <ViewTransition key={tab} name="match-tab-panel" share="auto" default="none">
            <div className="mt-5">{panel}</div>
          </ViewTransition>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "rerun"}
        title="Re-run this analysis?"
        confirmLabel="Re-run analysis"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          retry(entry.id);
        }}
      >
        The current results are cleared and the clip is analyzed again on this device. Team names and colour corrections are kept.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "discard"}
        title="Discard this analysis?"
        confirmLabel="Discard analysis"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          discardOnLeave.current = true;
          router.replace("/app/matches");
        }}
      >
        The results and the video reference are removed from this tab. Your original file is not touched.
      </ConfirmDialog>
    </PlaybackProvider>
  );
}

/** A white panel with a header, as on the reference: 20 px padding, 15 px semibold title. */
function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={clsx("min-w-0", className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

function Sep({ className }: { className?: string }) {
  return <li aria-hidden className={clsx("size-[3px] rounded-full bg-ink-2/50", className)} />;
}

const STAT_ROWS: { key: Exclude<keyof TeamAnalytics, "teamId" | "thirds" | "occupancyGrid" | "possessionPercent">; label: string; digits?: number }[] = [
  { key: "shotCount", label: "Shots" },
  { key: "goalCount", label: "Possible goals" },
  { key: "distanceMeters", label: "Distance covered", digits: 0 },
  { key: "averageSpeedMetersPerSecond", label: "Average speed", digits: 1 },
  { key: "averageVisiblePlayers", label: "Players visible", digits: 1 },
];

/**
 * Reference "Match Stats": Team A value | label | Team B value, with possession on top as a
 * split bar in the team colours. Estimated rows have a dashed-underlined label; an estimated
 * possession bar is hatched.
 */
function MatchStats({ result, onMore }: { result: AnalysisResult; onMore: () => void }) {
  const [a, b] = result.analytics;
  const { teamAName, teamBName, teamAColor, teamBColor } = result.teams;
  const pa = a.possessionPercent;
  const pb = b.possessionPercent;
  const possEstimated = pa.quality !== "high";
  const hatch = (c: string) => (possEstimated ? `repeating-linear-gradient(135deg, ${c} 0 5px, color-mix(in srgb, ${c} 60%, transparent) 5px 8px)` : c);
  const known = pa.value !== null && pb.value !== null;
  const shareA = known ? pa.value! / Math.max(1e-9, pa.value! + pb.value!) : 0;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader title="Match stats" />
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-ink">
          <TeamChip color={teamAColor} name={teamAName} />
          <TeamChip color={teamBColor} name={teamBName} className="flex-row-reverse text-right" />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
          <span className="font-hud text-[28px] leading-none font-bold text-ink">{pa.value === null ? "–" : `${pa.value.toFixed(0)}%`}</span>
          <span className={clsx("text-center text-[13px] font-medium text-ink-2", possEstimated && "estimate")}>Possession</span>
          <span className="font-hud text-right text-[28px] leading-none font-bold text-ink">{pb.value === null ? "–" : `${pb.value.toFixed(0)}%`}</span>
        </div>
        <div aria-hidden className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-line-soft">
          {known && (
            <>
              <span className="team-fill h-full rounded-l-full" style={{ width: `${shareA * 100}%`, background: hatch(teamAColor) }} />
              <span className="team-fill h-full flex-1 rounded-r-full" style={{ background: hatch(teamBColor) }} />
            </>
          )}
        </div>

        <dl className="mt-4">
          {STAT_ROWS.map((r) => {
            const va = a[r.key];
            const vb = b[r.key];
            const unit = va.value !== null ? va.unit : vb.unit;
            const estimated = va.quality !== "high" || vb.quality !== "high";
            return (
              <div key={r.key} className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-t border-line-soft py-2.5">
                {/* dt first for a valid list; the grid puts it in the middle */}
                <dt className={clsx("order-2 text-center text-[13px] text-ink-2", estimated && "estimate")}>{r.label}</dt>
                <dd className="font-hud order-1 text-[17px] leading-none font-semibold text-ink">
                  <span className="sr-only">{teamAName}: </span>
                  {formatMetric(va.value, unit, r.digits)}
                </dd>
                <dd className="font-hud order-3 text-right text-[17px] leading-none font-semibold text-ink">
                  <span className="sr-only">{teamBName}: </span>
                  {formatMetric(vb.value, unit, r.digits)}
                </dd>
              </div>
            );
          })}
        </dl>

        <Button variant="secondary" size="sm" onClick={onMore} className="mt-auto w-full">
          View team analysis
        </Button>
      </div>
    </Card>
  );
}
