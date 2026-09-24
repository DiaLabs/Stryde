import type { OverlayOptions } from "../types";
import { readableTextColor } from "../vision/color";
import { cameraAt, nearestSample, playersAt, possessionAt, type RenderIndex } from "./index";

export interface OverlayTeams {
  teamAName: string;
  teamBName: string;
  teamAColor: string;
  teamBColor: string;
}

export interface Viewport {
  /** content rect inside the canvas, CSS pixels */
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

const UNKNOWN = "#B8C2CA";
const BALL = "#FFD400";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tag(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, bg: string, fontPx: number, dashed = false) {
  ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + fontPx * 0.9;
  const h = fontPx * 1.5;
  const x = cx - w / 2;
  const y = bottom - h;
  roundRect(ctx, x, y, w, h, fontPx * 0.35);
  ctx.fillStyle = bg;
  ctx.globalAlpha = dashed ? 0.75 : 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = readableTextColor(bg);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + 0.5);
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  t: number,
  index: RenderIndex,
  opts: OverlayOptions,
  teams: OverlayTeams
) {
  const { x: ox, y: oy, w, h } = vp;
  const scale = Math.max(0.7, Math.min(1.6, w / 960));
  const font = Math.round(11 * scale);
  const colorOf = (team: string) => (team === "team_a" ? teams.teamAColor : team === "team_b" ? teams.teamBColor : UNKNOWN);
  const nameOf = (team: string) => (team === "team_a" ? teams.teamAName : team === "team_b" ? teams.teamBName : "Unknown");
  const px = (nx: number) => ox + nx * w;
  const py = (ny: number) => oy + ny * h;

  const { i: si, gap } = nearestSample(index, t);
  if (si < 0 || gap) return { gap: true };

  const cam = cameraAt(index, t);
  const poss = possessionAt(index, t);
  const possTeam = poss.sample?.teamId ?? "unknown";
  const players = playersAt(index, t);

  // trails
  if (opts.showTrails) {
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = "round";
    for (const p of players) {
      const hist = index.trackHistory.get(p.trackId);
      if (!hist) continue;
      const pts = hist.filter((q) => q.t <= t + 1e-3 && q.t >= t - 1.6);
      if (pts.length < 2) continue;
      const color = colorOf(p.teamId);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + 0.6 * (k / pts.length);
        ctx.beginPath();
        ctx.moveTo(px(a.x - cam.x), py(a.y - cam.y));
        ctx.lineTo(px(b.x - cam.x), py(b.y - cam.y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // players
  for (const p of players) {
    const color = colorOf(p.teamId);
    const uncertain = p.teamId === "unknown" || p.teamConfidence < 0.45;
    const inPossession = opts.showPossession && possTeam !== "unknown" && p.teamId === possTeam;
    const bx = px(p.box.x);
    const by = py(p.box.y);
    const bw = p.box.width * w;
    const bh = p.box.height * h;
    const cx = bx + bw / 2;
    const footY = by + bh;

    // ground ellipse
    ctx.beginPath();
    ctx.ellipse(cx, footY, Math.max(bw * 0.75, 8 * scale), Math.max(bw * 0.25, 3 * scale), 0, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = (inPossession ? 3 : 2) * scale;
    ctx.setLineDash(uncertain ? [4 * scale, 3 * scale] : []);
    if (inPossession) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * scale;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (opts.showPlayerBoxes) {
      ctx.lineWidth = (inPossession ? 2 : 1.25) * scale;
      ctx.strokeStyle = color;
      ctx.globalAlpha = inPossession ? 1 : 0.85;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);

    if (opts.showTeamLabels) {
      const base = p.teamId === "unknown" ? `? · ${p.num}` : `${nameOf(p.teamId).slice(0, 12)} · ${p.num}`;
      const label = opts.showConfidence ? `${base} · ${Math.round(p.detectionConfidence * 100)}%` : base;
      tag(ctx, label, cx, by - 3 * scale, color, font, uncertain);
    }

    if (opts.showPossession && poss.sample?.nearestTrackId === p.trackId && possTeam !== "unknown") {
      const ty = by - (opts.showTeamLabels ? font * 1.5 + 6 * scale : 4 * scale);
      ctx.beginPath();
      ctx.moveTo(cx - 6 * scale, ty - 9 * scale);
      ctx.lineTo(cx + 6 * scale, ty - 9 * scale);
      ctx.lineTo(cx, ty);
      ctx.closePath();
      ctx.fillStyle = BALL;
      ctx.fill();
      ctx.strokeStyle = "#0B1620";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (opts.showSpeed && p.speed !== undefined) {
      const text = `${p.speed.toFixed(1)} m/s`;
      ctx.font = `600 ${Math.round(font * 0.95)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(text).width + 8 * scale;
      roundRect(ctx, cx - tw / 2, footY + 5 * scale, tw, font * 1.4, 3 * scale);
      ctx.fillStyle = "rgba(7,19,29,0.78)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, footY + 5 * scale + font * 0.72);
    }
  }

  // ball (only at an actually observed sample)
  if (opts.showBall) {
    const b = index.ball[si];
    if (b && Math.abs(b.timestampSeconds - t) <= index.interval * 0.75) {
      const shift = { x: cam.x - index.frames[si].cameraX, y: cam.y - index.frames[si].cameraY };
      const bx = px(b.x - shift.x);
      const by = py(b.y - shift.y);
      const r = Math.max(6 * scale, b.box.width * w * 0.9);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.strokeStyle = BALL;
      ctx.lineWidth = 2.5 * scale;
      ctx.shadowColor = BALL;
      ctx.shadowBlur = 8 * scale;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = `700 ${font}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = BALL;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(opts.showConfidence ? `BALL ${Math.round(b.confidence * 100)}%` : "BALL", bx + r + 4 * scale, by);
    }
  }

  // shot trajectories
  if (opts.showShotEvents) {
    for (const e of index.events) {
      if (e.type !== "shot" || !e.trajectory?.length) continue;
      const end = e.trajectory[e.trajectory.length - 1].t;
      if (t < e.timestampSeconds - 0.3 || t > end + 2) continue;
      const pts = e.trajectory.filter((q) => q.t <= t + 1e-3);
      if (!pts.length) continue;
      const toCur = (q: { t: number; x: number; y: number }) => {
        const k = nearestSample(index, q.t).i;
        const f = index.frames[k];
        return { x: px(q.x + f.cameraX - cam.x), y: py(q.y + f.cameraY - cam.y) };
      };
      ctx.setLineDash([7 * scale, 5 * scale]);
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      pts.forEach((q, k) => {
        const c = toCur(q);
        if (k === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      const head = toCur(pts[pts.length - 1]);
      const label = `SHOT (est.) · ${Math.round(e.confidence * 100)}%`;
      ctx.font = `700 ${Math.round(font * 1.1)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 12 * scale;
      const lx = Math.min(ox + w - tw - 6, Math.max(ox + 6, head.x - tw / 2));
      const ly = Math.max(oy + 6, head.y - 34 * scale);
      roundRect(ctx, lx, ly, tw, font * 1.9, 4 * scale);
      ctx.fillStyle = "rgba(7,19,29,0.85)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 6 * scale, ly + font * 0.95);
    }
  }

  // goal banner
  if (opts.showGoalEvents) {
    const g = index.events.find((e) => e.type === "goal" && t >= e.timestampSeconds && t <= e.timestampSeconds + 3);
    if (g) {
      const text = `POSSIBLE GOAL · ${nameOf(g.teamId)} (estimated, ${Math.round(g.confidence * 100)}%)`;
      ctx.font = `800 ${Math.round(font * 1.6)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(text).width + 32 * scale;
      const bh = font * 3;
      const bx = ox + (w - tw) / 2;
      const by = oy + h * 0.42;
      roundRect(ctx, bx, by, tw, bh, 6 * scale);
      ctx.fillStyle = "rgba(7,19,29,0.88)";
      ctx.fill();
      ctx.fillStyle = "#20C785";
      ctx.fillRect(bx, by + bh - 4 * scale, tw, 4 * scale);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + tw / 2, by + bh / 2 - 1);
    }
  }
  return { gap: false };
}
