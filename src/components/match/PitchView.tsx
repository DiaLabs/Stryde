"use client";

import { useEffect, useMemo, useRef } from "react";
import { computeGrid, frameAt, GRID_X, GRID_Y, teamShape, zoneShares, type TeamFrame } from "@/lib/analysis/analytics";
import { PITCH_LENGTH, PITCH_WIDTH, pitchLineSegments } from "@/lib/analysis/pitch";
import type { AnalysisResult, BallObservation } from "@/lib/types";
import { hexToRgb, readableTextColor } from "@/lib/vision/color";

export type PitchTeam = "team_a" | "team_b" | "both";
export type PitchLayer = "occupancy" | "movement" | "distribution" | "zones";
export type PitchScope = "full" | "upto" | "window";

const SEGMENTS = pitchLineSegments();
const MARGIN = 8; // meters around the pitch; extra room for the heatmap legend

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

/** Vibrant thermal heatmap gradient: blue → cyan → green → yellow → orange → red. */
function thermalColor(v: number): { r: number; g: number; b: number } {
  const t = Math.max(0, Math.min(1, v));
  const stops = [
    { t: 0.0, c: [20, 60, 165] },    // deep blue
    { t: 0.18, c: [30, 145, 215] },  // cyan-blue
    { t: 0.34, c: [50, 200, 195] },  // cyan
    { t: 0.5, c: [120, 220, 85] },   // green
    { t: 0.66, c: [255, 235, 60] },  // yellow
    { t: 0.82, c: [255, 130, 30] },  // orange
    { t: 1.0, c: [230, 25, 25] },    // bright red
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const range = b.t - a.t || 1;
  const k = (t - a.t) / range;
  const mix = (i: number) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * k);
  return { r: mix(0), g: mix(1), b: mix(2) };
}

function teamHeatColor(v: number, r: number, g: number, b: number) {
  const t = Math.max(0, Math.min(1, v));
  const hot = Math.max(0, t - 0.3) / 0.7;
  return {
    r: Math.round(r + (255 - r) * hot * 0.95),
    g: Math.round(g + (245 - g) * hot * 0.9),
    b: Math.round(b + (100 - b) * hot * 0.7),
    a: Math.round((0.2 + t * 0.8) * 255),
  };
}

export function scopeRange(scope: PitchScope, t: number, duration: number): [number, number] {
  if (scope === "upto") return [0, t];
  if (scope === "window") return [t - 5, t + 5];
  return [0, duration + 1];
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { teamAColor, teamBColor, teamAName, teamBName } = result.teams;
  const range = scopeRange(scope, time, result.video.durationSeconds);
  // heatmaps only need recomputation when the range changes meaningfully
  const rangeKey = scope === "full" ? "full" : `${Math.round(range[0] * 2)}:${Math.round(range[1] * 2)}`;
  const teams = useMemo(() => (team === "both" ? (["team_a", "team_b"] as const) : ([team] as const)), [team]);

  const grids = useMemo(() => {
    if (layer !== "occupancy" && layer !== "movement") return null;
    return teams.map((tm) => ({ team: tm, ...computeGrid(teamFrames, tm, layer, range) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFrames, teams, layer, rangeKey]);

  const zones = useMemo(() => {
    if (layer !== "zones") return null;
    return teams.map((tm) => ({ team: tm, ...zoneShares(teamFrames, tm, range) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFrames, teams, layer, rangeKey]);

  const interval = 1 / result.coverage.sampleFps;
  const live = frameAt(teamFrames, time, interval * 1.5);
  const liveBall: BallObservation | undefined = useMemo(() => {
    if (result.calibration.method !== "homography") return undefined;
    return result.ball.find((b) => Math.abs(b.timestampSeconds - time) <= interval * 0.75 && b.pitchX !== undefined);
  }, [result.ball, result.calibration.method, time, interval]);

  useEffect(() => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth;
      const cssH = (cssW * (PITCH_WIDTH + MARGIN * 2)) / (PITCH_LENGTH + MARGIN * 2);
      c.style.height = `${cssH}px`;
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = cssW / (PITCH_LENGTH + MARGIN * 2);
      const X = (m: number) => (m + MARGIN) * s;
      const Y = (m: number) => (m + MARGIN) * s;

      // grass
      ctx.fillStyle = "#17804b";
      ctx.fillRect(0, 0, cssW, cssH);
      for (let i = 0; i < 12; i++) {
        if (i % 2) continue;
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(X((PITCH_LENGTH / 12) * i), Y(0), (PITCH_LENGTH / 12) * s, PITCH_WIDTH * s);
      }

      // heatmap layers
      if (grids) {
        ctx.save();
        const single = grids.length === 1;
        ctx.globalCompositeOperation = single ? "source-over" : "screen";

        for (const g of grids) {
          if (g.total <= 0) continue;
          const bl = blurGrid(g.grid);
          const norm = Math.max(1e-9, percentile(bl.flat(), 0.92));
          const off = document.createElement("canvas");
          off.width = GRID_X;
          off.height = GRID_Y;
          const octx = off.getContext("2d")!;
          const img = octx.createImageData(GRID_X, GRID_Y);
          const [tr, tg, tb] = hexToRgb(g.team === "team_a" ? teamAColor : teamBColor);

          for (let y = 0; y < GRID_Y; y++)
            for (let x = 0; x < GRID_X; x++) {
              const raw = bl[y][x] / norm;
              const v = Math.pow(raw, 0.55);
              const i = (y * GRID_X + x) * 4;
              if (single) {
                const c = thermalColor(v);
                img.data[i] = c.r;
                img.data[i + 1] = c.g;
                img.data[i + 2] = c.b;
                img.data[i + 3] = raw > 0.015 ? Math.round((0.25 + v * 0.75) * 230) : 0;
              } else {
                const c = teamHeatColor(v, tr, tg, tb);
                img.data[i] = c.r;
                img.data[i + 1] = c.g;
                img.data[i + 2] = c.b;
                img.data[i + 3] = raw > 0.02 ? Math.max(c.a, 70) : 0;
              }
            }
          octx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(off, X(0), Y(0), PITCH_LENGTH * s, PITCH_WIDTH * s);
        }

        // legend for single-team thermal heatmap (outside pitch on the right)
        if (single) {
          const lw = 10;
          const lh = 92;
          const lx = X(PITCH_LENGTH) + 10;
          const ly = Y(PITCH_WIDTH / 2) - lh / 2;
          const grad = ctx.createLinearGradient(0, ly + lh, 0, ly);
          const stops = [0.0, 0.18, 0.34, 0.5, 0.66, 0.82, 1.0];
          stops.forEach((st) => {
            const c = thermalColor(st);
            grad.addColorStop(st, `rgb(${c.r},${c.g},${c.b})`);
          });
          ctx.fillStyle = grad;
          ctx.fillRect(lx, ly, lw, lh);
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1;
          ctx.strokeRect(lx, ly, lw, lh);
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.font = `600 ${Math.max(8, s * 1.25)}px Inter, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("High", lx + lw + 5, ly);
          ctx.textBaseline = "bottom";
          ctx.fillText("Low", lx + lw + 5, ly + lh);
        }
        ctx.restore();
      }

      // zones
      if (zones) {
        const zw = PITCH_LENGTH / 3;
        const zh = PITCH_WIDTH / 3;
        for (let zy = 0; zy < 3; zy++)
          for (let zx = 0; zx < 3; zx++) {
            const x0 = X(zx * zw);
            const y0 = Y(zy * zh);
            if (zones.length === 1) {
              const v = zones[0].zones[zy][zx];
              const [r, g, b] = hexToRgb(zones[0].team === "team_a" ? teamAColor : teamBColor);
              ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(0.92, 0.25 + v * 2.4)})`;
              ctx.fillRect(x0, y0, zw * s, zh * s);
            }
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x0, y0, zw * s, zh * s);
            ctx.setLineDash([]);
            const fs = Math.max(10, Math.round(s * 3.4));
            ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            zones.forEach((z, k) => {
              const v = z.total > 0 ? z.zones[zy][zx] : null;
              const color = z.team === "team_a" ? teamAColor : teamBColor;
              const text = v === null ? "–" : `${Math.round(v * 100)}%`;
              const cy = y0 + (zh * s) / 2 + (zones.length > 1 ? (k === 0 ? -fs * 0.75 : fs * 0.75) : 0);
              const tw = ctx.measureText(text).width + fs * 0.8;
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.92;
              ctx.fillRect(x0 + (zw * s) / 2 - tw / 2, cy - fs * 0.65, tw, fs * 1.3);
              ctx.globalAlpha = 1;
              ctx.fillStyle = readableTextColor(color);
              ctx.fillText(text, x0 + (zw * s) / 2, cy + 1);
            });
          }
      }

      // lines
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1, s * 0.25);
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of SEGMENTS) {
        ctx.moveTo(X(x1), Y(y1));
        ctx.lineTo(X(x2), Y(y2));
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const [cx, cy] of [
        [PITCH_LENGTH / 2, PITCH_WIDTH / 2],
        [11, PITCH_WIDTH / 2],
        [PITCH_LENGTH - 11, PITCH_WIDTH / 2],
      ]) {
        ctx.beginPath();
        ctx.arc(X(cx), Y(cy), Math.max(1.5, s * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      // goals
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(X(-1.5), Y(PITCH_WIDTH / 2 - 3.66), 1.5 * s, 7.32 * s);
      ctx.fillRect(X(PITCH_LENGTH), Y(PITCH_WIDTH / 2 - 3.66), 1.5 * s, 7.32 * s);

      // distribution: hull + centroid
      if (layer === "distribution" && live) {
        for (const tm of teams) {
          const pts = live[tm];
          const shape = teamShape(pts);
          const color = tm === "team_a" ? teamAColor : teamBColor;
          if (shape && shape.hull.length >= 3) {
            const [r, g, b] = hexToRgb(color);
            ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash(tm === "team_b" ? [6, 4] : []);
            ctx.beginPath();
            shape.hull.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
            const cx = X(shape.centroid.x);
            const cy = Y(shape.centroid.y);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx - 6, cy - 6);
            ctx.lineTo(cx + 6, cy + 6);
            ctx.moveTo(cx + 6, cy - 6);
            ctx.lineTo(cx - 6, cy + 6);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // live positions
      if ((showLive || layer === "distribution") && live) {
        for (const tm of teams) {
          const color = tm === "team_a" ? teamAColor : teamBColor;
          for (const p of live[tm]) {
            const r = Math.max(5, s * 1.35);
            ctx.beginPath();
            if (tm === "team_a") ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
            else ctx.rect(X(p.x) - r * 0.9, Y(p.y) - r * 0.9, r * 1.8, r * 1.8);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = readableTextColor(color) === "#FFFFFF" ? "#fff" : "#0B1620";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        if (liveBall) {
          ctx.beginPath();
          ctx.arc(X(liveBall.pitchX!), Y(liveBall.pitchY!), Math.max(3, s * 0.8), 0, Math.PI * 2);
          ctx.fillStyle = "#FFD400";
          ctx.fill();
          ctx.strokeStyle = "#0B1620";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // estimated shot trajectories (calibrated only)
      if (result.calibration.method === "homography") {
        for (const e of result.events) {
          if (e.type !== "shot" || !e.trajectory) continue;
          if (scope !== "full" && (e.timestampSeconds < range[0] || e.timestampSeconds > range[1])) continue;
          const pts = e.trajectory.filter((p) => p.pitchX !== undefined);
          if (pts.length < 2) continue;
          ctx.strokeStyle = "#fff";
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(X(p.pitchX!), Y(p.pitchY!)) : ctx.moveTo(X(p.pitchX!), Y(p.pitchY!))));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [grids, zones, live, liveBall, layer, teams, teamAColor, teamBColor, showLive, result.calibration.method, result.events, scope, range]);

  const liveCounts = live ? teams.map((tm) => `${tm === "team_a" ? teamAName : teamBName}: ${live[tm].length} visible`).join(", ") : "no analyzed frame at this time";
  return (
    <div ref={wrapRef} className={className}>
      <canvas
        ref={canvasRef}
        className="block w-full rounded-lg"
        role="img"
        aria-label={`2D pitch showing ${layer} for ${team === "both" ? "both teams" : team === "team_a" ? teamAName : teamBName}. Live positions: ${liveCounts}.`}
      />
    </div>
  );
}
