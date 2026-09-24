"use client";

import { useEffect, useRef } from "react";

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
  label: string;
  conf: number;
}

const PLAYERS: Player[] = [
  { team: 0, u: 0.07, v: 0.5, label: "BLUE 1", conf: 0.93 },
  { team: 0, u: 0.22, v: 0.18, label: "BLUE 3", conf: 0.88 },
  { team: 0, u: 0.2, v: 0.4, label: "BLUE 5", conf: 0.91 },
  { team: 0, u: 0.2, v: 0.62, label: "BLUE 4", conf: 0.9 },
  { team: 0, u: 0.23, v: 0.84, label: "BLUE 2", conf: 0.86 },
  { team: 0, u: 0.4, v: 0.36, label: "BLUE 8", conf: 0.92 },
  { team: 0, u: 0.42, v: 0.66, label: "BLUE 10", conf: 0.89 },
  { team: 1, u: 0.58, v: 0.34, label: "WHITE 8", conf: 0.9 },
  { team: 1, u: 0.6, v: 0.68, label: "WHITE 6", conf: 0.87 },
  { team: 1, u: 0.76, v: 0.5, label: "WHITE 9", conf: 0.94 },
  { team: 1, u: 0.93, v: 0.5, label: "WHITE 1", conf: 0.91 },
];

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function project(u: number, v: number, q: Quad): Pt {
  return lerp(lerp(q.fl, q.fr, u), lerp(q.nl, q.nr, u), v);
}

function quadOf(w: number, h: number): Quad {
  const x = w * 0.03;
  const y = h * 0.05;
  return {
    fl: { x, y },
    fr: { x: w - x, y },
    nr: { x: w - x, y: h - y },
    nl: { x, y: h - y },
  };
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

function makeGrassNoise() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(160, 160);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = Math.random();
    image.data[i] = 20 + n * 40;
    image.data[i + 1] = 70 + n * 90;
    image.data[i + 2] = 30 + n * 30;
    image.data[i + 3] = 28 + n * 55;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function DetectionDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const grass = makeGrassNoise();
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
      const q = quadOf(w, h);

      ctx.fillStyle = "#07131d";
      ctx.fillRect(0, 0, w, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
      sky.addColorStop(0, "rgba(18,50,74,0)");
      sky.addColorStop(0.4, "rgba(18,50,74,0.55)");
      sky.addColorStop(1, "rgba(7,19,29,0)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * 0.42);
      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.03})`;
        ctx.beginPath();
        ctx.arc((i * 97) % w, 8 + ((i * 41) % (h * 0.16)), 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      const stripes = 12;
      for (let i = 0; i < stripes; i++) {
        const u0 = i / stripes;
        const u1 = (i + 1) / stripes;
        trace(
          ctx,
          [project(u0, 0, q), project(u1, 0, q), project(u1, 1, q), project(u0, 1, q)],
          true,
        );
        ctx.fillStyle = i % 2 === 0 ? "#1b8a4c" : "#157443";
        ctx.fill();
      }
      trace(ctx, [q.fl, q.fr, q.nr, q.nl], true);
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.55;
      const pattern = ctx.createPattern(grass, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();

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

      ctx.save();
      trace(ctx, [q.fl, q.fr, q.nr, q.nl], true);
      ctx.clip();
      const sweep = (t * 0.08) % 1;
      trace(ctx, [project(sweep, 0, q), project(Math.min(1, sweep + 0.035), 0, q), project(Math.min(1, sweep + 0.035), 1, q), project(sweep, 1, q)], true);
      ctx.fillStyle = "rgba(125,255,198,0.16)";
      ctx.fill();

      for (const player of [...live].sort((a, b) => a.v - b.v)) {
        const p = project(player.u, player.v, q);
        const radius = 28;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        glow.addColorStop(0, "rgba(255,214,70,0.45)");
        glow.addColorStop(1, "rgba(255,214,70,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.lineWidth = Math.max(1.25, w * 0.0016);
      ctx.lineJoin = "round";
      trace(ctx, [q.fl, q.fr, q.nr, q.nl], true);
      ctx.stroke();
      trace(ctx, [project(0.5, 0, q), project(0.5, 1, q)]);
      ctx.stroke();
      trace(ctx, ring(q, 0.5, 0.5, 0.09, 0.09 * ((w * 0.94) / (h * 0.9))));
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

      const fromPt = project(live[fromI].u, live[fromI].v, q);
      const ball = project(ballUv.u, ballUv.v, q);
      if (kick < 0.98) {
        const arc = { x: (fromPt.x + ball.x) / 2, y: Math.min(fromPt.y, ball.y) - h * 0.06 };
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = reduce ? 0 : -((t * 36) % 40);
        ctx.beginPath();
        ctx.moveTo(fromPt.x, fromPt.y - 8);
        ctx.quadraticCurveTo(arc.x, arc.y, ball.x, ball.y);
        ctx.stroke();
        ctx.restore();
      }

      const drawn = [...live].sort((a, b) => a.v - b.v);
      for (const player of drawn) {
        const p = project(player.u, player.v, q);
        const s = 1;
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 2, 8 * s, 3.2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        const shirt = player.team === 0 ? "#2F80ED" : "#f4f7f8";
        ctx.strokeStyle = shirt;
        ctx.lineWidth = Math.max(1.4, 1.8 * s);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 12 * s);
        ctx.lineTo(p.x - 3.5 * s, p.y);
        ctx.moveTo(p.x, p.y - 12 * s);
        ctx.lineTo(p.x + 3.5 * s, p.y);
        ctx.stroke();
        ctx.fillStyle = shirt;
        ctx.beginPath();
        ctx.roundRect(p.x - 4.2 * s, p.y - 22 * s, 8.4 * s, 11 * s, 2 * s);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y - 26 * s, 3.3 * s, 0, Math.PI * 2);
        ctx.fill();
        if (player.team === 1) {
          ctx.strokeStyle = "#0b1620";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const marker = { x: p.x, y: p.y - 16 * s, r: 16 * s + 6 };
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, marker.r, 0, Math.PI * 2);
        ctx.strokeStyle = player.team === 0 ? "#7eb6ff" : "#ffffff";
        ctx.lineWidth = 1.75;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = player.team === 0 ? "#7eb6ff" : "#ffffff";
        ctx.fill();
        const conf = player.conf.toFixed(2);
        ctx.font = `700 ${Math.max(9, Math.min(11, w * 0.01))}px Inter, sans-serif`;
        const text = `${player.label} ${conf}`;
        const tw = ctx.measureText(text).width;
        const lx = marker.x - tw / 2 - 4;
        const ly = marker.y - marker.r - 16;
        ctx.fillStyle = "rgba(7,19,29,0.88)";
        ctx.beginPath();
        ctx.roundRect(lx, ly, tw + 8, 13, 3);
        ctx.fill();
        ctx.fillStyle = player.team === 0 ? "#9ec5ff" : "#ffffff";
        ctx.fillText(text, lx + 4, ly + 10);
      }

      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.strokeStyle = `rgba(255,212,0,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 8 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#FFD400";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 4.2, 0, Math.PI * 2);
      ctx.fill();

      if (!reduce) raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="overflow-hidden bg-transparent"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent), linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent), linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent)",
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <canvas
        ref={canvasRef}
        className="block aspect-[16/10] w-full"
        role="img"
        aria-label="Flat horizontal pitch. Players move and pass while circle markers track them."
      />
    </div>
  );
}
