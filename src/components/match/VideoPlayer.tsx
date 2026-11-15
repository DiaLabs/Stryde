"use client";

import clsx from "clsx";
import { Layers, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { ViewTransition, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Magnet, Switch } from "@/components/ui/primitives";
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

const LAYERS: [keyof OverlayOptions, string][] = [
  ["showScorebug", "Team names and clock"],
  ["showPlayerBoxes", "Player boxes"],
  ["showTeamLabels", "Player labels"],
  ["showPossessionHighlight", "Ring on the player nearest the ball"],
  ["showPossessionPanel", "Possession share"],
  ["showBall", "Ball"],
  ["showTrails", "Movement trails"],
  ["showShotEvents", "Shot paths"],
  ["showGoalEvents", "Possible goals"],
  ["showConfidence", "Detection confidence"],
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
  const lastPublished = useRef(0);
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);
  const aspect = result.video.width / result.video.height;
  const teams = result.teams;
  const speedId = useId();
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
    if (target.closest("[data-layers-menu], select, textarea, input:not(.seek)")) return;
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
        className="absolute inset-0 size-full object-contain"
        onClick={toggle}
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
      className={clsx(
        "flex w-full min-w-0 flex-col overflow-hidden bg-navy-950 text-white select-none",
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

      <div className="border-t border-white/[0.06] px-2 pt-1.5 pb-2 sm:px-3">
        <SeekBar duration={duration} markers={markers} onSeek={seekTo} />
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
            <label className="sr-only" htmlFor={speedId}>
              Playback speed
            </label>
            <select
              id={speedId}
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRate(r);
                if (videoRef.current) videoRef.current.playbackRate = r;
              }}
              className="font-hud h-8 cursor-pointer rounded-md border-0 bg-transparent px-1.5 text-[15px] font-semibold text-white/90 hover:bg-white/10 hover:text-white"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s} className="bg-card font-sans text-ink">
                  {s}×
                </option>
              ))}
            </select>
            <LayersMenu overlays={overlays} onChange={onOverlaysChange} />
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

function SeekBar({ duration, markers, onSeek }: { duration: number; markers: MatchEvent[]; onSeek: (t: number) => void }) {
  const time = usePlaybackTime();
  const max = duration || 0;
  const value = Math.min(time, max);
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div className="relative">
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
          className={clsx("pointer-events-none absolute top-[7px] size-2 -translate-x-1/2 rounded-full ring-2 ring-navy-950", m.type === "goal" ? "bg-white" : "bg-hud")}
          style={{ left: `${(m.timestampSeconds / (max || 1)) * 100}%` }}
        />
      ))}
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
 * Overlay layers in a native popover: it renders in the top layer, so no ancestor (the video
 * frame, a scroll container, fullscreen) can clip it. Escape and clicking outside close it and
 * focus returns to the button.
 */
function LayersMenu({ overlays, onChange }: { overlays: OverlayOptions; onChange: (o: OverlayOptions) => void }) {
  const id = useId();
  const titleId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(288, vw - 16);
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    const above = r.top - 16;
    const below = vh - r.bottom - 16;
    const s = menu.style;
    s.width = `${width}px`;
    s.left = `${left}px`;
    s.right = "auto";
    if (above >= 320 || above >= below) {
      s.top = "auto";
      s.bottom = `${vh - r.top + 8}px`;
      s.maxHeight = `${Math.max(160, above)}px`;
    } else {
      s.bottom = "auto";
      s.top = `${r.bottom + 8}px`;
      s.maxHeight = `${Math.max(160, below)}px`;
    }
  }, []);

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
        onClick={place}
        title="Layers"
        className={clsx(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] sm:h-9 font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white",
          open && "bg-white/10 text-white"
        )}
      >
        <Layers className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">Layers</span>
      </button>
      <div
        ref={menuRef}
        id={id}
        popover="auto"
        data-layers-menu
        role="group"
        aria-labelledby={titleId}
        onToggle={(e) => {
          const isOpen = e.newState === "open";
          setOpen(isOpen);
          if (isOpen) {
            place();
            menuRef.current?.querySelector<HTMLElement>("[role=switch]")?.focus();
          }
        }}
        className="fixed m-0 overflow-y-auto rounded-xl border border-line bg-card p-4 text-ink shadow-[var(--shadow-pop)]"
      >
        <p id={titleId} className="text-[15px] font-semibold">
          Video layers
        </p>
        <p className="mt-0.5 mb-2.5 text-[13px] leading-snug text-ink-2">Solid lines are measured. Dashed lines are estimated.</p>
        <div className="border-t border-line-soft pt-1.5">
          {LAYERS.map(([k, label]) => (
            <Switch key={k} label={label} checked={overlays[k]} onChange={(v) => onChange({ ...overlays, [k]: v })} />
          ))}
        </div>
      </div>
    </>
  );
}
