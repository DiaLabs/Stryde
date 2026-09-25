"use client";

import { useEffect, useRef } from "react";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/lib/analysis/pitch";

interface Pt {
  x: number;
  y: number;
}

interface Quad {
  fl: Pt;
  fr: Pt;
  nr: Pt;
  nl: Pt;
}

interface Player {
  team: 0 | 1;
  u: number;
  v: number;
}

const PLAYERS: Player[] = [
  { team: 0, u: 0.08, v: 0.52 },
  { team: 0, u: 0.22, v: 0.2 },
  { team: 0, u: 0.2, v: 0.42 },
  { team: 0, u: 0.21, v: 0.64 },
  { team: 0, u: 0.24, v: 0.84 },
  { team: 0, u: 0.4, v: 0.36 },
  { team: 0, u: 0.42, v: 0.66 },
  { team: 1, u: 0.58, v: 0.34 },
  { team: 1, u: 0.6, v: 0.68 },
  { team: 1, u: 0.76, v: 0.5 },
  { team: 1, u: 0.92, v: 0.5 },
];

const TEAM_A = { name: "BLUE", color: "#2F80ED", glow: "#7eb6ff" };
const TEAM_B = { name: "WHITE", color: "#f4f7f8", glow: "#ffffff" };
const TEAMS = [TEAM_A, TEAM_B];

const PITCH_RATIO = PITCH_LENGTH / PITCH_WIDTH;

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function project(u: number, v: number, q: Quad): Pt {
  return lerp(lerp(q.nl, q.nr, u), lerp(q.fl, q.fr, u), v);
}

/** End-line camera with gentle tilt; near/far edges are goal lines (length), depth is pitch width. */
function quadOf(w: number, h: number, t: number): Quad {
  const sway = Math.sin(t * 0.2) * w * 0.004;
  const bob = Math.sin(t * 0.14 + 0.5) * h * 0.002;
  const cx = w * 0.5;

  const lengthSpan = Math.min(w * 0.89, h * PITCH_RATIO * 0.91);
  const depthSpan = lengthSpan / PITCH_RATIO;
  const farScale = 0.82;
  const baseY = Math.min(h * 0.92, h * 0.52 + depthSpan * 0.5) + bob;

  return {
    nl: { x: cx - lengthSpan / 2 + sway, y: baseY },
    nr: { x: cx + lengthSpan / 2 - sway, y: baseY },
    fr: { x: cx + (lengthSpan * farScale) / 2 + sway * 0.3, y: baseY - depthSpan },
    fl: { x: cx - (lengthSpan * farScale) / 2 - sway * 0.3, y: baseY - depthSpan },
  };
}

function depth(u: number, v: number): number {
  return clamp(0.45 + (1 - v) * 0.45 + (1 - Math.abs(u - 0.5) * 2) * 0.08, 0.45, 1);
}

function trace(ctx: CanvasRenderingContext2D, pts: Pt[], close = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

function ring(q: Quad, u: number, v: number, du: number, dv: number, steps = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(project(u + Math.cos(a) * du, v + Math.sin(a) * dv, q));
  }
  return pts;
}

function easeOut(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const PASSERS = [5, 6, 7, 8, 9];

function makeGrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const base = ctx.createImageData(256, 256);
  for (let i = 0; i < base.data.length; i += 4) {
    const n = Math.random();
    base.data[i] = 22 + n * 32;
    base.data[i + 1] = 80 + n * 90;
    base.data[i + 2] = 36 + n * 45;
    base.data[i + 3] = 255;
  }
  ctx.putImageData(base, 0, 0);

  // faint mowing stripes
  ctx.globalCompositeOperation = "overlay";
  for (let i = 0; i < 256; i += 4) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 8 === 0 ? 0.04 : 0)})`;
    ctx.fillRect(i, 0, 2, 256);
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, q: Quad) {
  const cx = (q.nl.x + q.nr.x) / 2;
  const cy = q.nl.y + 14;
  const rx = ((q.nr.x - q.nl.x) / 2) * 0.78;
  const ry = 18;

  ctx.save();
  ctx.filter = "blur(22px)";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.filter = "blur(8px)";
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 4, rx * 0.92, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function DetectionDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const grass = makeGrassTexture();
    let raf = 0;

    const paint = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = reduce ? 6 : time / 1000;
      const q = quadOf(w, h, t);

      ctx.clearRect(0, 0, w, h);
      drawGroundShadow(ctx, q);

      trace(ctx, [q.nl, q.nr, q.fr, q.fl], true);
      ctx.save();
      ctx.clip();

      // grass base + noise
      const pattern = ctx.createPattern(grass, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }

      // very faint mowing stripes
      const stripes = 14;
      for (let i = 0; i < stripes; i++) {
        const u0 = i / stripes;
        const u1 = (i + 0.96) / stripes;
        trace(ctx, [project(u0, 0, q), project(u1, 0, q), project(u1, 1, q), project(u0, 1, q)], true);
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)";
        ctx.fill();
      }

      // subtle depth haze
      const haze = ctx.createLinearGradient(q.fl.x, q.fl.y, q.nl.x, q.nl.y);
      haze.addColorStop(0, "rgba(0,0,0,0.08)");
      haze.addColorStop(0.8, "rgba(0,0,0,0.02)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // passing loop
      const span = 2.6;
      const step = Math.floor(t / span);
      const fromI = PASSERS[step % PASSERS.length];
      const toI = PASSERS[(step + 1) % PASSERS.length];
      const kick = easeOut(Math.min(1, ((t % span) / span) / 0.5));
      const live = PLAYERS.map((player, i) => {
        const roam = i === 0 || i === PLAYERS.length - 1 ? 0.012 : 0.05;
        const chase = i === toI ? kick * 0.04 : 0;
        return {
          ...player,
          u: clamp(player.u + Math.sin(t * (0.65 + (i % 3) * 0.18) + i) * roam + chase, 0.04, 0.96),
          v: clamp(player.v + Math.cos(t * (0.5 + (i % 4) * 0.12) + i * 1.7) * roam * 1.15, 0.08, 0.92),
        };
      });
      const ballUv = {
        u: live[fromI].u + (live[toI].u - live[fromI].u) * kick,
        v: live[fromI].v + (live[toI].v - live[fromI].v) * kick,
      };
      const ball = project(ballUv.u, ballUv.v, q);
      const ballD = depth(ballUv.u, ballUv.v);

      ctx.save();
      trace(ctx, [q.nl, q.nr, q.fr, q.fl], true);
      ctx.clip();

      // subtle heat glow under all players
      for (const player of live) {
        const p = project(player.u, player.v, q);
        const d = depth(player.u, player.v);
        const radius = 14 + d * 16;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        glow.addColorStop(0, `rgba(255,214,70,${0.18 + d * 0.22})`);
        glow.addColorStop(1, "rgba(255,214,70,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // pitch lines
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1.25, w * 0.0016);
      ctx.lineJoin = "round";
      trace(ctx, [q.nl, q.nr, q.fr, q.fl], true);
      ctx.stroke();
      trace(ctx, [project(0.5, 0, q), project(0.5, 1, q)]);
      ctx.stroke();
      trace(ctx, ring(q, 0.5, 0.5, 9.15 / PITCH_LENGTH, 9.15 / PITCH_WIDTH));
      ctx.stroke();
      const spot = project(0.5, 0.5, q);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, Math.max(2, w * 0.003), 0, Math.PI * 2);
      ctx.fill();

      const box = (u0: number, u1: number, v0: number, v1: number) => {
        trace(ctx, [project(u0, v0, q), project(u1, v0, q), project(u1, v1, q), project(u0, v1, q)], true);
        ctx.stroke();
      };
      box(0, 0.157, 0.204, 0.796);
      box(0, 0.052, 0.368, 0.632);
      box(0.843, 1, 0.204, 0.796);
      box(0.948, 1, 0.368, 0.632);

      // players
      const fromPt = project(live[fromI].u, live[fromI].v, q);
      if (kick < 0.98) {
        const arc = { x: (fromPt.x + ball.x) / 2, y: Math.min(fromPt.y, ball.y) - h * 0.04 * ballD };
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = reduce ? 0 : -((t * 36) % 40);
        ctx.beginPath();
        ctx.moveTo(fromPt.x, fromPt.y);
        ctx.quadraticCurveTo(arc.x, arc.y, ball.x, ball.y);
        ctx.stroke();
        ctx.restore();
      }

      for (const player of live) {
        const p = project(player.u, player.v, q);
        const d = depth(player.u, player.v);
        const r = (3.8 + d * 2.2) * 1.15;
        const teamColor = TEAMS[player.team].color;

        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + r * 0.35, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = player.team === 0 ? "rgba(255,255,255,0.55)" : "rgba(11,22,32,0.45)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // ball
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.strokeStyle = `rgba(255,212,0,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, (5 + pulse * 2.5) * ballD, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#FFD400";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 3.5 * ballD, 0, Math.PI * 2);
      ctx.fill();

      if (!reduce) raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="overflow-visible bg-transparent [perspective:1200px]">
      <div
        className="drop-shadow-[0_32px_64px_rgba(0,0,0,0.5)]"
        style={{ transform: "rotateX(8deg)", transformOrigin: "center bottom" }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: `${PITCH_LENGTH} / ${PITCH_WIDTH}` }}
          role="img"
          aria-label="Animated football pitch with team dots, possession glow and moving ball."
        />
      </div>
    </div>
  );
}
