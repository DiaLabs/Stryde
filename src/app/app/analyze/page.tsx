"use client";

import clsx from "clsx";
import { FileVideo, Lock, Sparkles, UploadCloud, Zap, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useCapabilities } from "@/components/shell/CapabilityCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";
import type { AnalysisError, AnalysisMode } from "@/lib/types";
import { ACCEPT_ATTR, createVideoThumbnail, inspectVideo, VideoValidationError } from "@/lib/video";

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
    <div className="flex items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-[15px] text-ink-2">
        <input type="checkbox" className="size-4 accent-[#20C785]" checked={auto} onChange={(e) => onChange(e.target.checked ? undefined : "#2F80ED")} />
        Auto-detect
      </label>
      <input
        type="color"
        aria-label={`${label} jersey color`}
        disabled={auto}
        value={value ?? "#999999"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-md border border-line bg-card p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(
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

  const onFileInput = useCallback(async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setSelectedFile(f);
    setPreview(null);
    const thumb = await createVideoThumbnail(f);
    setPreview(thumb ?? null);
  }, []);

  const onSample = useCallback(async () => {
    setError(null);
    setInspecting("sample clip");
    try {
      const res = await fetch("/samples/sample-match.mp4?v=2", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/html")) throw new Error("sample clip missing — run npm run assets");
      const blob = await res.blob();
      const head = await blob.slice(0, 40).text();
      if (head.startsWith("version https://git-lfs")) throw new Error("sample clip was not built (missing asset download on deploy)");
      if (head.startsWith("<!DOCTYPE") || head.startsWith("<html")) throw new Error("sample clip missing — run npm run assets");
      const magic = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
      const ftyp = String.fromCharCode(...magic);
      if (ftyp !== "ftyp") throw new Error("sample clip file is corrupt or not an MP4");
      if (blob.size < 100_000) throw new Error("sample clip file is too small or corrupt");
      const sample = new File([blob], "sample-match.mp4", { type: "video/mp4" });
      setSelectedFile(sample);
      const thumb = await createVideoThumbnail(sample);
      setPreview(thumb ?? null);
      setInspecting(null);
    } catch (e) {
      setInspecting(null);
      setError({ code: "sample_failed", message: `The sample clip could not be loaded (${String(e)}).`, recoverable: true });
    }
  }, []);

  return (
    <div className="pb-10">
      <PageHeader title="Analyze a match" subtitle="Set up the teams on the left, pick your clip on the right, then start analysis." />

      <div className="grid gap-5 px-4 sm:px-8 xl:grid-cols-[420px_1fr]">
        {/* Left: Match setup */}
        <Card className="self-start">
          <CardHeader title="Match setup" subtitle="Optional — defaults work. Colors can be corrected after analysis." />
          <div className="space-y-5 px-5 pb-5">
            {[
              { key: "A", name: teamAName, setName: setTeamAName, color: teamAColor, setColor: setTeamAColor },
              { key: "B", name: teamBName, setName: setTeamBName, color: teamBColor, setColor: setTeamBColor },
            ].map((t) => (
              <fieldset key={t.key} className="space-y-2">
                <legend className="text-[15px] font-semibold">Team {t.key}</legend>
                <input
                  value={t.name}
                  onChange={(e) => t.setName(e.target.value)}
                  maxLength={32}
                  aria-label={`Team ${t.key} name`}
                  className="h-11 w-full rounded-lg border border-line bg-card px-3 text-[15px] outline-none focus:border-brand"
                />
                <ColorField label={`Team ${t.key}`} value={t.color} onChange={t.setColor} />
              </fieldset>
            ))}
            <p className="text-[15px] leading-relaxed text-ink-2">
              Auto-detect groups tracked players by jersey color. Setting a color manually anchors that team to the closest jerseys.
            </p>

            <fieldset>
              <legend className="text-[15px] font-semibold">Analysis mode</legend>
              <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Analysis mode">
                {(
                  [
                    { v: "faster", t: "Faster", d: "Small model, 5 FPS. Best for CPUs and quick looks.", icon: Zap },
                    { v: "detailed", t: "More detailed", d: "Larger model, 10 FPS. Better ball detection; needs GPU.", icon: Sparkles },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.v}
                    onClick={() => setMode(o.v)}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      mode === o.v ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-line hover:bg-page"
                    )}
                  >
                    <div className={clsx("grid size-9 shrink-0 place-items-center rounded-full", mode === o.v ? "bg-brand text-navy-950" : "bg-page text-ink-2")}>
                      <o.icon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <span className="font-semibold">{o.t}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-ink-2">{o.d}</span>
                    </div>
                  </button>
                ))}
              </div>
              {mode === "detailed" && caps.webgpu === false && (
                <Notice tone="warn" className="mt-3">
                  WebGPU is unavailable here, so More Detailed will use the smaller model on the CPU at 8 FPS and may take several minutes.
                </Notice>
              )}
            </fieldset>
          </div>
        </Card>

        {/* Right: Upload */}
        <Card>
          <CardHeader title="Match video" subtitle="MP4 (H.264) or WebM · 30–60 s · 720p at 25 fps works best" />
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
                if (f && !inspecting) onFileInput(f);
              }}
              className={clsx(
                "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                selectedFile ? "border-brand/60 bg-brand-soft/40" : "border-line bg-page/60",
                !selectedFile && "hover:border-brand/50 hover:bg-page"
              )}
            >
              {selectedFile ? (
                <div className="w-full max-w-sm">
                  {preview ? (
                    <div className="relative h-24 w-40 overflow-hidden rounded-xl bg-navy-900 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="Video preview" className="size-full object-cover" />
                    </div>
                  ) : (
                    <div className="grid size-16 place-items-center rounded-2xl bg-brand text-navy-950 shadow-sm">
                      <FileVideo className="size-8" aria-hidden />
                    </div>
                  )}
                  <p className="mt-4 text-lg font-semibold">{selectedFile.name}</p>
                  <p className="mt-1 text-[15px] text-ink-2">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || "video"}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button size="lg" loading={!!inspecting} onClick={() => start(selectedFile)}>
                      Analyze match
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreview(null);
                      }}
                    >
                      <X className="size-4" /> Change
                    </Button>
                  </div>
                </div>
              ) : inspecting ? (
                <>
                  <span className="size-12 animate-spin rounded-full border-[5px] border-brand border-t-transparent" aria-hidden />
                  <p className="mt-5 text-lg font-semibold">Loading sample clip…</p>
                </>
              ) : (
                <>
                  <div className="grid size-16 place-items-center rounded-2xl bg-brand-soft shadow-sm">
                    <UploadCloud className="size-8 text-[#11704a]" aria-hidden />
                  </div>
                  <p className="mt-5 text-lg font-semibold">Drag and drop your match video here</p>
                  <p className="mt-1 text-[15px] text-ink-2">or</p>
                  <Button size="lg" className="mt-4" onClick={() => inputRef.current?.click()}>
                    <FileVideo className="size-5" /> Browse files
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
                      onFileInput(f);
                    }}
                  />
                  <p className="mt-4 text-center text-[15px] text-ink-2">
                    No clip handy?{" "}
                    <button type="button" className="font-semibold text-[#11704a] hover:underline" onClick={onSample}>
                      Try the sample clip
                    </button>{" "}
                    (48 s broadcast footage).
                  </p>
                </>
              )}
            </div>

            {error && (
              <Notice tone="danger" title={error.message} className="mt-5">
                {error.suggestedAction} Your video stayed on this device.
              </Notice>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Lock, t: "Private", d: "Your clip never leaves this browser." },
                { icon: Zap, t: "Starts when ready", d: "Analysis begins after the engine loads." },
                { icon: Sparkles, t: "Best on steady views", d: "Pans, zooms and cuts reduce accuracy." },
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
        </Card>
      </div>
    </div>
  );
}
