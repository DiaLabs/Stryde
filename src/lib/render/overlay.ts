import type { OverlayOptions } from "../types";
import { readableTextColor } from "../vision/color";
import { cameraAt, nearestSample, playersAt, possessionAt, type RenderIndex } from "./index";

/*
 * Broadcast tracking graphics drawn over the footage (docs/reference-assets/team_track.jpeg and
 * ball_traj.jpeg): a ground ellipse under each player in the team colour, a small number pill
 * above the head, the ball in HUD yellow with a dashed trail, and navy tags for events.
 * One rule for line style everywhere: solid = measured, dashed = estimated.
 */

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

/** reference palette (globals.css): navy-950, hud, neutral for unassigned players */
const NAVY = "#07131D";
const HUD = "#FFD400";
const UNKNOWN = "#B9C3CC";
const WHITE = "#FFFFFF";
/** soft dark under-stroke so thin lines stay legible on bright pitches and white kits */
const SHADOW = "rgba(7, 19, 29, 0.5)";

let family: string | null = null;
function fontFamily(): string {
  if (family) return family;
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-barlow").trim();
    if (v) family = `${v}, system-ui, sans-serif`;
  }
  return family ?? "system-ui, sans-serif";
}

function font(ctx: CanvasRenderingContext2D, weight: number, px: number) {
  ctx.font = `${weight} ${px}px ${fontFamily()}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Stroke the current path: a thin shadow underneath, the colour on top. */
function line(ctx: CanvasRenderingContext2D, color: string, width: number, dash: number[] = [], alpha = 1) {
  ctx.lineCap = dash.length ? "butt" : "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = width + 1.5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

type Bounds = { x: number; y: number; w: number; h: number };

/**
 * A rounded broadcast tag. `fill` is the pill colour (text colour follows its luminance);
 * `dot` draws a team dot at the start; `edge` + `dashed` outline it (an estimate);
 * `accent` draws a short HUD bar on the left edge, like a lower-third.
 */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchor: { x: number; y: number; align: "center" | "left" },
  px: number,
  opts: { fill?: string; alpha?: number; dot?: string; edge?: string; dashed?: boolean; accent?: string; bounds?: Bounds; radius?: number } = {}
): { x: number; y: number; w: number; h: number } {
  font(ctx, 600, px);
  const fill = opts.fill ?? NAVY;
  const padX = px * 0.55;
  const dotR = opts.dot ? px * 0.32 : 0;
  const gap = opts.dot ? px * 0.38 : 0;
  const accentW = opts.accent ? Math.max(2, px * 0.22) : 0;
  const tw = ctx.measureText(text).width;
  const w = padX * 2 + accentW + dotR * 2 + gap + tw;
  const h = px * 1.5;
  let x = anchor.align === "center" ? anchor.x - w / 2 : anchor.x;
  let y = anchor.y - h;
  if (opts.bounds) {
    const b = opts.bounds;
    x = Math.min(b.x + b.w - w - 2, Math.max(b.x + 2, x));
    y = Math.min(b.y + b.h - h - 2, Math.max(b.y + 2, y));
  }
  const r = opts.radius ?? h / 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.globalAlpha = opts.alpha ?? 0.92;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (opts.edge) {
    ctx.strokeStyle = opts.edge;
    ctx.lineWidth = Math.max(1, px * 0.1);
    ctx.setLineDash(opts.dashed ? [px * 0.28, px * 0.22] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (opts.accent) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = opts.accent;
    ctx.fillRect(x, y, accentW, h);
    ctx.restore();
  }
  let cx = x + padX + accentW;
  if (opts.dot) {
    ctx.beginPath();
    ctx.arc(cx + dotR, y + h / 2, dotR, 0, Math.PI * 2);
    ctx.fillStyle = opts.dot;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1;
    ctx.stroke();
    cx += dotR * 2 + gap;
  }
  ctx.fillStyle = readableTextColor(fill);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + h / 2 + px * 0.04);
  return { x, y, w, h };
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
  const bounds = { x: ox, y: oy, w, h };
  const scale = Math.max(0.7, Math.min(1.6, w / 960));
  const fontPx = Math.round(12 * scale);
  const colorOf = (team: string) => (team === "team_a" ? teams.teamAColor : team === "team_b" ? teams.teamBColor : UNKNOWN);
  const nameOf = (team: string) => (team === "team_a" ? teams.teamAName : team === "team_b" ? teams.teamBName : "Unknown team");
  const px = (nx: number) => ox + nx * w;
  const py = (ny: number) => oy + ny * h;

  const { i: si, gap } = nearestSample(index, t);
  if (si < 0 || gap) return { gap: true };

  const cam = cameraAt(index, t);
  const poss = possessionAt(index, t);
  const possTeam = poss.sample?.teamId ?? "unknown";
  const players = playersAt(index, t);
  /** a point sampled at frame k, moved into the current camera view */
  const toView = (k: number, nx: number, ny: number) => {
    const f = index.frames[k];
    return { x: px(nx + f.cameraX - cam.x), y: py(ny + f.cameraY - cam.y) };
  };

  // movement trails: measured positions, so solid, fading toward the past
  if (opts.showTrails) {
    for (const p of players) {
      const hist = index.trackHistory.get(p.trackId);
      if (!hist) continue;
      const pts = hist.filter((q) => q.t <= t + 1e-3 && q.t >= t - 1.6);
      if (pts.length < 2) continue;
      ctx.strokeStyle = colorOf(p.teamId);
      ctx.lineWidth = 2 * scale;
      ctx.lineCap = "round";
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        ctx.beginPath();
        ctx.moveTo(px(a.x - cam.x), py(a.y - cam.y));
        ctx.lineTo(px(b.x - cam.x), py(b.y - cam.y));
        ctx.globalAlpha = 0.1 + 0.65 * (k / pts.length);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // players: ground ring first, so boxes and tags sit on top of every ring
  const nearestId = opts.showPossessionHighlight && possTeam !== "unknown" ? poss.sample?.nearestTrackId : undefined;
  const placed = players.map((p) => {
    const bx = px(p.box.x);
    const by = py(p.box.y);
    const bw = p.box.width * w;
    const bh = p.box.height * h;
    // team assignment we are unsure of is drawn dashed: it is an estimate
    const uncertain = p.teamId === "unknown" || p.teamConfidence < 0.45;
    return { p, bx, by, bw, bh, cx: bx + bw / 2, footY: by + bh, uncertain, color: colorOf(p.teamId) };
  });

  for (const q of placed) {
    const rx = Math.max(q.bw * 0.7, 9 * scale);
    const ry = Math.max(rx * 0.32, 3 * scale);
    const strong = opts.showPossessionHighlight && possTeam !== "unknown" && q.p.teamId === possTeam;
    ctx.beginPath();
    ctx.ellipse(q.cx, q.footY, rx, ry, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = q.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    line(ctx, q.color, (strong ? 2.25 : 1.75) * scale, q.uncertain ? [4 * scale, 3 * scale] : []);

    // the player nearest the ball: possession is estimated, so its HUD ring is dashed
    if (nearestId && nearestId === q.p.trackId) {
      ctx.beginPath();
      ctx.ellipse(q.cx, q.footY, rx * 1.45, ry * 1.45, 0, 0, Math.PI * 2);
      line(ctx, HUD, 2 * scale, [6 * scale, 4 * scale]);
    }
  }

  for (const q of placed) {
    if (opts.showPlayerBoxes) {
      roundRect(ctx, q.bx, q.by, q.bw, q.bh, Math.min(3 * scale, q.bw / 5));
      line(ctx, q.color, 1.1 * scale, q.uncertain ? [3 * scale, 3 * scale] : [], 0.8);
    }

    let top = q.by - 3 * scale;
    if (opts.showTeamLabels) {
      const num = q.p.num ? `#${q.p.num}` : "#";
      const text = opts.showConfidence ? `${num}  ${Math.round(q.p.detectionConfidence * 100)}%` : num;
      const tag = q.uncertain
        ? pill(ctx, text, { x: q.cx, y: top, align: "center" }, fontPx, { fill: NAVY, alpha: 0.82, edge: q.color, dashed: true, bounds })
        : pill(ctx, text, { x: q.cx, y: top, align: "center" }, fontPx, { fill: q.color, bounds });
      top = tag.y - 2 * scale;
    }

    // a small HUD marker above the player nearest the ball, as on broadcast tracking
    if (nearestId && nearestId === q.p.trackId) {
      const s = 5 * scale;
      ctx.beginPath();
      ctx.moveTo(q.cx - s, top - s * 1.3);
      ctx.lineTo(q.cx + s, top - s * 1.3);
      ctx.lineTo(q.cx, top);
      ctx.closePath();
      ctx.fillStyle = HUD;
      ctx.fill();
      ctx.strokeStyle = SHADOW;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // One ball only, interpolated between bracketing observations when needed.
  if (opts.showBall) {
    const activeShot = opts.showShotEvents
      ? index.events.find((e) => e.type === "shot" && t >= e.timestampSeconds - 0.15 && t <= (e.endTimestampSeconds ?? e.timestampSeconds) + 0.35)
      : undefined;
    if (!activeShot) {
      let i0 = si;
      while (i0 >= 0 && !index.ball[i0]) i0--;
      let i1 = si;
      while (i1 < index.ball.length && !index.ball[i1]) i1++;
      const b0 = i0 >= 0 ? index.ball[i0] : undefined;
      const b1 = i1 < index.ball.length ? index.ball[i1] : undefined;
      const pick = b0 && b1 && i0 !== i1 ? (Math.abs(index.times[i0] - t) <= Math.abs(index.times[i1] - t) ? b0 : b1) : (b0 ?? b1);
      if (pick && Math.abs(pick.timestampSeconds - t) <= index.interval * 1.1) {
        let bxN = pick.x;
        let byN = pick.y;
        let box = pick.box;
        let conf = pick.confidence;
        // measured when this very sample saw the ball; otherwise an in-between estimate
        let estimated = !index.ball[si];
        if (b0 && b1 && i0 !== i1 && index.times[i1] > index.times[i0]) {
          const a = Math.max(0, Math.min(1, (t - index.times[i0]) / (index.times[i1] - index.times[i0])));
          bxN = b0.x + (b1.x - b0.x) * a;
          byN = b0.y + (b1.y - b0.y) * a;
          conf = b0.confidence + (b1.confidence - b0.confidence) * a;
          box = b0.box;
          estimated = true;
        }
        const ref = i0 >= 0 && index.ball[i0] ? i0 : i1;
        const { x: bx, y: by } = toView(ref, bxN, byN);

        // dashed trail through the last second of ball sightings (a path between samples is inferred)
        const trail: { x: number; y: number }[] = [];
        for (let k = Math.min(si, index.ball.length - 1); k >= 0 && index.times[k] >= t - 1.2; k--) {
          const b = index.ball[k];
          if (b && index.times[k] <= t + 1e-3) trail.unshift(toView(k, b.x, b.y));
          // never draw a path across a camera cut
          if (index.frames[k].sceneCut) break;
        }
        trail.push({ x: bx, y: by });
        if (trail.length >= 2) {
          ctx.beginPath();
          trail.forEach((c, k) => (k === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
          line(ctx, HUD, 1.75 * scale, [5 * scale, 4 * scale], 0.85);
        }

        const r = Math.max(4.5 * scale, box.width * w * 0.6);
        // ball marker: a filled HUD dot with a ring around it
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = HUD;
        ctx.fill();
        ctx.strokeStyle = SHADOW;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, by, r + 2 * scale, 0, Math.PI * 2);
        line(ctx, HUD, 1.75 * scale, estimated ? [3.5 * scale, 3 * scale] : []);

        const text = opts.showConfidence ? `BALL ${Math.round(conf * 100)}%` : "BALL";
        font(ctx, 700, fontPx);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const lx = Math.min(ox + w - ctx.measureText(text).width - 4, bx + r + 6 * scale);
        const ly = Math.max(oy + fontPx, by);
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = SHADOW;
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = HUD;
        ctx.fillText(text, lx, ly);
      }
    }
  }

  // shot trajectories: events are estimates, so always dashed
  if (opts.showShotEvents) {
    for (const e of index.events) {
      if (e.type !== "shot" || !e.trajectory?.length) continue;
      const end = e.trajectory[e.trajectory.length - 1].t;
      if (t < e.timestampSeconds - 0.3 || t > end + 2) continue;
      const pts = e.trajectory.filter((q) => q.t <= t + 1e-3);
      if (!pts.length) continue;
      const toCur = (q: { t: number; x: number; y: number }) => toView(nearestSample(index, q.t).i, q.x, q.y);
      ctx.beginPath();
      pts.forEach((q, k) => {
        const c = toCur(q);
        if (k === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      line(ctx, HUD, 2.5 * scale, [8 * scale, 6 * scale]);
      const head = toCur(pts[pts.length - 1]);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = HUD;
      ctx.fill();
      pill(ctx, `SHOT · EST. ${Math.round(e.confidence * 100)}%`, { x: head.x, y: head.y - 12 * scale, align: "center" }, Math.round(fontPx * 1.1), {
        fill: NAVY,
        alpha: 0.88,
        dot: colorOf(e.teamId),
        accent: HUD,
        radius: 4 * scale,
        bounds,
      });
    }
  }

  // possible goal: a lower-third style tag in the middle of the picture
  if (opts.showGoalEvents) {
    const g = index.events.find((e) => e.type === "goal" && t >= e.timestampSeconds && t <= e.timestampSeconds + 3);
    if (g) {
      const text = `POSSIBLE GOAL · ${nameOf(g.teamId).toUpperCase()} · EST. ${Math.round(g.confidence * 100)}%`;
      pill(ctx, text, { x: ox + w / 2, y: oy + h * 0.5, align: "center" }, Math.round(fontPx * 1.7), {
        fill: NAVY,
        alpha: 0.9,
        dot: colorOf(g.teamId),
        accent: HUD,
        edge: WHITE,
        dashed: true,
        radius: 6 * scale,
        bounds,
      });
    }
  }
  return { gap: false };
}
