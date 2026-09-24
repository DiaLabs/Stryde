"use client";

import clsx from "clsx";
import { FileVideo, Lock, Sparkles, UploadCloud, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useCapabilities } from "@/components/shell/CapabilityCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";
import type { AnalysisError, AnalysisMode } from "@/lib/types";
import { ACCEPT_ATTR, inspectVideo, VideoValidationError } from "@/lib/video";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const auto = value === undefined;
  return (
    <div className="flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4 accent-[#20C785]" checked={auto} onChange={(e) => onChange(e.target.checked ? undefined : "#2F80ED")} />
        Auto-detect
      </label>
      <input
        type="color"
        aria-label={`${label} jersey color`}
        disabled={auto}
        value={value ?? "#999999"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-line bg-card p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

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
  const [dragging, setDragging] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [error, setError] = useState<AnalysisError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setInspecting(file.name);
      try {
        const { meta, thumbnail, warnings } = await inspectVideo(file);
        const id = createMatch(
          file,
          meta,
          {
            teamAName: teamAName.trim() || "Team A",
            teamBName: teamBName.trim() || "Team B",
            teamAColor,
            teamBColor,
            mode,
          },
          thumbnail,
          warnings
        );
        startAnalysis(id);
        router.push(`/app/match/${id}`);
      } catch (e) {
        setInspecting(null);
        if (e instanceof VideoValidationError) setError(e.detail);
        else
          setError({
            code: "inspect_failed",
            message: `The video could not be inspected: ${String((e as Error).message ?? e)}`,
            recoverable: true,
            suggestedAction: "Try an MP4 (H.264) clip.",
          });
      }
    },
    [createMatch, startAnalysis, router, teamAName, teamBName, teamAColor, teamBColor, mode]
  );

  return (
    <div className="pb-12">
      <PageHeader title="Analyze a match" subtitle="Set up the teams, then choose a clip — analysis starts automatically once the video is validated." />
      <div className="grid gap-5 px-4 sm:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="order-2 xl:order-1">
          <CardHeader title="Match video" subtitle="MP4 (H.264) or WebM · 30–60 s recommended · 720p at 25 fps is the target quality" />
          <div className="px-5 pb-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f && !inspecting) void handleFile(f);
              }}
              className={clsx(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                dragging ? "border-brand bg-brand-soft" : "border-line bg-page/60"
              )}
            >
              {inspecting ? (
                <>
                  <span className="size-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden />
                  <p className="mt-4 font-semibold">Checking {inspecting}…</p>
                  <p className="mt-1 text-sm text-ink-2">Reading metadata and test-decoding frames locally.</p>
                </>
              ) : (
                <>
                  <div className="grid size-14 place-items-center rounded-full bg-card shadow-sm">
                    <UploadCloud className="size-7 text-[#11704a]" aria-hidden />
                  </div>
                  <p className="mt-4 text-base font-semibold">Drag and drop your match video here</p>
                  <p className="mt-1 text-sm text-ink-2">or</p>
                  <Button className="mt-3" onClick={() => inputRef.current?.click()}>
                    <FileVideo className="size-4" /> Browse files
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    aria-label="Choose match video"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleFile(f);
                    }}
                  />
                </>
              )}
            </div>
            {!inspecting && (
              <p className="mt-3 text-center text-sm text-ink-2">
                No clip handy?{" "}
                <button
                  type="button"
                  className="font-semibold text-[#11704a] hover:underline"
                  onClick={async () => {
                    try {
                      setInspecting("sample clip");
                      const res = await fetch("/samples/sample-match.mp4");
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const blob = await res.blob();
                      await handleFile(new File([blob], "sample-match.mp4", { type: "video/mp4" }));
                    } catch (e) {
                      setInspecting(null);
                      setError({ code: "sample_failed", message: `The sample clip could not be loaded (${String(e)}).`, recoverable: true });
                    }
                  }}
                >
                  Try the sample clip
                </button>{" "}
                (48 s broadcast footage, analyzed like any other upload).
              </p>
            )}
            {error && (
              <Notice tone="danger" title={error.message} className="mt-4">
                {error.suggestedAction} Your video stayed on this device.
              </Notice>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="flex gap-3 rounded-lg border border-line p-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-[#11704a]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Private by design</p>
                  <p className="text-xs text-ink-2">Processed in this browser. The video is never uploaded to Stryde.</p>
                </div>
              </div>
              <div className="flex gap-3 rounded-lg border border-line p-3">
                <Zap className="mt-0.5 size-4 shrink-0 text-[#11704a]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Starts automatically</p>
                  <p className="text-xs text-ink-2">No extra click: validation passes, analysis begins.</p>
                </div>
              </div>
              <div className="flex gap-3 rounded-lg border border-line p-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-[#11704a]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Best on steady views</p>
                  <p className="text-xs text-ink-2">Pans, zooms, cuts and occlusion reduce accuracy.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="order-1 xl:order-2">
          <CardHeader title="Match setup" subtitle="Optional — defaults work. Colors can also be corrected after analysis." />
          <div className="space-y-5 px-5 pb-5">
            {[
              { key: "A", name: teamAName, setName: setTeamAName, color: teamAColor, setColor: setTeamAColor },
              { key: "B", name: teamBName, setName: setTeamBName, color: teamBColor, setColor: setTeamBColor },
            ].map((t) => (
              <fieldset key={t.key} className="space-y-2">
                <legend className="text-sm font-semibold">Team {t.key}</legend>
                <input
                  value={t.name}
                  onChange={(e) => t.setName(e.target.value)}
                  maxLength={32}
                  aria-label={`Team ${t.key} name`}
                  className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-brand"
                />
                <ColorField label={`Team ${t.key}`} value={t.color} onChange={t.setColor} />
              </fieldset>
            ))}
            <p className="text-xs text-ink-2">
              Auto-detect groups tracked players by jersey color. Setting a color manually anchors that team to the closest jerseys.
            </p>

            <fieldset>
              <legend className="text-sm font-semibold">Analysis mode</legend>
              <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Analysis mode">
                {(
                  [
                    { v: "faster", t: "Faster", d: "Small model, 5 frames per second. Best for CPUs and quick looks." },
                    { v: "detailed", t: "More detailed", d: "Larger model, 10 frames per second. Better ball detection; needs a capable GPU." },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.v}
                    onClick={() => setMode(o.v)}
                    className={clsx(
                      "rounded-lg border p-3 text-left transition-colors",
                      mode === o.v ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-line hover:bg-page"
                    )}
                  >
                    <span className="text-sm font-semibold">{o.t}</span>
                    <span className="mt-0.5 block text-xs text-ink-2">{o.d}</span>
                  </button>
                ))}
              </div>
              {mode === "detailed" && caps.webgpu === false && (
                <Notice tone="warn" className="mt-3">
                  WebGPU is unavailable here, so More Detailed will use the smaller model on the CPU at 8 frames per second and may take several minutes.
                </Notice>
              )}
            </fieldset>
          </div>
        </Card>
      </div>
    </div>
  );
}
