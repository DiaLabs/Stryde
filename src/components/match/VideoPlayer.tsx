"use client";

import clsx from "clsx";
import { Check, Gauge, Keyboard, Layers, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { ViewTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Magnet } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import { nearestSample, possessionAt, type RenderIndex } from "@/lib/render";
import { drawOverlay } from "@/lib/render/overlay";
import type { AnalysisResult, MatchEvent, OverlayOptions } from "@/lib/types";
import { usePlaybackControls, usePlaybackTime } from "./playback";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
/** how often the clock is published to panels while playing */
const PUBLISH_MS = 90;

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

const LAYER_GROUPS: { title: string; items: [keyof OverlayOptions, string][] }[] = [
  {
    title: "Players",
    items: [
      ["showPlayerBoxes", "Boxes"],
      ["showTeamLabels", "Labels"],
      ["showPossessionHighlight", "Ball carrier"],
      ["showTrails", "Trails"],
      ["showConfidence", "Confidence"],
    ],
  },
  {
    title: "Ball and moments",
    items: [
      ["showBall", "Ball"],
      ["showShotEvents", "Shots"],
      ["showGoalEvents", "Possible goals"],
    ],
  },
  {
    title: "Panels",
    items: [
      ["showScorebug", "Scorebug"],
      ["showPossessionPanel", "Possession"],
    ],
  },
];

const ALL_OFF = Object.fromEntries(Object.keys(DEFAULT_OVERLAYS).map((k) => [k, false])) as unknown as OverlayOptions;
const ALL_ON = Object.fromEntries(Object.keys(DEFAULT_OVERLAYS).map((k) => [k, true])) as unknown as OverlayOptions;
const PRESETS: { id: string; label: string; hint: string; value: OverlayOptions }[] = [
  { id: "clean", label: "Clean", hint: "Just the footage and scorebug", value: { ...ALL_OFF, showScorebug: true } },
  { id: "tracking", label: "Tracking", hint: "Players, ball and possession", value: DEFAULT_OVERLAYS },
  { id: "full", label: "Full", hint: "Everything, including trails and confidence", value: ALL_ON },
];
const sameOverlays = (a: OverlayOptions, b: OverlayOptions) => (Object.keys(a) as (keyof OverlayOptions)[]).every((k) => a[k] === b[k]);

const SHORTCUTS: [string, string][] = [
  ["Space or K", "Play or pause"],
  ["← / →", "Back or forward 5 s"],
  ["J / L", "Back or forward 10 s"],
  [", / .", "Previous or next analyzed frame"],
  ["F or double-click", "Fullscreen"],
  ["M", "Sound on or off"],
  ["?", "Show these shortcuts"],
];

type Teams = AnalysisResult["teams"];

export function VideoPlayer({
  src,
  result,
  index,
  overlays,
  onOverlaysChange,
  transitionName,
}: {
  src: string;
  result: AnalysisResult;
  index: RenderIndex;
  overlays: OverlayOptions;
  onOverlaysChange: (o: OverlayOptions) => void;
  /** view-transition name for the picture, shared with the match list thumbnail */
  transitionName?: string;
}) {
  // Controls only: this component does not re-render on clock ticks. Children that show the
  // time subscribe on their own.
  const { videoRef, setTime } = usePlaybackControls();
  const frameRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(result.video.durationSeconds);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [gap, setGap] = useState(false);
  // in fullscreen, controls hide while playing and the pointer is still
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }, []);
  const lastPublished = useRef(0);
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);
  const aspect = result.video.width / result.video.height;
  const teams = result.teams;
  const hintId = useId();

  /** Publish the exact time now (pause, seek, end): never leave panels on a stale sample. */
  const publish = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    lastPublished.current = performance.now();
    setTime(v.currentTime);
  }, [setTime, videoRef]);

  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const box = pictureRef.current;
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
    if (now - lastPublished.current > PUBLISH_MS) {
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
  }, [overlays, draw]);

  useEffect(() => {
    const box = pictureRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    const onFs = () => setFullscreen(document.fullscreenElement === frameRef.current);
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

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const max = Number.isFinite(v.duration) ? v.duration : duration;
      v.currentTime = Math.max(0, Math.min(max, t));
      publish();
    },
    [duration, publish, videoRef]
  );

  const seekBy = useCallback((d: number) => seekTo((videoRef.current?.currentTime ?? 0) + d), [seekTo, videoRef]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      const { i } = nearestSample(index, v.currentTime);
      const j = Math.max(0, Math.min(index.times.length - 1, i + dir));
      if (index.times[j] !== undefined) seekTo(index.times[j]);
    },
    [index, seekTo, videoRef]
  );

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.requestFullscreen?.();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    // the layers menu and the speed picker keep their own keys
    if (target.closest("[data-player-popover], select, textarea, input:not(.seek)")) return;
    const onButton = !!target.closest("button");
    const onSeek = target.matches("input.seek");
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    switch (key) {
      case " ":
        if (onButton) return; // buttons activate on Space themselves
        toggle();
        break;
      case "k":
        toggle();
        break;
      case "j":
        seekBy(-10);
        break;
      case "l":
        seekBy(10);
        break;
      case "ArrowLeft":
        seekBy(-5);
        break;
      case "ArrowRight":
        seekBy(5);
        break;
      case "ArrowDown":
        if (!onSeek) return; // let the page scroll
        seekBy(-5);
        break;
      case "ArrowUp":
        if (!onSeek) return;
        seekBy(5);
        break;
      case "PageDown":
        if (!onSeek) return;
        seekBy(-10);
        break;
      case "PageUp":
        if (!onSeek) return;
        seekBy(10);
        break;
      case "Home":
        if (!onSeek) return;
        seekTo(0);
        break;
      case "End":
        if (!onSeek) return;
        seekTo(duration);
        break;
      case ",":
        step(-1);
        break;
      case ".":
        step(1);
        break;
      case "f":
        toggleFullscreen();
        break;
      case "m":
        setMuted((m) => !m);
        break;
      case "?": {
        const el = shortcutsRef.current;
        if (el) el.togglePopover();
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  const markers = useMemo(() => result.events.filter((e) => e.type === "shot" || e.type === "goal"), [result.events]);

  const picture = (
    <div
      ref={pictureRef}
      className={clsx("relative w-full overflow-hidden bg-black", fullscreen ? "min-h-0 flex-1" : "max-h-[75svh]")}
      style={fullscreen ? undefined : { aspectRatio: `${aspect}` }}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted={muted}
        preload="auto"
        className="absolute inset-0 size-full cursor-pointer object-contain"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          publish();
          draw();
        }}
        onEnded={() => {
          setPlaying(false);
          publish();
        }}
        onSeeked={() => {
          publish();
          draw();
        }}
        onTimeUpdate={() => {
          if (!playing) {
            publish();
            draw();
          }
        }}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = rate;
          publish();
          draw();
        }}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      {overlays.showScorebug && <Scorebug index={index} teams={teams} showPossession={overlays.showPossessionHighlight} />}
      {overlays.showPossessionPanel && <PossessionShare index={index} teams={teams} />}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-navy-950/70 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/20 backdrop-blur-sm transition-transform hover:scale-105 hover:bg-navy-950/85 sm:size-16"
        >
          <Play className="ml-1 size-6 fill-current sm:size-7" aria-hidden />
        </button>
      )}
      {gap && (
        <p className="pointer-events-none absolute top-2.5 right-2.5 rounded-md bg-navy-950/85 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
          No analyzed frame at this moment
        </p>
      )}
    </div>
  );

  return (
    <div
      ref={frameRef}
      tabIndex={0}
      role="group"
      aria-label="Annotated match video"
      aria-describedby={hintId}
      onKeyDown={onKey}
      onPointerMove={fullscreen ? wake : undefined}
      className={clsx(
        "flex w-full min-w-0 flex-col overflow-hidden bg-navy-950 text-white select-none",
        fullscreen && playing && idle && "cursor-none",
        fullscreen ? "h-full" : "rounded-xl border border-navy-800 shadow-[var(--shadow-card)]"
      )}
    >
      <p id={hintId} className="sr-only">
        Space or K plays and pauses. Left and right arrows seek 5 seconds, J and L seek 10 seconds. Comma and period step between analyzed frames. F
        toggles fullscreen, M toggles sound.
      </p>
      {transitionName ? (
        <ViewTransition name={transitionName} share="auto" default="none">
          {picture}
        </ViewTransition>
      ) : (
        picture
      )}

      <div
        className={clsx(
          "border-t border-white/[0.06] px-2 pt-1.5 pb-2 transition-opacity duration-300 sm:px-3",
          fullscreen && playing && idle && "pointer-events-none opacity-0"
        )}
      >
        <SeekBar duration={duration} markers={markers} onSeek={seekTo} index={index} teams={teams} />
        <div className="flex flex-wrap items-center gap-0.5 text-sm sm:gap-1">
          <IconButton onClick={toggle} label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
          </IconButton>
          <IconButton onClick={() => step(-1)} label="Previous analyzed frame">
            <SkipBack className="size-4" aria-hidden />
          </IconButton>
          <IconButton onClick={() => step(1)} label="Next analyzed frame">
            <SkipForward className="size-4" aria-hidden />
          </IconButton>
          <IconButton onClick={() => setMuted((m) => !m)} label={muted ? "Turn sound on" : "Turn sound off"} className="hidden min-[400px]:grid">
            {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </IconButton>
          <Clock duration={duration} />
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <PlayerPopover
              title="Playback speed"
              width={180}
              button={
                <>
                  <Gauge className="size-4 sm:hidden" aria-hidden />
                  <span className="font-hud hidden text-[15px] sm:inline">{rate}×</span>
                </>
              }
            >
              <div className="grid gap-0.5" role="radiogroup" aria-label="Playback speed">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    role="radio"
                    aria-checked={rate === sp}
                    onClick={() => {
                      setRate(sp);
                      if (videoRef.current) videoRef.current.playbackRate = sp;
                    }}
                    className={clsx(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                      rate === sp ? "bg-brand-soft font-semibold text-ok" : "text-ink hover:bg-page"
                    )}
                  >
                    {sp === 1 ? "Normal" : `${sp}×`}
                    {rate === sp && <Check className="size-4" aria-hidden />}
                  </button>
                ))}
              </div>
            </PlayerPopover>
            <LayersMenu overlays={overlays} onChange={onOverlaysChange} />
            <PlayerPopover
              title="Keyboard shortcuts"
              width={300}
              popoverRef={shortcutsRef}
              className="hidden md:flex"
              button={<Keyboard className="size-4" aria-hidden />}
            >
              <dl className="grid gap-1.5 text-[13px]">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <dt className="text-ink-2">{v}</dt>
                    <dd className="font-hud rounded-md bg-page px-1.5 py-0.5 text-[13px] font-semibold text-ink ring-1 ring-line ring-inset">{k}</dd>
                  </div>
                ))}
              </dl>
            </PlayerPopover>
            <IconButton onClick={toggleFullscreen} label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {fullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({ onClick, label, children, className }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx("grid size-8 shrink-0 place-items-center rounded-md sm:size-9 text-white/90 transition-colors hover:bg-white/10 hover:text-white", className)}
    >
      {children}
    </button>
  );
}

function Clock({ duration }: { duration: number }) {
  const time = usePlaybackTime();
  return (
    <span className="font-hud ml-1.5 text-[15px] font-semibold whitespace-nowrap text-white sm:ml-2" aria-hidden>
      {formatClock(time)} <span className="font-medium text-white/50">/ {formatClock(duration)}</span>
    </span>
  );
}

function SeekBar({
  duration,
  markers,
  onSeek,
  index,
  teams,
}: {
  duration: number;
  markers: MatchEvent[];
  onSeek: (t: number) => void;
  index: RenderIndex;
  teams: Teams;
}) {
  const time = usePlaybackTime();
  const max = duration || 0;
  const value = Math.min(time, max);
  const pct = max ? (value / max) * 100 : 0;
  const [hover, setHover] = useState<{ x: number; w: number; t: number } | null>(null);

  // contiguous possession spells, drawn as a thin strip under the bar
  const spells = useMemo(() => {
    const out: { from: number; to: number; team: "team_a" | "team_b" }[] = [];
    const ps = index.possession;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.teamId !== "team_a" && p.teamId !== "team_b") continue;
      const to = ps[i + 1]?.timestampSeconds ?? p.timestampSeconds + 0.2;
      const last = out[out.length - 1];
      if (last && last.team === p.teamId && Math.abs(last.to - p.timestampSeconds) < 0.5) last.to = to;
      else out.push({ from: p.timestampSeconds, to, team: p.teamId });
    }
    return out;
  }, [index.possession]);

  const hoverTeam = hover ? possessionAt(index, hover.t).sample?.teamId : undefined;
  const hoverName = hoverTeam === "team_a" ? teams.teamAName : hoverTeam === "team_b" ? teams.teamBName : null;

  return (
    <div
      className="group relative pt-1"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
        setHover({ x, w: r.width, t: max ? (x / r.width) * max : 0 });
      }}
      onPointerLeave={() => setHover(null)}
    >
      {hover && max > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-navy-950/95 px-2 py-1 text-center text-[11px] whitespace-nowrap text-white shadow-lg ring-1 ring-white/10"
          style={{ left: Math.max(40, Math.min(hover.x, hover.w - 40)) }}
          aria-hidden
        >
          <span className="font-hud text-[13px] font-semibold">{formatClock(hover.t)}</span>
          {hoverName && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-white/75">
              <Magnet color={hoverTeam === "team_a" ? teams.teamAColor : teams.teamBColor} size={7} />
              {hoverName} on the ball
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        className="seek block w-full"
        min={0}
        max={max}
        step={0.1}
        value={value}
        aria-label="Seek"
        aria-valuetext={`${formatClock(value)} of ${formatClock(max)}`}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      {markers.map((m) => (
        <span
          key={m.eventId}
          aria-hidden
          className={clsx("pointer-events-none absolute top-[11px] size-2 -translate-x-1/2 rounded-full ring-2 ring-navy-950", m.type === "goal" ? "bg-white" : "bg-hud")}
          style={{ left: `${(m.timestampSeconds / (max || 1)) * 100}%` }}
        />
      ))}
      {/* who had the ball, along the clip */}
      <div className="pointer-events-none relative mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
        {max > 0 &&
          spells.map((sp, i) => (
            <span
              key={i}
              className="absolute inset-y-0"
              style={{
                left: `${(sp.from / max) * 100}%`,
                width: `${(Math.max(0.1, sp.to - sp.from) / max) * 100}%`,
                background: sp.team === "team_a" ? teams.teamAColor : teams.teamBColor,
                // a light edge keeps dark kits visible on the dark control bar
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
              }}
            />
          ))}
      </div>
    </div>
  );
}

const DROP = new Set(["fc", "cf", "afc", "sc", "ac", "the", "club", "de"]);

/** Broadcast-style short name: "Riverside FC" → RIV, "Team A" → TEAM A. */
function abbreviate(name: string): string {
  const n = name.trim();
  if (n.length <= 6) return n.toUpperCase();
  const words = n.split(/\s+/).filter((w) => !DROP.has(w.toLowerCase()));
  return (words[0] ?? n).slice(0, 3).toUpperCase();
}

/**
 * Broadcast scorebug, top left: each team's short name on a white plate with a colour strip,
 * then the clock on navy. The team estimated to have the ball gets a HUD-yellow underline.
 */
function Scorebug({ index, teams, showPossession }: { index: RenderIndex; teams: Teams; showPossession: boolean }) {
  const time = usePlaybackTime();
  const inPoss = showPossession ? (possessionAt(index, time).sample?.teamId ?? "unknown") : "unknown";
  const plate = (tm: "team_a" | "team_b") => {
    const color = tm === "team_a" ? teams.teamAColor : teams.teamBColor;
    return (
      <span className="relative flex items-stretch bg-white text-navy-950">
        <span className="team-fill w-[0.32em]" style={{ background: color }} />
        <span className="px-[0.5em] py-[0.12em] tracking-wide">{abbreviate(tm === "team_a" ? teams.teamAName : teams.teamBName)}</span>
        {inPoss === tm && <span className="absolute inset-x-0 bottom-0 h-[0.16em] bg-hud" />}
      </span>
    );
  };
  return (
    <div
      aria-hidden
      className="font-hud pointer-events-none absolute top-2 left-2 flex items-stretch overflow-hidden rounded-md text-[clamp(12px,1.45vw,17px)] leading-none font-bold shadow-[0_2px_8px_rgba(0,0,0,0.35)] sm:top-3 sm:left-3"
    >
      {plate("team_a")}
      <span className="w-px bg-navy-950/20" />
      {plate("team_b")}
      <span className="flex items-center bg-navy-950/90 px-[0.55em] text-white">{formatClock(time)}</span>
    </div>
  );
}

/** Running possession share up to now, as a translucent navy broadcast panel. Estimated, so hatched. */
function PossessionShare({ index, teams }: { index: RenderIndex; teams: Teams }) {
  const time = usePlaybackTime();
  const poss = possessionAt(index, time);
  const total = poss.a + poss.b;
  const pctA = total > 0 ? (poss.a / total) * 100 : null;
  const inPoss = poss.sample?.teamId ?? "unknown";
  const hatch = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 4px, color-mix(in srgb, ${c} 60%, transparent) 4px 7px)`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-3 bottom-3 hidden w-[clamp(170px,27%,250px)] rounded-lg border border-white/10 bg-navy-950/80 px-3 py-2.5 text-[clamp(11px,1.05vw,13px)] text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-sm sm:block"
    >
      <p className="font-hud text-[1.15em] font-bold tracking-[0.06em] text-white uppercase">
        Possession <span className="text-[0.8em] font-medium tracking-normal text-white/55 normal-case">est.</span>
      </p>
      {pctA === null ? (
        <p className="mt-1 text-white/70">Not enough evidence yet</p>
      ) : (
        (["team_a", "team_b"] as const).map((tm) => {
          const p = tm === "team_a" ? pctA : 100 - pctA;
          const color = tm === "team_a" ? teams.teamAColor : teams.teamBColor;
          return (
            <div key={tm} className="mt-1.5 grid grid-cols-[4.5em_1fr_2.6em] items-center gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Magnet color={color} size={8} />
                <span className={clsx("truncate", inPoss === tm ? "font-semibold text-white" : "text-white/80")}>
                  {tm === "team_a" ? teams.teamAName : teams.teamBName}
                </span>
              </span>
              <span className="h-[0.7em] overflow-hidden rounded-sm bg-white/15">
                <span className="team-fill block h-full rounded-sm" style={{ width: `${p}%`, background: hatch(color) }} />
              </span>
              <span className="font-hud text-right text-[1.2em] font-bold">{p.toFixed(0)}%</span>
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * A control-bar button with a native popover: it renders in the top layer, so no ancestor (the
 * video frame, a scroll container, fullscreen) can clip it. Escape and clicking outside close it
 * and focus returns to the button.
 */
function PlayerPopover({
  title,
  button,
  children,
  width = 300,
  popoverRef,
  className,
}: {
  title: string;
  button: ReactNode;
  children: ReactNode;
  width?: number;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const id = useId();
  const titleId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // share the element with a parent (e.g. to open the shortcuts popover from a key press)
  const setMenu = useCallback(
    (el: HTMLDivElement | null) => {
      menuRef.current = el;
      if (popoverRef) popoverRef.current = el;
    },
    [popoverRef]
  );
  const [open, setOpen] = useState(false);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const above = r.top - 16;
    const below = vh - r.bottom - 16;
    const s = menu.style;
    s.width = `${w}px`;
    s.left = `${left}px`;
    s.right = "auto";
    if (above >= 240 || above >= below) {
      s.top = "auto";
      s.bottom = `${vh - r.top + 8}px`;
      s.maxHeight = `${Math.max(160, above)}px`;
    } else {
      s.bottom = "auto";
      s.top = `${r.bottom + 8}px`;
      s.maxHeight = `${Math.max(160, below)}px`;
    }
  }, [width]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-label={title}
        onClick={place}
        title={title}
        className={clsx(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white sm:h-9",
          open && "bg-white/10 text-white",
          className
        )}
      >
        {button}
      </button>
      <div
        ref={setMenu}
        id={id}
        popover="auto"
        data-player-popover
        role="dialog"
        aria-labelledby={titleId}
        onToggle={(e) => {
          const isOpen = e.newState === "open";
          setOpen(isOpen);
          if (isOpen) {
            place();
            menuRef.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
          }
        }}
        className="fixed m-0 overflow-y-auto rounded-xl border border-line bg-card p-3.5 text-ink shadow-[var(--shadow-pop)]"
      >
        <p id={titleId} className="mb-2.5 text-[13px] font-semibold text-ink">
          {title}
        </p>
        {children}
      </div>
    </>
  );
}

/** Overlay layers: one-click presets, then compact toggles grouped by what they draw. */
function LayersMenu({ overlays, onChange }: { overlays: OverlayOptions; onChange: (o: OverlayOptions) => void }) {
  const active = PRESETS.find((p) => sameOverlays(p.value, overlays));
  return (
    <PlayerPopover
      title="Video layers"
      width={320}
      button={
        <>
          <Layers className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Layers</span>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-page p-1 ring-1 ring-line-soft ring-inset" role="radiogroup" aria-label="Layer presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active?.id === p.id}
            title={p.hint}
            onClick={() => onChange(p.value)}
            className={clsx(
              "rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors",
              active?.id === p.id ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:text-ink"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-2">{active ? active.hint : "Custom selection"}. Dashed lines are estimates.</p>
      <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
        {LAYER_GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-1.5 text-[11px] font-semibold text-ink-2">{g.title}</legend>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map(([k, label]) => {
                const on = overlays[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...overlays, [k]: !on })}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      on ? "border-brand/40 bg-brand-soft text-ok" : "border-line text-ink-2 hover:border-[#cfd6db] hover:text-ink"
                    )}
                  >
                    {on && <Check className="size-3" aria-hidden />}
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </PlayerPopover>
  );
}
