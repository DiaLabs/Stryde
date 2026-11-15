/*
 * The landing hero's scene: one scripted passage of play on a 105 × 68 m pitch, rendered through
 * a small perspective camera that tilts from the broadcast gantry to straight down. Overlays follow
 * the broadcast references in docs/reference-assets (team_track.jpeg, ball_traj.jpeg).
 * Pure drawing code (no React).
 */

export type V3 = [number, number, number];

export const PITCH_L = 105;
export const PITCH_W = 68;
const HL = PITCH_L / 2;
const HW = PITCH_W / 2;

export const C = {
  // kits
  aShirt: "#2563EB",
  aShorts: "#1E293B",
  aKeeper: "#16A34A",
  bShirt: "#F1F5F9",
  bShorts: "#111827",
  bKeeper: "#111827",
  refShirt: "#FACC15",
  skin: "#C99A7E",
  // overlays
  a: "#3B82F6",
  b: "#F97316",
  ref: "#FACC15",
  ball: "#FFD400",
  brand: "#20C785",
  // pitch
  grass: "#1f7a43",
  grass2: "#22854a",
  grassOuter: "#1b6b3b",
  chalk: "rgba(240,248,242,0.9)",
  stand: "#0b1520",
  navy: "#07131D",
};

// ---------------------------------------------------------------- easing

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- camera

export interface Camera {
  pos: V3;
  fs: number;
  fc: number;
  f: number;
  cx: number;
  cy: number;
}

/**
 * tilt 0 = broadcast camera on the halfway line, 1 = straight down. `reserveLeft` is the
 * fraction of the width covered by text on wide screens; the top-down pitch is fitted into the
 * remaining space so the captions never sit on top of it.
 */
export function makeCamera(tilt: number, w: number, h: number, focusX: number, reserveLeft = 0): Camera {
  const e = easeInOut(clamp01(tilt));
  const theta = lerp(18, 90, e) * (Math.PI / 180);
  const fov = lerp(17, 30, e) * (Math.PI / 180);
  const tanHalf = Math.tan(fov / 2);
  const aspect = w / h;
  const top = Math.tan((15 * Math.PI) / 180);
  const usableW = w * (1 - reserveLeft);
  const dTop = Math.max((HW + 4) / top, (HL + 4) / (top * (usableW / h)));
  const dBroadcast = Math.max(70, Math.min(150, 21 / (tanHalf * Math.max(aspect, 0.9))));
  const d = lerp(dBroadcast, dTop, e);
  const tx = lerp(Math.max(-22, Math.min(22, focusX * 0.6)), 0, e);
  const tz = lerp(-3, 0, e);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const cxTop = w - usableW / 2 - (reserveLeft > 0 ? 16 : 0);
  return { pos: [tx, d * s, tz - d * c], fs: s, fc: c, f: h / 2 / tanHalf, cx: lerp(w / 2, cxTop, e), cy: h / 2 + lerp(0, 24, e) };
}

export function project(cam: Camera, x: number, y: number, z: number, out: { x: number; y: number; k: number }): boolean {
  const vx = x - cam.pos[0];
  const vy = y - cam.pos[1];
  const vz = z - cam.pos[2];
  const depth = -vy * cam.fs + vz * cam.fc;
  if (depth < 0.5) return false;
  const upc = vy * cam.fc + vz * cam.fs;
  out.k = cam.f / depth;
  out.x = cam.cx + vx * out.k;
  out.y = cam.cy - upc * out.k;
  return true;
}

// ---------------------------------------------------------------- the passage of play

interface BallKey {
  t: number;
  x: number;
  z: number;
  loft?: number;
}

// Blue build from the left back, lose it in midfield, win it straight back, switch play,
// cross and score; then the ball is returned for the restart.
const BALL: BallKey[] = [
  { t: 0, x: -38, z: -22 },
  { t: 1.6, x: -26, z: -10 },
  { t: 2.8, x: -12, z: -15 },
  { t: 3.9, x: -4, z: -8 },
  { t: 4.8, x: 4, z: -3 },
  { t: 5.9, x: -6, z: 6 },
  { t: 6.9, x: 2, z: 10 },
  { t: 8.3, x: 16, z: 22, loft: 6 },
  { t: 9.7, x: 30, z: 27 },
  { t: 10.9, x: 40, z: 24 },
  { t: 12.0, x: 46, z: 2, loft: 5 },
  { t: 12.6, x: 49.5, z: 0.5 },
  { t: 13.1, x: 53, z: 1.6 },
  { t: 14.4, x: 53, z: 1.6 },
  { t: 16.2, x: -38, z: -22, loft: 18 },
];
export const LOOP = BALL[BALL.length - 1].t;
export const REWIND_START = BALL[BALL.length - 2].t;
export const inRewind = (t: number) => ((t % LOOP) + LOOP) % LOOP >= REWIND_START;
/** Blue lose the ball between these times and win it back */
const TURNOVER: [number, number] = [4.6, 6.6];

export function ballAt(t: number, out: { x: number; y: number; z: number }) {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  let i = 0;
  while (i < BALL.length - 2 && BALL[i + 1].t <= tt) i++;
  const a = BALL[i];
  const b = BALL[i + 1];
  const s = clamp01((tt - a.t) / (b.t - a.t));
  const u = b.loft ? s : s * s * (3 - 2 * s);
  out.x = lerp(a.x, b.x, u);
  out.z = lerp(a.z, b.z, u);
  out.y = b.loft ? 4 * b.loft * u * (1 - u) : 0.11;
}

type Role = "gk" | "out" | "ref";
export interface Player {
  team: "a" | "b" | "ref";
  role: Role;
  num: number;
  bx: number;
  bz: number;
  phase: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  speed: number;
  trail: Float32Array;
  trailLen: number;
}

const formation: [number, number, number][] = [
  [1, -50, 0],
  [2, -34, 24],
  [5, -37, 8],
  [4, -37, -8],
  [3, -34, -24],
  [8, -22, 14],
  [6, -25, 0],
  [10, -20, -14],
  [7, -8, 22],
  [9, -5, 0],
  [11, -8, -22],
];

export const TRAIL_POINTS = 30;

export function makePlayers(): Player[] {
  const mk = (team: Player["team"], role: Role, num: number, x: number, z: number, phase: number): Player => ({
    team,
    role,
    num,
    bx: x,
    bz: z,
    phase,
    x,
    z,
    px: x,
    pz: z,
    speed: 0,
    trail: new Float32Array(TRAIL_POINTS * 2),
    trailLen: 0,
  });
  const ps: Player[] = [];
  formation.forEach(([num, x, z], i) => ps.push(mk("a", num === 1 ? "gk" : "out", num, x, z, i * 1.7)));
  formation.forEach(([num, x, z], i) => ps.push(mk("b", num === 1 ? "gk" : "out", num, -x, -z, i * 2.3 + 0.5)));
  ps.push(mk("ref", "ref", 0, 0, 10, 0));
  return ps;
}

/** Which team controls the ball at time t (for the possession panel). */
export function controllingTeam(t: number): "a" | "b" | null {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  if (tt >= REWIND_START) return null;
  return tt >= TURNOVER[0] && tt <= TURNOVER[1] ? "b" : "a";
}

export function stepPlayers(ps: Player[], t: number, ball: { x: number; z: number }, dt = 0) {
  const owner = controllingTeam(t);
  let nearestA = -1;
  let nearestB = -1;
  let dA = Infinity;
  let dB = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    p.px = p.x;
    p.pz = p.z;
    const wob = Math.sin(t * 0.9 + p.phase) * 0.9;
    const wobz = Math.cos(t * 0.7 + p.phase) * 0.7;
    if (p.team === "a") {
      const push = p.role === "gk" ? 0.12 : 0.55;
      p.x = Math.min(48, p.bx + 14 * (p.role === "gk" ? 0.2 : 1) + ball.x * push) + wob;
      p.z = p.bz * 0.92 + ball.z * (p.role === "gk" ? 0.05 : 0.22) + wobz;
    } else if (p.team === "b") {
      const push = p.role === "gk" ? 0.06 : 0.32;
      p.x = Math.min(HL - 1, Math.max(-20, p.bx - 6 * (p.role === "gk" ? 0 : 1) + ball.x * push)) + wob * 0.6;
      p.z = p.bz * 0.85 + ball.z * (p.role === "gk" ? 0.1 : 0.3) + wobz;
    } else {
      p.x = ball.x * 0.85 - 7 + wob;
      p.z = Math.max(-HW + 4, Math.min(HW - 4, ball.z * 0.4 + 12 + wobz));
    }
    if (p.role !== "out") continue;
    const d = Math.hypot(p.x - ball.x, p.z - ball.z);
    if (p.team === "a" && d < dA) {
      dA = d;
      nearestA = i;
    }
    if (p.team === "b" && d < dB) {
      dB = d;
      nearestB = i;
    }
  }
  // the team in control carries the ball; the nearest opponent presses
  const carry = owner === "b" ? nearestB : nearestA;
  const press = owner === "b" ? nearestA : nearestB;
  if (carry >= 0) {
    const p = ps[carry];
    const w = Math.pow(clamp01(1 - (owner === "b" ? dB : dA) / 18), 1.5);
    p.x = lerp(p.x, ball.x - (owner === "b" ? -0.9 : 0.9), w);
    p.z = lerp(p.z, ball.z - 0.4, w);
  }
  if (press >= 0) {
    const p = ps[press];
    const w = 0.55 * clamp01(1 - (owner === "b" ? dA : dB) / 16);
    p.x = lerp(p.x, ball.x + (owner === "b" ? -1.8 : 1.8), w);
    p.z = lerp(p.z, ball.z + 1.2, w);
  }
  if (dt > 0) for (const p of ps) p.speed = lerp(p.speed, Math.hypot(p.x - p.px, p.z - p.pz) / dt, 0.15);
}

/** Index of the player carrying the ball (nearest player of the controlling team), or -1. */
export function carrierIndex(ps: Player[], t: number, ball: { x: number; z: number }): number {
  const owner = controllingTeam(t);
  if (!owner) return -1;
  let best = -1;
  let bd = 3.5;
  ps.forEach((p, i) => {
    if (p.team !== owner || p.role !== "out") return;
    const d = Math.hypot(p.x - ball.x, p.z - ball.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function pushTrail(p: Player) {
  const n = TRAIL_POINTS;
  if (p.trailLen < n) {
    p.trail[p.trailLen * 2] = p.x;
    p.trail[p.trailLen * 2 + 1] = p.z;
    p.trailLen++;
  } else {
    p.trail.copyWithin(0, 2);
    p.trail[(n - 1) * 2] = p.x;
    p.trail[(n - 1) * 2 + 1] = p.z;
  }
}

// ---------------------------------------------------------------- heatmap + possession (precomputed)

const THERMAL: [number, [number, number, number]][] = [
  [0.0, [37, 99, 235]],
  [0.3, [6, 182, 212]],
  [0.5, [34, 197, 94]],
  [0.7, [250, 204, 21]],
  [0.85, [249, 115, 22]],
  [1.0, [220, 38, 38]],
];

function thermal(v: number): [number, number, number] {
  for (let i = 1; i < THERMAL.length; i++) {
    if (v <= THERMAL[i][0]) {
      const [a, ca] = THERMAL[i - 1];
      const [b, cb] = THERMAL[i];
      const t = (v - a) / (b - a);
      return [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
    }
  }
  return THERMAL[THERMAL.length - 1][1];
}

/** Thermal heatmap of one team over the passage, as in the reference player-analysis panel. */
export function buildHeatmap(team: "a" | "b"): HTMLCanvasElement {
  const W = 420;
  const H = Math.round((W * PITCH_W) / PITCH_L);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const ps = makePlayers();
  const ball = { x: 0, y: 0, z: 0 };
  const sx = W / PITCH_L;
  const r = 8 * sx;
  for (let t = 0; t < REWIND_START; t += 0.12) {
    ballAt(t, ball);
    stepPlayers(ps, t, ball);
    for (const p of ps) {
      if (p.team !== team || p.role === "gk") continue;
      const x = (p.x + HL) * sx;
      const y = (HW - p.z) * sx;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(0,0,0,0.1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const img = g.getImageData(0, 0, W, H);
  let max = 0;
  for (let i = 3; i < img.data.length; i += 4) max = Math.max(max, img.data[i]);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i + 3] / Math.max(1, max);
    // most of the pitch stays cool; only the most-used areas run hot
    const [r2, g2, b2] = thermal(Math.pow(v, 1.7));
    img.data[i] = r2;
    img.data[i + 1] = g2;
    img.data[i + 2] = b2;
    img.data[i + 3] = Math.round(255 * Math.min(0.72, smooth(0.08, 0.45, v) * 0.75));
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Share of the passage each team controlled the ball (excluding the restart). */
export function possessionShare(): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let t = 0; t < REWIND_START; t += 0.05) {
    const o = controllingTeam(t);
    if (o === "a") a++;
    else if (o === "b") b++;
  }
  return { a: a / (a + b), b: b / (a + b) };
}

/** Crowd texture for the far stand: muted dots under floodlights. */
export function buildCrowd(): CanvasPattern | null {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 80;
  const g = c.getContext("2d")!;
  g.fillStyle = C.stand;
  g.fillRect(0, 0, 160, 80);
  const tones = ["#1c2a38", "#243444", "#2c3d4f", "#3a4b5e", "#4b3d3a", "#1a3a5c", "#5a6878"];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = tones[Math.floor(rnd() * tones.length)];
    g.fillRect(Math.floor(rnd() * 160), Math.floor(rnd() * 80), 2, 2);
  }
  return g.createPattern(c, "repeat");
}

// ---------------------------------------------------------------- drawing

const P = { x: 0, y: 0, k: 0 };
const Q = { x: 0, y: 0, k: 0 };

function poly(g: CanvasRenderingContext2D, cam: Camera, pts: [number, number][], y = 0) {
  let started = false;
  for (const [x, z] of pts) {
    if (!project(cam, x, y, z, P)) {
      started = false;
      continue;
    }
    if (!started) {
      g.moveTo(P.x, P.y);
      started = true;
    } else g.lineTo(P.x, P.y);
  }
}

function poly3(g: CanvasRenderingContext2D, cam: Camera, pts: V3[]) {
  let first = true;
  for (const [x, y, z] of pts) {
    if (!project(cam, x, y, z, P)) continue;
    if (first) {
      g.moveTo(P.x, P.y);
      first = false;
    } else g.lineTo(P.x, P.y);
  }
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, n = 40): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

function quad(g: CanvasRenderingContext2D, cam: Camera, x0: number, z0: number, x1: number, z1: number) {
  g.beginPath();
  poly(g, cam, [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ]);
  g.closePath();
}

const PEN_ARC = Math.acos(5.5 / 9.15);

export function drawPitch(g: CanvasRenderingContext2D, cam: Camera, tilt: number, crowd: CanvasPattern | null) {
  const broadcast = 1 - smooth(0.2, 0.75, tilt);
  if (broadcast > 0) {
    g.globalAlpha = broadcast;
    g.fillStyle = C.grassOuter;
    quad(g, cam, -HL - 30, -HW - 40, HL + 30, HW + 7);
    g.fill();
    // far stand with crowd
    g.fillStyle = crowd ?? C.stand;
    g.beginPath();
    poly3(g, cam, [
      [-HL - 40, 1.2, HW + 7],
      [HL + 40, 1.2, HW + 7],
      [HL + 40, 60, HW + 30],
      [-HL - 40, 60, HW + 30],
    ]);
    g.closePath();
    g.fill();
    // advertising boards along the far touchline
    g.fillStyle = "#0d1d2a";
    g.beginPath();
    poly3(g, cam, [
      [-HL - 40, 0, HW + 5],
      [HL + 40, 0, HW + 5],
      [HL + 40, 1.2, HW + 5],
      [-HL - 40, 1.2, HW + 5],
    ]);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(32,199,133,0.85)";
    g.lineWidth = 1.5;
    g.beginPath();
    poly(
      g,
      cam,
      [
        [-HL - 40, HW + 5],
        [HL + 40, HW + 5],
      ],
      0.6
    );
    g.stroke();
    g.globalAlpha = 1;
  }
  const n = 14;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? C.grass2 : C.grass;
    quad(g, cam, -HL + (PITCH_L * i) / n, -HW, -HL + (PITCH_L * (i + 1)) / n, HW);
    g.fill();
  }
  g.strokeStyle = C.chalk;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = 1.6;
  g.beginPath();
  poly(g, cam, [
    [-HL, -HW],
    [HL, -HW],
    [HL, HW],
    [-HL, HW],
    [-HL, -HW],
  ]);
  poly(g, cam, [
    [0, -HW],
    [0, HW],
  ]);
  poly(g, cam, arc(0, 0, 9.15, 0, Math.PI * 2, 64));
  for (const side of [-1, 1]) {
    const gx = side * HL;
    poly(g, cam, [
      [gx, -20.16],
      [gx - side * 16.5, -20.16],
      [gx - side * 16.5, 20.16],
      [gx, 20.16],
    ]);
    poly(g, cam, [
      [gx, -9.16],
      [gx - side * 5.5, -9.16],
      [gx - side * 5.5, 9.16],
      [gx, 9.16],
    ]);
    const sx = gx - side * 11;
    poly(g, cam, side > 0 ? arc(sx, 0, 9.15, Math.PI - PEN_ARC, Math.PI + PEN_ARC, 20) : arc(sx, 0, 9.15, -PEN_ARC, PEN_ARC, 20));
  }
  g.stroke();
  g.fillStyle = C.chalk;
  for (const [x, z] of [
    [0, 0],
    [-HL + 11, 0],
    [HL - 11, 0],
  ]) {
    if (project(cam, x, 0, z, P)) {
      g.beginPath();
      g.arc(P.x, P.y, Math.max(1.4, 0.22 * P.k), 0, Math.PI * 2);
      g.fill();
    }
  }
  // goals stand up in the broadcast view and fold flat from above
  g.lineWidth = 2;
  g.beginPath();
  const h = 2.44 * (1 - smooth(0.3, 0.9, tilt));
  for (const side of [-1, 1]) {
    const gx = side * HL;
    poly3(g, cam, [
      [gx, 0, -3.66],
      [gx, h, -3.66],
      [gx, h, 3.66],
      [gx, 0, 3.66],
    ]);
  }
  g.stroke();
}

export interface Layers {
  /** 0..1 broadcast tracking graphics (rings + number pills), shown on the opening shot */
  tracking: number;
  /** 0..1 plain detection boxes */
  boxes: number;
  /** 0..1 boxes coloured by team */
  teams: number;
  /** 0..1 camera tilt to top-down */
  tilt: number;
  /** 0..1 trails */
  trails: number;
}

const kitShirt = (p: Player) => (p.team === "ref" ? C.refShirt : p.role === "gk" ? (p.team === "a" ? C.aKeeper : C.bKeeper) : p.team === "a" ? C.aShirt : C.bShirt);
const kitShorts = (p: Player) => (p.team === "a" ? C.aShorts : p.team === "b" ? C.bShorts : "#111827");
const overlay = (p: Player) => (p.team === "ref" ? C.ref : p.team === "a" ? C.a : C.b);

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string, font: string) {
  g.font = font;
  const w = g.measureText(text).width + 8;
  const h = 15;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - w / 2, y - h, w, h, 3);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x, y - h / 2 + 0.5);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}

export function drawTrails(g: CanvasRenderingContext2D, cam: Camera, ps: Player[], amount: number) {
  if (amount <= 0) return;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = 2;
  for (const p of ps) {
    if (p.team === "ref" || p.trailLen < 2) continue;
    g.strokeStyle = overlay(p);
    g.globalAlpha = 0.65 * amount;
    g.beginPath();
    let first = true;
    for (let i = 0; i < p.trailLen; i++) {
      if (!project(cam, p.trail[i * 2], 0, p.trail[i * 2 + 1], P)) continue;
      if (first) {
        g.moveTo(P.x, P.y);
        first = false;
      } else g.lineTo(P.x, P.y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

export function drawPlayers(g: CanvasRenderingContext2D, cam: Camera, ps: Player[], L: Layers, fonts: { ui: string; hud: string }, carrier: number) {
  const standing = 1 - smooth(0.15, 0.7, L.tilt);
  const dot = smooth(0.45, 0.95, L.tilt);
  const order = ps.map((_, i) => i).sort((i, j) => ps[j].z - ps[i].z);
  // ground rings first, so bodies stand on them
  if (L.tracking > 0 && standing > 0.02) {
    g.lineWidth = 2;
    for (const i of order) {
      const p = ps[i];
      if (p.team === "ref" || !project(cam, p.x, 0, p.z, P)) continue;
      const rx = Math.max(5, 0.75 * P.k);
      g.globalAlpha = L.tracking * standing;
      g.strokeStyle = overlay(p);
      g.beginPath();
      g.ellipse(P.x, P.y, rx, rx * 0.36, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  for (const i of order) {
    const p = ps[i];
    if (!project(cam, p.x, 0, p.z, P)) continue;
    const k = P.k;
    const fx = P.x;
    const fy = P.y;
    if (standing > 0.02) {
      project(cam, p.x, 1.82 * standing, p.z, Q);
      const hx = Q.x;
      const hy = Q.y;
      const bw = Math.max(2.2, 0.55 * k);
      const hgt = fy - hy;
      g.globalAlpha = standing;
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(fx + bw * 0.6, fy, bw * 0.95, bw * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = kitShorts(p);
      g.fillRect(fx - bw / 2, fy - hgt * 0.5, bw, hgt * 0.5);
      g.fillStyle = kitShirt(p);
      g.fillRect(fx - bw / 2, hy + hgt * 0.16, bw, hgt * 0.38);
      g.fillStyle = C.skin;
      g.beginPath();
      g.arc(hx, hy + hgt * 0.08, Math.max(1, bw * 0.32), 0, Math.PI * 2);
      g.fill();

      // broadcast tracking label above the head
      if (L.tracking > 0 && p.team !== "ref" && hgt > 10) {
        g.globalAlpha = L.tracking * standing;
        pill(g, hx, hy - 4, String(p.num), overlay(p), "#fff", `700 11px ${fonts.ui}`);
      }

      // detection boxes: white while they're only "a person", team colour once assigned
      if (L.boxes > 0) {
        const pad = Math.max(1.5, bw * 0.25);
        const x0 = fx - bw / 2 - pad;
        const y0 = hy - pad;
        const w = bw + pad * 2;
        const h = hgt + pad * 1.6;
        const isRef = p.team === "ref";
        g.globalAlpha = standing * L.boxes;
        g.lineWidth = 1.5;
        g.setLineDash(isRef && L.teams > 0.5 ? [4, 3] : []);
        g.strokeStyle = L.teams > 0.5 ? overlay(p) : "#FFFFFF";
        g.strokeRect(x0, y0, w, h);
        g.setLineDash([]);
        if (h > 20) {
          const label =
            isRef && L.teams > 0.5 ? "Referee, excluded" : L.teams > 0.5 ? `${p.team === "a" ? "Blue" : "White"} ${p.num}` : `person ${(0.72 + ((p.num * 37 + (p.team === "b" ? 11 : 0)) % 25) / 100).toFixed(2)}`;
          g.font = `600 11px ${fonts.ui}`;
          const tw = g.measureText(label).width + 8;
          g.fillStyle = L.teams > 0.5 ? overlay(p) : "#FFFFFF";
          g.fillRect(x0, y0 - 15, tw, 15);
          g.fillStyle = L.teams > 0.5 && !isRef ? "#FFFFFF" : C.navy;
          g.fillText(label, x0 + 4, y0 - 4);
        }
      }
      g.globalAlpha = 1;
    }
    if (dot > 0.02 && p.team !== "ref") {
      const r = Math.max(5, 1.2 * k);
      g.globalAlpha = dot;
      g.fillStyle = overlay(p);
      g.beginPath();
      g.arc(fx, fy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = 1.5;
      g.stroke();
      if (r >= 8) {
        g.fillStyle = "#fff";
        g.font = `700 ${Math.round(r * 1.05)}px ${fonts.hud}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(p.num), fx, fy + 0.5);
        g.textAlign = "start";
        g.textBaseline = "alphabetic";
      }
      g.globalAlpha = 1;
    }
  }
  // speed tag on the ball carrier, as in the broadcast reference
  if (carrier >= 0 && L.tracking > 0 && standing > 0.3) {
    const p = ps[carrier];
    if (project(cam, p.x, 0, p.z, P)) {
      g.globalAlpha = L.tracking * standing;
      const text = `Speed: ${Math.min(9.4, p.speed).toFixed(1)} m/s`;
      g.font = `600 12px ${fonts.ui}`;
      const tw = g.measureText(text).width + 12;
      const x = P.x - tw - 12;
      const y = P.y - 8;
      g.fillStyle = "rgba(7,19,29,0.82)";
      g.beginPath();
      g.roundRect(x, y - 18, tw, 20, 4);
      g.fill();
      g.fillStyle = "#fff";
      g.fillText(text, x + 6, y - 4);
      g.globalAlpha = 1;
    }
  }
}

/** Ball trail entries are (x, y, z) triples. */
export function drawBall(g: CanvasRenderingContext2D, cam: Camera, ball: { x: number; y: number; z: number }, trail: Float32Array, trailLen: number, L: Layers) {
  const trailAlpha = Math.min(1, L.tracking + L.trails);
  if (trailLen > 1 && trailAlpha > 0) {
    g.globalAlpha = trailAlpha * 0.85;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 2;
    g.setLineDash([5, 5]);
    g.beginPath();
    let first = true;
    for (let i = 0; i < trailLen; i++) {
      if (!project(cam, trail[i * 3], trail[i * 3 + 1] * (1 - L.tilt), trail[i * 3 + 2], P)) continue;
      if (first) {
        g.moveTo(P.x, P.y);
        first = false;
      } else g.lineTo(P.x, P.y);
    }
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
  if (!project(cam, ball.x, 0, ball.z, P)) return;
  const sx = P.x;
  const sy = P.y;
  const k = P.k;
  if (!project(cam, ball.x, ball.y, ball.z, Q)) return;
  const top = smooth(0.45, 0.95, L.tilt);
  const r = Math.max(2.6, lerp(0.22, 0.75, top) * k);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.beginPath();
  g.ellipse(sx, sy, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  const bx = lerp(Q.x, sx, top);
  const by = lerp(Q.y - r, sy, top);
  g.fillStyle = L.tracking > 0.5 || top > 0.5 ? C.ball : "#FFFFFF";
  g.strokeStyle = C.navy;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(bx, by, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (L.boxes > 0 && top < 0.9) {
    g.globalAlpha = L.boxes * (1 - top);
    g.strokeStyle = C.ball;
    g.lineWidth = 1.5;
    const s = r + 4;
    g.strokeRect(bx - s, by - s, s * 2, s * 2);
    g.globalAlpha = 1;
  }
}

export function drawHeat(g: CanvasRenderingContext2D, cam: Camera, heat: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return;
  if (!project(cam, -HL, 0, HW, P) || !project(cam, HL, 0, -HW, Q)) return;
  g.globalAlpha = amount;
  g.drawImage(heat, P.x, P.y, Q.x - P.x, Q.y - P.y);
  g.globalAlpha = 1;
}

/** Mini-map inset (team_track reference): a flat pitch with team dots. */
export function drawMinimap(g: CanvasRenderingContext2D, ps: Player[], ball: { x: number; z: number }, x: number, y: number, w: number, alpha: number) {
  if (alpha <= 0) return;
  const h = (w * PITCH_W) / PITCH_L;
  const sx = w / PITCH_L;
  g.globalAlpha = alpha;
  g.fillStyle = "rgba(7,19,29,0.6)";
  g.beginPath();
  g.roundRect(x - 6, y - 6, w + 12, h + 12, 8);
  g.fill();
  g.fillStyle = "rgba(31,122,67,0.95)";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, y + h);
  g.stroke();
  g.beginPath();
  g.arc(x + w / 2, y + h / 2, 9.15 * sx, 0, Math.PI * 2);
  g.stroke();
  for (const side of [0, 1]) {
    const bx = side ? x + w - 16.5 * sx : x;
    g.strokeRect(bx, y + (HW - 20.16) * sx, 16.5 * sx, 40.32 * sx);
  }
  for (const p of ps) {
    if (p.team === "ref") continue;
    g.fillStyle = overlay(p);
    g.beginPath();
    g.arc(x + (p.x + HL) * sx, y + (HW - p.z) * sx, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = C.ball;
  g.beginPath();
  g.arc(x + (ball.x + HL) * sx, y + (HW - ball.z) * sx, 2.4, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}
