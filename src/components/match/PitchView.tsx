"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeGrid, frameAt, GRID_X, GRID_Y, teamShape, zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { PITCH_LENGTH, PITCH_WIDTH, pitchLineSegments } from "@/lib/analysis/pitch";
import type { AnalysisResult, BallObservation } from "@/lib/types";
import { hexToRgb, readableTextColor } from "@/lib/vision/color";

export type PitchTeam = "team_a" | "team_b" | "both";
export type PitchLayer = "occupancy" | "movement" | "distribution" | "zones";
export type PitchScope = "full" | "upto" | "window";

const SEGMENTS = pitchLineSegments();
const MARGIN = 4; // meters of run-off drawn around the pitch (room for the goals)
const ASPECT = (PITCH_LENGTH + MARGIN * 2) / (PITCH_WIDTH + MARGIN * 2);

// design tokens from globals.css (pitch, pitch-2, navy-950, hud); canvas cannot read CSS variables cheaply
const PITCH = "#1d8f55";
const PITCH_2 = "#1a834e";
const LINE = "rgba(255,255,255,0.92)";
const WHITE = "#ffffff";
const NAVY = "#07131d";
const HUD = "#ffd400";

function blurGrid(grid: number[][]): number[][] {
  const k = [
    [1, 4, 7, 4, 1],
    [4, 16, 26, 16, 4],
    [7, 26, 41, 26, 7],
    [4, 16, 26, 16, 4],
    [1, 4, 7, 4, 1],
  ];
  const rad = 2;

  const convolve = (src: number[][]) =>
    src.map((row, y) =>
      row.map((_, x) => {
        let s = 0;
        let w = 0;
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= GRID_Y || xx < 0 || xx >= GRID_X) continue;
            s += src[yy][xx] * k[dy + rad][dx + rad];
            w += k[dy + rad][dx + rad];
          }
        return s / w;
      })
    );

  let out = convolve(grid);
  out = convolve(out);
  out = convolve(out);
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? sorted[sorted.length - 1];
}

const mixRgb = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

/**
 * A single team's heat ramp, laid over the green pitch: a faint white-tinted haze of the team
 * colour where the team rarely was, the full team colour where it often was, deepening towards
 * navy at the very hottest cells. Opacity rises with the value so cold areas let the grass show.
 */
export function teamHeatColor(v: number, team: string): { r: number; g: number; b: number; a: number } {
  const t = Math.max(0, Math.min(1, v));
  const base = hexToRgb(team);
  const pale = mixRgb(base, hexToRgb(WHITE), 0.65);
  const deep = mixRgb(base, hexToRgb(NAVY), 0.3);
  const [r, g, b] = t < 0.7 ? mixRgb(pale, base, t / 0.7) : mixRgb(base, deep, (t - 0.7) / 0.3);
  return { r, g, b, a: Math.round((0.12 + t * 0.8) * 255) };
}

/** CSS gradient that matches teamHeatColor, for the legend next to the pitch. */
export function teamHeatLegend(team: string): string {
  const stops = [0, 0.35, 0.7, 1].map((t) => {
    const c = teamHeatColor(t, team);
    return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(2)}) ${t * 100}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function scopeRange(scope: PitchScope, t: number, duration: number): [number, number] {
  if (scope === "upto") return [0, t];
  if (scope === "window") return [t - 5, t + 5];
  return [0, duration + 1];
}

/** Letters drawn in the player dots so teams are told apart by more than colour. */
export function teamLetters(a: string, b: string): [string, string] {
  const la = a.trim().charAt(0).toUpperCase();
  const lb = b.trim().charAt(0).toUpperCase();
  return la && lb && la !== lb ? [la, lb] : ["A", "B"];
}

function geometry(cssW: number) {
  const s = cssW / (PITCH_LENGTH + MARGIN * 2);
  const P = (m: number) => (m + MARGIN) * s;
  return { s, P, cssH: cssW / ASPECT };
}

function prepareCanvas(c: HTMLCanvasElement, cssW: number) {
  const dpr = window.devicePixelRatio || 1;
  const cssH = cssW / ASPECT;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return ctx;
}

function fontFamily(el: Element) {
  return getComputedStyle(el).fontFamily || "system-ui, sans-serif";
}

export function PitchView({
  result,
  teamFrames,
  team,
  layer,
  scope,
  time,
  showLive = true,
  className,
}: {
  result: AnalysisResult;
  teamFrames: TeamFrame[];
  team: PitchTeam;
  layer: PitchLayer;
  scope: PitchScope;
  time: number;
  showLive?: boolean;
  className?: string;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // offscreen heat textures, cached per computed pixel buffer
  const heatCache = useRef(new WeakMap<Uint8ClampedArray, HTMLCanvasElement>());
  const [cssW, setCssW] = useState(0);
  const { teamAColor, teamBColor, teamAName, teamBName } = result.teams;
  const duration = result.video.durationSeconds;
  const homography = result.calibration.method === "homography";

  // Quantize time to half seconds so the range (and every heatmap derived from it) only changes
  // when it changes meaningfully, not on every ~11 Hz playback tick.
  const qTime = scope === "full" ? 0 : Math.round(time * 2) / 2;
  const range = useMemo(() => scopeRange(scope, qTime, duration), [scope, qTime, duration]);
  const teams = useMemo(() => (team === "both" ? (["team_a", "team_b"] as const) : ([team] as const)), [team]);

  const grids = useMemo(() => {
    if (layer !== "occupancy" && layer !== "movement") return null;
    return teams.map((tm) => ({ team: tm, ...computeGrid(teamFrames, tm, layer, range) }));
  }, [teamFrames, teams, layer, range]);

  // the expensive part of a heatmap (blur, percentile, colour ramp), recomputed only with its inputs
  const heat = useMemo(() => {
    if (!grids) return null;
    return grids
      .filter((g) => g.total > 0)
      .map((g) => {
        const bl = blurGrid(g.grid);
        const norm = Math.max(1e-9, percentile(bl.flat(), 0.92));
        const color = g.team === "team_a" ? teamAColor : teamBColor;
        const data = new Uint8ClampedArray(GRID_X * GRID_Y * 4);
        for (let y = 0; y < GRID_Y; y++)
          for (let x = 0; x < GRID_X; x++) {
            const raw = bl[y][x] / norm;
            const c = teamHeatColor(Math.pow(raw, 0.55), color);
            const i = (y * GRID_X + x) * 4;
            data[i] = c.r;
            data[i + 1] = c.g;
            data[i + 2] = c.b;
            data[i + 3] = raw > 0.02 ? c.a : 0;
          }
        return { team: g.team, data };
      });
  }, [grids, teamAColor, teamBColor]);

  const zones = useMemo(() => {
    if (layer !== "zones") return null;
    return teams.map((tm) => ({ team: tm, ...zoneShares(teamFrames, tm, range) }));
  }, [teamFrames, teams, layer, range]);

  const interval = 1 / result.coverage.sampleFps;
  const live = frameAt(teamFrames, time, interval * 1.5);
  // a snapshot further than half a sample from the playhead is held across a gap: an estimate
  const liveHeld = live ? Math.abs(live.t - time) > interval * 0.55 : false;
  const liveBall: BallObservation | undefined = useMemo(() => {
    if (!homography) return undefined;
    return result.ball.find((b) => Math.abs(b.timestampSeconds - time) <= interval * 0.75 && b.pitchX !== undefined);
  }, [result.ball, homography, time, interval]);

  // track the container width once; both layers redraw from it
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      setCssW((cur) => (cur === w ? cur : w));
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Base layer: grass, heatmap or zones, pitch lines, estimated shot paths. Not tied to the playhead.
  useEffect(() => {
    const c = baseRef.current;
    if (!c || cssW <= 0) return;
    const ctx = prepareCanvas(c, cssW);
    if (!ctx) return;
    const { s, P, cssH } = geometry(cssW);
    const family = fontFamily(c);

    // mown grass, run-off included, with a soft vignette like a broadcast pitch graphic
    ctx.fillStyle = PITCH;
    ctx.fillRect(0, 0, cssW, cssH);
    const stripes = 12;
    const sw = PITCH_LENGTH / stripes;
    ctx.fillStyle = PITCH_2;
    for (let i = 1; i < stripes; i += 2) ctx.fillRect(P(i * sw), 0, sw * s, cssH);
    const vignette = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.2, cssW / 2, cssH / 2, cssW * 0.62);
    vignette.addColorStop(0, "rgba(255,255,255,0.05)");
    vignette.addColorStop(1, "rgba(7,19,29,0.16)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cssW, cssH);

    // heatmap: one texture per team, upscaled smoothly onto the pitch
    if (heat) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (const h of heat) {
        let off = heatCache.current.get(h.data);
        if (!off) {
          off = document.createElement("canvas");
          off.width = GRID_X;
          off.height = GRID_Y;
          off.getContext("2d")?.putImageData(new ImageData(h.data, GRID_X, GRID_Y), 0, 0);
          heatCache.current.set(h.data, off);
        }
        ctx.drawImage(off, P(0), P(0), PITCH_LENGTH * s, PITCH_WIDTH * s);
      }
      ctx.restore();
    }

    // zones: shares per ninth; with both teams, Team A's value sits left and Team B's right
    if (zones) {
      const zw = PITCH_LENGTH / 3;
      const zh = PITCH_WIDTH / 3;
      const fs = Math.max(11, Math.round(s * 3.2));
      ctx.font = `700 ${fs}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let zy = 0; zy < 3; zy++)
        for (let zx = 0; zx < 3; zx++) {
          const x0 = P(zx * zw);
          const y0 = P(zy * zh);
          if (zones.length === 1) {
            const v = zones[0].zones[zy][zx];
            const [r, g, b] = hexToRgb(zones[0].team === "team_a" ? teamAColor : teamBColor);
            ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(0.85, 0.15 + v * 2.2)})`;
            ctx.fillRect(x0, y0, zw * s, zh * s);
          }
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x0, y0, zw * s, zh * s);
          ctx.setLineDash([]);
          zones.forEach((z, k) => {
            const v = z.total > 0 ? z.zones[zy][zx] : null;
            const color = z.team === "team_a" ? teamAColor : teamBColor;
            const text = v === null ? "–" : `${Math.round(v * 100)}%`;
            const cx = x0 + (zw * s) / 2 + (zones.length > 1 ? (k === 0 ? -1 : 1) * (zw * s) * 0.22 : 0);
            const cy = y0 + (zh * s) / 2;
            const tw = ctx.measureText(text).width + fs * 0.7;
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2, cy - fs * 0.65, tw, fs * 1.3, fs * 0.65);
            ctx.fillStyle = color;
            ctx.shadowColor = "rgba(7,19,29,0.35)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1;
            ctx.fill();
            ctx.shadowColor = "transparent";
            ctx.strokeStyle = WHITE;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = readableTextColor(color);
            ctx.fillText(text, cx, cy + 1);
          });
        }
    }

    // pitch lines
    ctx.strokeStyle = LINE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.25, s * 0.24);
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of SEGMENTS) {
      ctx.moveTo(P(x1), P(y1));
      ctx.lineTo(P(x2), P(y2));
    }
    ctx.stroke();
    ctx.fillStyle = LINE;
    for (const [cx, cy] of [
      [PITCH_LENGTH / 2, PITCH_WIDTH / 2],
      [11, PITCH_WIDTH / 2],
      [PITCH_LENGTH - 11, PITCH_WIDTH / 2],
    ]) {
      ctx.beginPath();
      ctx.arc(P(cx), P(cy), Math.max(1.5, s * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    // goals
    ctx.lineWidth = Math.max(1.25, s * 0.24);
    ctx.strokeRect(P(-1.6), P(PITCH_WIDTH / 2 - 3.66), 1.6 * s, 7.32 * s);
    ctx.strokeRect(P(PITCH_LENGTH), P(PITCH_WIDTH / 2 - 3.66), 1.6 * s, 7.32 * s);

    // estimated shot paths (calibrated only): dashed in the ball's HUD yellow, because they are estimates
    if (homography) {
      ctx.strokeStyle = HUD;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const e of result.events) {
        if (e.type !== "shot" || !e.trajectory) continue;
        if (scope !== "full" && (e.timestampSeconds < range[0] || e.timestampSeconds > range[1])) continue;
        const pts = e.trajectory.filter((p) => p.pitchX !== undefined && p.pitchY !== undefined);
        if (pts.length < 2) continue;
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(P(p.pitchX!), P(p.pitchY!)) : ctx.moveTo(P(p.pitchX!), P(p.pitchY!))));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [cssW, heat, zones, teamAColor, teamBColor, homography, result.events, scope, range]);

  // Live layer: player dots, ball and team shape at the playhead. Cheap; redrawn every tick.
  useEffect(() => {
    const c = liveRef.current;
    if (!c || cssW <= 0) return;
    const ctx = prepareCanvas(c, cssW);
    if (!ctx) return;
    const { s, P } = geometry(cssW);
    if (!live) return;
    const family = fontFamily(c);
    const dash = liveHeld ? [3, 2.5] : [];
    const letters = teamLetters(teamAName, teamBName);

    // team shape: hull and centroid of visible players
    if (layer === "distribution") {
      for (const tm of teams) {
        const shape = teamShape(live[tm]);
        if (!shape || shape.hull.length < 3) continue;
        const color = tm === "team_a" ? teamAColor : teamBColor;
        const [r, g, b] = hexToRgb(color);
        ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.setLineDash(dash);
        ctx.beginPath();
        shape.hull.forEach((p, i) => (i ? ctx.lineTo(P(p.x), P(p.y)) : ctx.moveTo(P(p.x), P(p.y))));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = P(shape.centroid.x);
        const cy = P(shape.centroid.y);
        ctx.lineCap = "round";
        for (const [w, col] of [
          [4.5, WHITE],
          [2, NAVY],
        ] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy - 5);
          ctx.lineTo(cx + 5, cy + 5);
          ctx.moveTo(cx + 5, cy - 5);
          ctx.lineTo(cx - 5, cy + 5);
          ctx.stroke();
        }
      }
    }

    if (!(showLive || layer === "distribution")) return;

    // players: team-colour dots with a white rim and a soft drop shadow, the team letter inside;
    // the rim is dashed when the position is held from the nearest analyzed frame (an estimate)
    const r = Math.max(6.5, s * 1.25);
    ctx.font = `700 ${Math.round(r * 1.05)}px ${family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const tm of teams) {
      const color = tm === "team_a" ? teamAColor : teamBColor;
      const letter = tm === "team_a" ? letters[0] : letters[1];
      const text = readableTextColor(color);
      for (const p of live[tm]) {
        const x = P(p.x);
        const y = P(p.y);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = "rgba(7,19,29,0.45)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = text;
        ctx.fillText(letter, x, y + 0.5);
      }
    }

    if (liveBall && liveBall.pitchX !== undefined && liveBall.pitchY !== undefined) {
      const bx = P(liveBall.pitchX);
      const by = P(liveBall.pitchY);
      const br = Math.max(3.5, s * 0.75);
      // a soft HUD glow so the ball reads at a glance, as in the broadcast overlays
      ctx.beginPath();
      ctx.arc(bx, by, br * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,212,0,0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = HUD;
      ctx.fill();
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(liveBall.confidence < 0.5 ? [2, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [cssW, live, liveHeld, liveBall, layer, teams, teamAColor, teamBColor, teamAName, teamBName, showLive]);

  const teamLabel = team === "both" ? `${teamAName} and ${teamBName}` : team === "team_a" ? teamAName : teamBName;
  const liveCounts = live ? teams.map((tm) => `${tm === "team_a" ? teamAName : teamBName}: ${live[tm].length} visible`).join(", ") : "no analyzed frame at this time";
  const layerName = { occupancy: "occupancy heatmap", movement: "movement heatmap", distribution: "team shape", zones: "zone shares" }[layer];
  return (
    <div ref={wrapRef} className={className}>
      <div className="relative w-full overflow-hidden rounded-lg bg-pitch ring-1 ring-navy-950/10" style={{ aspectRatio: `${ASPECT}` }}>
        <canvas
          ref={baseRef}
          className="absolute inset-0 block size-full"
          role="img"
          aria-label={`Pitch showing the ${layerName} for ${teamLabel}. Live positions: ${liveCounts}${liveHeld ? " (held from the nearest analyzed frame)" : ""}.`}
        />
        <canvas ref={liveRef} className="pointer-events-none absolute inset-0 block size-full" aria-hidden />
      </div>
    </div>
  );
}
