"use client";

import clsx from "clsx";
import { ArrowLeft, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Card, CardHeader, LinkButton, Notice } from "@/components/ui/primitives";
import { buildTeamFrames } from "@/lib/analysis/analytics";
import { formatBytes, formatDuration } from "@/lib/format";
import { buildRenderIndex } from "@/lib/render";
import { useStryde, type MatchEntry } from "@/lib/store";
import type { AnalysisResult, OverlayOptions } from "@/lib/types";
import { CalibrationPanel } from "./CalibrationPanel";
import { EventsList } from "./EventsList";
import { PitchPanel } from "./PitchPanel";
import { PlaybackProvider } from "./playback";
import { PossessionDonut } from "./PossessionDonut";
import { PossessionTimeline } from "./PossessionTimeline";
import { isPartial, QualityPanel } from "./QualityPanel";
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
  { id: "calibration", label: "Pitch calibration" },
  { id: "teams", label: "Teams & data quality" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MatchWorkspace({ entry, result }: { entry: MatchEntry; result: AnalysisResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab") as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? tabParam! : "overview";
  const applyOverrides = useStryde((s) => s.applyOverrides);
  const renameTeams = useStryde((s) => s.renameTeams);
  const [overlays, setOverlays] = useState<OverlayOptions>(DEFAULT_OVERLAYS);

  const index = useMemo(() => buildRenderIndex(result), [result]);
  const teamFrames = useMemo(() => buildTeamFrames(result.tracks, result.frames, 1 / result.coverage.sampleFps), [result]);
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTab = (id: TabId) => {
    const sp = new URLSearchParams(params.toString());
    if (id === "overview") sp.delete("tab");
    else sp.set("tab", id);
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  const onColors = useCallback(
    (a: string | undefined, b: string | undefined) => {
      if (colorTimer.current) clearTimeout(colorTimer.current);
      colorTimer.current = setTimeout(() => applyOverrides(entry.id, { teamAColor: a, teamBColor: b }), 120);
    },
    [applyOverrides, entry.id]
  );

  const partial = isPartial(result);
  const calibrated = result.calibration.method === "homography";

  const right = (() => {
    switch (tab) {
      case "overview":
        return (
          <Card>
            <CardHeader title="Match stats" subtitle="Team-level estimates, side by side" />
            <div className="pb-2">
              <TeamStats result={result} compact />
            </div>
          </Card>
        );
      case "team":
        return (
          <Card>
            <CardHeader title="Tactical pitch" subtitle="Synchronized with the video" />
            <div className="px-5 pb-5">
              <PitchPanel result={result} teamFrames={teamFrames} compact />
            </div>
          </Card>
        );
      case "events":
        return (
          <Card>
            <CardHeader title="Estimated events" subtitle="Click an event to replay it" />
            <div className="px-5 pb-5">
              <EventsList result={result} />
            </div>
          </Card>
        );
      case "summary":
        return (
          <Card>
            <CardHeader title="Possession" subtitle="Estimated share of known time" />
            <div className="px-5 pb-5">
              <PossessionDonut result={result} />
            </div>
          </Card>
        );
      case "calibration":
      case "teams":
        return (
          <Card>
            <CardHeader title="Data quality & coverage" />
            <div className="px-5 pb-5">
              <QualityPanel result={result} />
            </div>
          </Card>
        );
    }
  })();

  const lower = (() => {
    switch (tab) {
      case "overview":
        return (
          <div className="grid gap-5 2xl:grid-cols-2">
            <Card>
              <CardHeader title="Possession timeline" subtitle="Estimated team in possession over time · click to seek" />
              <div className="px-5 pb-5">
                <PossessionTimeline result={result} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Tactical pitch" subtitle="Team occupancy synchronized with playback" action={<LinkToTab onClick={() => setTab("team")} label="Open team analysis" />} />
              <div className="px-5 pb-5">
                <PitchPanel result={result} teamFrames={teamFrames} compact />
              </div>
            </Card>
          </div>
        );
      case "team":
        return (
          <div className="grid gap-5 2xl:grid-cols-2">
            <Card>
              <CardHeader title="Team comparison" subtitle="All team metrics with definitions and quality" />
              <div className="pb-2">
                <TeamStats result={result} />
              </div>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader title="Presence by third" subtitle="Movement zones across the pitch length" />
                <div className="px-5 pb-5">
                  <ThirdsComparison result={result} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Possession timeline" />
                <div className="px-5 pb-5">
                  <PossessionTimeline result={result} height={100} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Full-clip heatmaps" subtitle="Compare teams across the whole analyzed clip" />
                <div className="px-5 pb-5">
                  <PitchPanel result={result} teamFrames={teamFrames} defaultLayer="movement" defaultScope="full" />
                </div>
              </Card>
            </div>
          </div>
        );
      case "events":
        return (
          <Card>
            <CardHeader title="Possession & events timeline" subtitle="Yellow lines mark estimated shots, green lines possible goals" />
            <div className="px-5 pb-5">
              <PossessionTimeline result={result} />
            </div>
          </Card>
        );
      case "summary":
        return <SummaryView result={result} teamFrames={teamFrames} />;
      case "calibration":
        return (
          <Card>
            <CardHeader title="Pitch calibration" subtitle={calibrated ? "Calibration active — spatial metrics use pitch coordinates" : "Optional — improves spatial accuracy"} />
            <div className="px-5 pb-5">
              <CalibrationPanel src={entry.url} result={result} index={index} onApply={(cal) => applyOverrides(entry.id, { calibration: cal })} />
            </div>
          </Card>
        );
      case "teams":
        return (
          <Card>
            <CardHeader title="Team names & colors" subtitle="Correct the jersey colors used for team assignment" />
            <div className="px-5 pb-5">
              <TeamSettingsPanel key={`${result.teams.teamAName}|${result.teams.teamBName}`} entry={entry} result={result} onColors={onColors} onNames={(a, b) => renameTeams(entry.id, a, b)} />
            </div>
          </Card>
        );
    }
  })();

  return (
    <PlaybackProvider>
      <PageHeader
        back={
          <Link href="/app/matches" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" /> Matches
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {result.teams.teamAName} vs {result.teams.teamBName}
            {partial ? <Badge tone="warn">Completed · partial analysis</Badge> : <Badge tone="ok">Completed</Badge>}
          </span>
        }
        subtitle={`${entry.meta.fileName} · ${formatDuration(entry.meta.durationSeconds)} · ${entry.meta.width}×${entry.meta.height} · ${formatBytes(
          entry.meta.fileSizeBytes
        )} · ${result.processing.mode === "detailed" ? "More detailed" : "Faster"} analysis`}
        actions={
          <LinkButton href="/app/analyze" variant="secondary">
            <Upload className="size-4" /> Analyze another
          </LinkButton>
        }
      />
      <div className="px-4 sm:px-8">
        <div role="tablist" aria-label="Match views" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "shrink-0 border-b-2 px-3 pt-1 pb-2.5 text-sm font-medium transition-colors",
                tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!calibrated && (tab === "overview" || tab === "team") && (
          <Notice
            tone="info"
            className="mb-5"
            title="Spatial results are approximate"
            action={<LinkToTab onClick={() => setTab("calibration")} label="Calibrate pitch" />}
          >
            Positions are mapped from camera-stabilized image coordinates. Distance, speed, team shape and goal estimates need pitch calibration.
          </Notice>
        )}

        <div className="grid gap-5 pb-12 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-5">
            <VideoPlayer src={entry.url} result={result} index={index} overlays={overlays} onOverlaysChange={setOverlays} />
            <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
              {lower}
            </div>
          </div>
          <div className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">{right}</div>
        </div>
      </div>
    </PlaybackProvider>
  );
}

function LinkToTab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="shrink-0 text-sm font-semibold text-[#11704a] hover:underline">
      {label}
    </button>
  );
}
