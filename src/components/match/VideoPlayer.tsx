"use client";

import clsx from "clsx";
import { Layers, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import { nearestSample, possessionAt, type RenderIndex } from "@/lib/render";
import { drawOverlay } from "@/lib/render/overlay";
import type { AnalysisResult, OverlayOptions } from "@/lib/types";
import { readableTextColor } from "@/lib/vision/color";
import { usePlayback } from "./playback";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export const DEFAULT_OVERLAYS: OverlayOptions = {
  showPlayerBoxes: true,
  showTeamLabels: true,
  showPossessionHighlight: true,
  showPossessionPanel: true,
  showBall: true,
  showTrails: false,
  showShotEvents: true,
  showGoalEvents: true,
  showScorebug: true,
  showConfidence: false,
};

export function VideoPlayer({
  src,
  result,
  index,
  overlays,
  onOverlaysChange,
}: {
  src: string;
  result: AnalysisResult;
  index: RenderIndex;
  overlays: OverlayOptions;
  onOverlaysChange: (o: OverlayOptions) => void;
}) {
  const { videoRef, setTime, time } = usePlayback();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(result.video.durationSeconds);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [gap, setGap] = useState(false);
  const lastPublished = useRef(0);
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);
  const aspect = result.video.width / result.video.height;
  const teams = result.teams;

  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const box = containerRef.current;
    if (!v || !c || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    let w = cw;
    let h = cw / aspect;
    if (h > ch) {
      h = ch;
      w = ch * aspect;
    }
    const res = drawOverlay(ctx, { x: (cw - w) / 2, y: (ch - h) / 2, w, h, dpr }, v.currentTime, index, overlaysRef.current, teams);
    setGap((g) => (g !== res.gap ? res.gap : g));
    const now = performance.now();
    if (now - lastPublished.current > 90) {
      lastPublished.current = now;
      setTime(v.currentTime);
    }
  }, [aspect, index, teams, setTime, videoRef]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (playing) raf = requestAnimationFrame(loop);
    else draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, draw]);

  useEffect(() => {
    draw();
  }, [overlays, draw, time]);

  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    const onFs = () => setFullscreen(document.fullscreenElement === box);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro.disconnect();
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [draw]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [videoRef]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      const { i } = nearestSample(index, v.currentTime);
      const j = Math.max(0, Math.min(index.times.length - 1, i + dir));
      if (index.times[j] !== undefined) v.currentTime = index.times[j];
    },
    [index, videoRef]
  );

  const toggleFullscreen = useCallback(() => {
    const box = containerRef.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen?.();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,select,button,[role=switch]") && e.key !== "Escape") return;
    const v = videoRef.current;
    if (!v) return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      v.currentTime = Math.min(v.duration, v.currentTime + 5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      v.currentTime = Math.max(0, v.currentTime - 5);
    } else if (e.key === ".") step(1);
    else if (e.key === ",") step(-1);
    else if (e.key === "f") toggleFullscreen();
    else if (e.key === "Escape") setMenu(false);
  };

  const poss = possessionAt(index, time);
  const possTotal = poss.a + poss.b;
  const pctA = possTotal > 0 ? (poss.a / possTotal) * 100 : null;
  const inPoss = poss.sample?.teamId ?? "unknown";
  const markers = useMemo(() => result.events.filter((e) => e.type === "shot" || e.type === "goal"), [result.events]);
  const pct = duration ? (time / duration) * 100 : 0;

  const layerToggles: [keyof OverlayOptions, string][] = [
    ["showScorebug", "Scorebug (teams & clock)"],
    ["showPlayerBoxes", "Player boxes"],
    ["showTeamLabels", "Team labels"],
    ["showPossessionHighlight", "Possession ring on player"],
    ["showPossessionPanel", "Possession panel"],
    ["showBall", "Ball indicator"],
    ["showTrails", "Movement trails"],
    ["showShotEvents", "Shot trajectories"],
    ["showGoalEvents", "Goal banners"],
    ["showConfidence", "Detection confidence"],
  ];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Annotated match video. Space to play or pause, arrow keys to seek, comma and period to step between analyzed frames, F for fullscreen."
      className={clsx("group relative w-full overflow-hidden bg-black outline-none select-none", fullscreen ? "h-full" : "rounded-xl")}
      style={fullscreen ? undefined : { aspectRatio: `${aspect}` }}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted={muted}
        preload="auto"
        className="absolute inset-0 size-full object-contain"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          draw();
        }}
        onEnded={() => setPlaying(false)}
        onSeeked={draw}
        onTimeUpdate={() => !playing && draw()}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = rate;
          draw();
        }}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

      {overlays.showScorebug && (
        <div className="pointer-events-none absolute top-[3%] left-[2.5%] flex items-stretch overflow-hidden rounded-md text-[clamp(9px,1.25vw,14px)] font-bold shadow-lg">
          <div className="flex items-center bg-navy-950/90 px-2 text-brand">STRYDE</div>
          {(["team_a", "team_b"] as const).map((tm) => {
            const color = tm === "team_a" ? teams.teamAColor : teams.teamBColor;
            const name = tm === "team_a" ? teams.teamAName : teams.teamBName;
            return (
              <div key={tm} className="flex items-center gap-1.5 px-2 py-1" style={{ background: color, color: readableTextColor(color) }}>
                {inPoss === tm && overlays.showPossessionHighlight && (
                  <span className="size-[0.55em] rounded-full bg-white/90 ring-1 ring-black/30" aria-hidden />
                )}
                <span className="max-w-[9em] truncate uppercase">{name}</span>
              </div>
            );
          })}
          <div className="flex items-center bg-navy-950/90 px-2 text-white tabular-nums">{formatClock(time)}</div>
        </div>
      )}

      {overlays.showPossessionPanel && (
        <div className="pointer-events-none absolute right-[2.5%] bottom-[16%] w-[clamp(150px,26%,260px)] rounded-lg border border-white/15 bg-navy-950/85 p-[0.8em] text-[clamp(9px,1.1vw,13px)] text-white shadow-xl">
          <div className="mb-[0.5em] flex items-center justify-between">
            <span className="font-bold tracking-wider">POSSESSION</span>
            <span className="rounded bg-white/15 px-1 text-[0.8em] font-semibold">EST.</span>
          </div>
          {pctA === null ? (
            <p className="text-white/70">Not enough evidence yet</p>
          ) : (
            (["team_a", "team_b"] as const).map((tm) => {
              const p = tm === "team_a" ? pctA : 100 - pctA;
              const color = tm === "team_a" ? teams.teamAColor : teams.teamBColor;
              return (
                <div key={tm} className="mt-[0.35em] flex items-center gap-[0.6em]">
                  <span className="w-[5.5em] truncate">{tm === "team_a" ? teams.teamAName : teams.teamBName}</span>
                  <span className="h-[0.8em] flex-1 overflow-hidden rounded-sm bg-white/10">
                    <span className="block h-full" style={{ width: `${p}%`, background: color }} />
                  </span>
                  <span className="w-[2.6em] text-right font-bold tabular-nums">{p.toFixed(0)}%</span>
                </div>
              );
            })
          )}
          <p className="mt-[0.5em] text-[0.85em] text-white/70">
            Now: {inPoss === "unknown" ? "unknown" : inPoss === "team_a" ? teams.teamAName : teams.teamBName}
          </p>
        </div>
      )}

      {gap && (
        <div className="pointer-events-none absolute top-[3%] right-[2.5%] rounded-md bg-navy-950/80 px-2 py-1 text-xs text-white/85">
          No analyzed frame at this time
        </div>
      )}

      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-8 pb-2 text-white transition-opacity",
          playing && !menu ? "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" : "opacity-100"
        )}
      >
        <div className="relative">
          <input
            type="range"
            className="seek w-full cursor-pointer"
            min={0}
            max={duration || 0}
            step={0.01}
            value={time}
            aria-label="Seek"
            aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
            style={{ ["--pct" as string]: `${pct}%` }}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }}
          />
          {markers.map((m) => (
            <span
              key={m.eventId}
              className={clsx(
                "pointer-events-none absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full ring-1 ring-black/60",
                m.type === "goal" ? "bg-brand" : "bg-[#FFD400]"
              )}
              style={{ left: `${(m.timestampSeconds / (duration || 1)) * 100}%` }}
              title={`${m.type === "goal" ? "Possible goal" : "Estimated shot"} at ${formatClock(m.timestampSeconds)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex items-center gap-1 text-sm">
          <button onClick={toggle} className="rounded p-1.5 hover:bg-white/15" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
          <button onClick={() => step(-1)} className="rounded p-1.5 hover:bg-white/15" aria-label="Previous analyzed frame">
            <SkipBack className="size-4" />
          </button>
          <button onClick={() => step(1)} className="rounded p-1.5 hover:bg-white/15" aria-label="Next analyzed frame">
            <SkipForward className="size-4" />
          </button>
          <button onClick={() => setMuted((m) => !m)} className="rounded p-1.5 hover:bg-white/15" aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <span className="ml-1 text-xs tabular-nums">
            {formatClock(time)} / {formatClock(duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <label className="sr-only" htmlFor="speed">
              Playback speed
            </label>
            <select
              id="speed"
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRate(r);
                if (videoRef.current) videoRef.current.playbackRate = r;
              }}
              className="rounded bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s} className="text-ink">
                  {s}×
                </option>
              ))}
            </select>
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className={clsx("rounded p-1.5 hover:bg-white/15", menu && "bg-white/15")}
                aria-label="Overlay layers"
                aria-expanded={menu}
              >
                <Layers className="size-4" />
              </button>
              {menu && (
                <div className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-lg border border-line bg-card p-3 text-ink shadow-2xl">
                  <p className="mb-2 text-xs font-semibold text-ink-2">Video overlays</p>
                  {layerToggles.map(([k, label]) => (
                    <Switch key={k} label={label} checked={overlays[k]} onChange={(v) => onOverlaysChange({ ...overlays, [k]: v })} />
                  ))}
                </div>
              )}
            </div>
            <button onClick={toggleFullscreen} className="rounded p-1.5 hover:bg-white/15" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
