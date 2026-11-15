"use client";

import clsx from "clsx";
import { ArrowLeft, BarChart3, Cpu, Film, RefreshCw, ScanSearch, ShieldCheck, Upload, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useCapabilities } from "@/components/shell/CapabilityCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Button, Card, CardHeader, Magnet, Notice, ProgressBar, Segmented } from "@/components/ui/primitives";
import { describeAccelerator, useAccelerator, useDevicePreference } from "@/lib/accelerator";
import { formatBytes } from "@/lib/format";
import { useStryde } from "@/lib/store";
import type { AnalysisError, AnalysisMode, DevicePreference } from "@/lib/types";
import { ACCEPT_ATTR, createVideoThumbnail, inspectVideo, VideoValidationError } from "@/lib/video";

const TEAM_A_DEFAULT = "#d3263a";
const TEAM_B_DEFAULT = "#1f4fd1";

/** A team's dot: solid when the user set the colour, dashed and hollow while it will be detected (an estimate). */
function TeamMagnet({ color, size }: { color: string | undefined; size: number }) {
  if (color) return <Magnet color={color} size={size} />;
  return <span className="inline-block shrink-0 rounded-full border-2 border-dashed border-ink-2/60" style={{ width: size, height: size }} aria-hidden />;
}

function TeamField({
  side,
  name,
  onName,
  color,
  onColor,
  fallback,
  disabled,
}: {
  side: "A" | "B";
  name: string;
  onName: (v: string) => void;
  color: string | undefined;
  onColor: (v: string | undefined) => void;
  fallback: string;
  disabled: boolean;
}) {
  const nameId = useId();
  const colorRef = useRef<HTMLInputElement>(null);
  const auto = color === undefined;
  const openPicker = () => {
    const input = colorRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };
  return (
    <fieldset className="min-w-0 rounded-lg border border-line-soft bg-page/50 p-4" disabled={disabled}>
      <legend className="sr-only">Team {side}</legend>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink" aria-hidden>
        <TeamMagnet color={color} size={10} />
        Team {side}
      </p>

      <label htmlFor={nameId} className="mt-3 block text-xs font-medium text-ink-2">
        Name
      </label>
      <input
        id={nameId}
        value={name}
        onChange={(e) => onName(e.target.value)}
        maxLength={32}
        autoComplete="off"
        className="mt-1 h-10 w-full min-w-0 rounded-lg border border-line bg-card px-3 text-sm text-ink transition-colors placeholder:text-ink-2 hover:border-[#cfd6db] focus:border-brand disabled:opacity-60"
      />

      <p className="mt-3 text-xs font-medium text-ink-2">Shirt colour</p>
      <div className="mt-1 flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card transition-colors hover:border-[#cfd6db] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
          <TeamMagnet color={color} size={22} />
          <input
            ref={colorRef}
            type="color"
            aria-label={`Team ${side} shirt colour`}
            value={color ?? fallback}
            onChange={(e) => onColor(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <div className="min-w-0 text-[13px]">
          <p className={clsx("text-ink-2", auto && "estimate")}>{auto ? "Detected from the video" : "Set by you"}</p>
          <button
            type="button"
            onClick={auto ? openPicker : () => onColor(undefined)}
            className="mt-0.5 rounded font-semibold text-brand-deep hover:underline hover:underline-offset-4 disabled:no-underline disabled:opacity-50"
          >
            {auto ? "Pick a colour" : "Detect it instead"}
          </button>
        </div>
      </div>
    </fieldset>
  );
}

const MODES = [
  {
    v: "faster",
    t: "Faster",
    icon: Zap,
    facts: ["5 frames a second, small model", "Quickest result; runs well without a graphics chip"],
    tradeoff: "Can miss a small or blurred ball.",
  },
  {
    v: "detailed",
    t: "More detailed",
    icon: ScanSearch,
    facts: ["10 frames a second, larger model", "Finds the ball more often"],
    tradeoff: "About twice the wait; needs a graphics chip to be practical.",
  },
] as const;

const TRUST = [
  { icon: ShieldCheck, t: "Private", d: "Your video stays on this device." },
  { icon: Cpu, t: "In-browser AI", d: "Detection runs in this tab, nothing is uploaded." },
  { icon: BarChart3, t: "Detailed team insights", d: "Possession, territory and team shape." },
];

export default function AnalyzePage() {
  const router = useRouter();
  const createMatch = useStryde((s) => s.createMatch);
  const startAnalysis = useStryde((s) => s.startAnalysis);
  const caps = useCapabilities();

  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [teamAColor, setTeamAColor] = useState<string | undefined>();
  const [teamBColor, setTeamBColor] = useState<string | undefined>();
  const [mode, setMode] = useState<AnalysisMode>("faster");
  const accel = useAccelerator();
  const accelDesc = describeAccelerator(accel);
  const [devicePref, setDevicePref] = useDevicePreference();
  // with no usable GPU in this browser the only real choice is the CPU
  const device: DevicePreference = accel.kind === "cpu" ? "cpu" : devicePref;
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Every file pick, sample load or reset takes a new token; async results for an older token
  // (or after the page unmounted) are dropped, so file A's thumbnail can never land on file B.
  const requestRef = useRef(0);
  const aliveRef = useRef(true);
  const sampleAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      sampleAbortRef.current?.abort();
    };
  }, []);

  const busy = starting || sampleLoading;

  const start = useCallback(async () => {
    const file = selectedFile;
    if (!file || starting) return;
    const token = requestRef.current;
    setError(null);
    setStarting(true);
    try {
      const { meta, thumbnail, warnings } = await inspectVideo(file);
      // the user left the page while the clip was being inspected: don't start work they can't see
      if (!aliveRef.current || token !== requestRef.current) return;
      const id = createMatch(
        file,
        meta,
        {
          teamAName: teamAName.trim() || "Team A",
          teamBName: teamBName.trim() || "Team B",
          teamAColor,
          teamBColor,
          mode,
          device,
        },
        thumbnail,
        warnings
      );
      startAnalysis(id);
      // keep `starting` set: the button stays busy until the route changes
      router.push(`/app/match/${id}`);
    } catch (e) {
      if (!aliveRef.current || token !== requestRef.current) return;
      setStarting(false);
      if (e instanceof VideoValidationError) setError(e.detail);
      else
        setError({
          code: "inspect_failed",
          message: `The video could not be read: ${String((e as Error).message ?? e)}`,
          recoverable: true,
          suggestedAction: "Try an MP4 (H.264) clip.",
        });
    }
  }, [selectedFile, starting, createMatch, startAnalysis, router, teamAName, teamBName, teamAColor, teamBColor, mode, device]);

  const selectFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    const token = ++requestRef.current;
    sampleAbortRef.current?.abort();
    setError(null);
    setSampleLoading(false);
    setSelectedFile(f);
    setPreview(null);
    setReading(true);
    const thumb = await createVideoThumbnail(f);
    if (!aliveRef.current || token !== requestRef.current) return;
    setPreview(thumb ?? null);
    setReading(false);
  }, []);

  const onSample = useCallback(async () => {
    const token = ++requestRef.current;
    sampleAbortRef.current?.abort();
    const ctrl = new AbortController();
    sampleAbortRef.current = ctrl;
    setError(null);
    setSelectedFile(null);
    setPreview(null);
    setReading(false);
    setSampleLoading(true);
    const current = () => aliveRef.current && token === requestRef.current;
    try {
      const res = await fetch("/samples/sample-match.mp4?v=2", { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/html")) throw new Error("sample clip missing — run pnpm assets");
      const blob = await res.blob();
      const head = await blob.slice(0, 40).text();
      if (head.startsWith("version https://git-lfs")) throw new Error("sample clip was not built (missing asset download on deploy)");
      if (head.startsWith("<!DOCTYPE") || head.startsWith("<html")) throw new Error("sample clip missing — run pnpm assets");
      const magic = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
      const ftyp = String.fromCharCode(...magic);
      if (ftyp !== "ftyp") throw new Error("sample clip file is corrupt or not an MP4");
      if (blob.size < 100_000) throw new Error("sample clip file is too small or corrupt");
      if (!current()) return;
      const sample = new File([blob], "sample-match.mp4", { type: "video/mp4" });
      setSelectedFile(sample);
      setSampleLoading(false);
      setReading(true);
      const thumb = await createVideoThumbnail(sample);
      if (!current()) return;
      setPreview(thumb ?? null);
      setReading(false);
    } catch (e) {
      if (!current()) return;
      setSampleLoading(false);
      setError({ code: "sample_failed", message: `The sample clip could not be loaded (${String(e)}).`, recoverable: true, suggestedAction: "Choose a video from this device instead." });
    }
  }, []);


  /** Drop the chosen video (any pending thumbnail or sample load for it is ignored). */
  const clearFile = useCallback(() => {
    ++requestRef.current;
    sampleAbortRef.current?.abort();
    setError(null);
    setSelectedFile(null);
    setPreview(null);
    setReading(false);
    setSampleLoading(false);
  }, []);

  // "Try the sample clip" links from elsewhere arrive as /app/analyze?sample=1
  const sampleRequested = useRef(false);
  useEffect(() => {
    if (sampleRequested.current) return;
    sampleRequested.current = true;
    if (new URLSearchParams(window.location.search).get("sample") !== "1") return;
    router.replace("/app/analyze", { scroll: false });
    // deferred out of the effect body; onSample's own token/alive checks cover an unmount meanwhile
    setTimeout(() => void onSample(), 0);
  }, [onSample, router]);

  const browse = () => {
    if (!busy) inputRef.current?.click();
  };
  const modeInfo = MODES.find((m) => m.v === mode)!;

  return (
    <div className="pb-16">
      <PageHeader
        back={
          <Link href="/app" aria-label="Back to home" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink transition-colors hover:bg-ink/5">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        }
        title="Upload a new match"
        subtitle="Choose a clip, name the two teams and pick how thorough to be. The video never leaves this device."
      />

      <div className="mx-auto max-w-[1400px] space-y-5 px-4 sm:px-6 lg:px-8">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            selectFile(f);
          }}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            {/* video */}
            <Card className="p-5">
              <h2 className="sr-only">Video</h2>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !busy) selectFile(f);
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  browse();
                }}
                className={clsx(
                  "flex flex-col items-center rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors sm:py-12",
                  busy ? "cursor-default" : "cursor-pointer",
                  dragging ? "border-brand bg-brand-soft/60" : "border-line bg-page/50 hover:border-brand/50 hover:bg-brand-soft/25"
                )}
              >
                <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-ok">
                  <Upload className="size-6" aria-hidden />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-ink">{dragging ? "Let go to use this video" : "Drag and drop your video file here"}</p>
                <p className="mt-1 text-sm text-ink-2">
                  or{" "}
                  <button type="button" onClick={browse} disabled={busy} className="rounded font-semibold text-brand-deep underline underline-offset-4 hover:text-ink disabled:opacity-50">
                    click to browse
                  </button>
                </p>
                <p className="mt-4 max-w-md text-xs leading-relaxed text-ink-2">
                  MP4 (H.264), WebM or MOV · up to 1 GB and 5 minutes · Recommended: 30–60 s at 720p, 25 fps from a steady sideline camera
                </p>
              </div>

              {/* the chosen file, as a row */}
              {(selectedFile || sampleLoading) && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-line p-3 sm:gap-4">
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-navy-900 sm:w-28">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={selectedFile ? `First frame of ${selectedFile.name}` : ""} className="size-full object-cover" />
                    ) : (
                      <Film className="absolute inset-0 m-auto size-5 text-white/45" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1" role="status">
                    <p className="truncate text-sm font-semibold text-ink" title={selectedFile?.name}>
                      {selectedFile ? selectedFile.name : "sample-match.mp4"}
                    </p>
                    {selectedFile ? (
                      <p className="mt-0.5 text-xs text-ink-2">
                        <span className="tabular">{formatBytes(selectedFile.size)}</span>
                        {reading ? " · Reading the video…" : preview ? " · Ready to analyze" : " · No preview for this video"}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-ink-2">Loading the sample clip…</p>
                    )}
                    {(reading || sampleLoading) && <ProgressBar value={0} indeterminate className="mt-2 h-1 max-w-xs" label="Loading the video" />}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    {selectedFile && (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={browse}>
                        <RefreshCw className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Change</span>
                        <span className="sr-only sm:hidden">Change video</span>
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" disabled={starting} onClick={clearFile}>
                      <X className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Cancel</span>
                      <span className="sr-only sm:hidden">Remove video</span>
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-page px-4 py-3">
                <p className="text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">No clip to hand?</span> Try 48 seconds of broadcast footage.
                </p>
                <Button variant="secondary" size="sm" disabled={busy} loading={sampleLoading} onClick={onSample}>
                  Use the sample clip
                </Button>
              </div>

              {error && (
                <Notice tone="danger" title={error.message} className="mt-4">
                  {error.suggestedAction} Your video stayed on this device.
                </Notice>
              )}
            </Card>

            {/* teams */}
            <Card>
              <CardHeader title="Teams" subtitle="Optional. Team A is always shown on the left, Team B on the right. You can rename teams or fix colours later." />
              <div className="grid gap-3 px-5 sm:grid-cols-2">
                <TeamField side="A" name={teamAName} onName={setTeamAName} color={teamAColor} onColor={setTeamAColor} fallback={TEAM_A_DEFAULT} disabled={starting} />
                <TeamField side="B" name={teamBName} onName={setTeamBName} color={teamBColor} onColor={setTeamBColor} fallback={TEAM_B_DEFAULT} disabled={starting} />
              </div>
              <p className="px-5 pt-3 pb-5 text-xs leading-relaxed text-ink-2">
                Left on detect, Stryde splits the players into two teams by shirt colour. Setting a colour helps when the kits look alike.
              </p>
            </Card>
          </div>

          <div className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:self-start">
            {/* mode */}
            <Card>
              <CardHeader title="Analysis mode" subtitle="How thorough to be. Both run entirely on this device." />
              <fieldset disabled={starting} className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-1">
                <legend className="sr-only">Analysis mode</legend>
                {MODES.map((o) => {
                  const on = mode === o.v;
                  const fit = o.v === "faster" ? caps.webgpu === false : caps.webgpu === true;
                  return (
                    <label
                      key={o.v}
                      className={clsx(
                        "relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                        on ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-line hover:border-[#cfd6db] hover:bg-page/60"
                      )}
                    >
                      <input type="radio" name="mode" value={o.v} checked={on} onChange={() => setMode(o.v)} className="sr-only" />
                      <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-brand text-navy-950" : "bg-page text-ink-2 ring-1 ring-line-soft ring-inset")}>
                        <o.icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-6 text-sm font-semibold text-ink">
                          {o.t}
                          {fit && <Badge tone="ok">Suits this device</Badge>}
                        </span>
                        <span className="mt-1.5 block space-y-0.5 text-xs leading-relaxed text-ink-2">
                          {o.facts.map((f) => (
                            <span key={f} className="block">
                              {f}
                            </span>
                          ))}
                          <span className="block text-ink">{o.tradeoff}</span>
                        </span>
                      </span>
                      <span
                        className={clsx("absolute top-4 right-4 grid size-4 place-items-center rounded-full border-2", on ? "border-brand" : "border-line")}
                        aria-hidden
                      >
                        {on && <span className="size-2 rounded-full bg-brand" />}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <div className="mx-5 mb-5 rounded-xl border border-line px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p id="device-label" className="text-sm font-semibold text-ink">
                      Run on
                    </p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {accel.kind === "checking"
                        ? "Checking this device…"
                        : device === "gpu"
                          ? `${accelDesc?.long}. Falls back to the CPU if the GPU fails.`
                          : accel.kind === "cpu"
                            ? "No GPU is available to this browser, so analysis runs on the CPU."
                            : "Processor only (WebAssembly). Slower, but useful to compare or if the GPU misbehaves."}
                    </p>
                  </div>
                  <Segmented<DevicePreference>
                    label="Run analysis on"
                    size="sm"
                    value={device}
                    onChange={setDevicePref}
                    options={[
                      {
                        value: "gpu",
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <Zap className="size-3.5" aria-hidden /> GPU
                          </span>
                        ),
                        disabled: accel.kind === "cpu" || starting,
                        title: accel.kind === "cpu" ? "No GPU is available to this browser" : undefined,
                      },
                      {
                        value: "cpu",
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <Cpu className="size-3.5" aria-hidden /> CPU
                          </span>
                        ),
                        disabled: starting,
                      },
                    ]}
                  />
                </div>
              </div>
              {mode === "detailed" && caps.webgpu === false && (
                <Notice tone="warn" className="mx-5 mb-5">
                  This browser can&apos;t use a graphics chip, so More detailed falls back to the small model at 8 frames a second on the processor. Expect it to take
                  several minutes.
                </Notice>
              )}
            </Card>

            {/* start */}
            <Card className="p-5">
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-2">Video</dt>
                  <dd className="min-w-0 truncate font-medium text-ink">{selectedFile ? selectedFile.name : "None chosen"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-2">Teams</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                    <TeamMagnet color={teamAColor} size={8} />
                    <span className="truncate">{teamAName.trim() || "Team A"}</span>
                    <span className="font-normal text-ink-2">vs</span>
                    <TeamMagnet color={teamBColor} size={8} />
                    <span className="truncate">{teamBName.trim() || "Team B"}</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-2">Mode</dt>
                  <dd className="font-medium text-ink">{modeInfo.t}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-2">Runs on</dt>
                  <dd className="font-medium text-ink">
                    {accel.kind === "checking" ? "Checking…" : device === "cpu" ? "CPU" : `GPU${accel.api ? ` (${accel.api})` : ""}`}
                  </dd>
                </div>
              </dl>
              <Button size="lg" className="mt-5 w-full" onClick={start} disabled={!selectedFile || sampleLoading} loading={starting}>
                {starting ? "Starting analysis…" : "Analyze match"}
              </Button>
              <p className="mt-2.5 text-center text-xs leading-relaxed text-ink-2">
                {selectedFile ? "Progress shows as it runs. Keep this tab open until it finishes." : "Choose a video first, or use the sample clip."}
              </p>
            </Card>
          </div>
        </div>

        {/* trust tiles */}
        <Card as="div" className="grid gap-4 p-5 sm:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.t} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-ok">
                <t.icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{t.t}</p>
                <p className="text-xs leading-relaxed text-ink-2">{t.d}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
