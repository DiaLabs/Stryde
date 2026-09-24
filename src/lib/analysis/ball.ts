import type { BallObservation, FrameSummary, WorkerFrameRecord } from "../types";
import type { PitchMapper } from "./tracks";

interface StabilizedBall {
  b: { box: BallObservation["box"]; confidence: number };
  x: number;
  y: number;
  sx: number;
  sy: number;
}

interface TrackState {
  sx: number;
  sy: number;
  t: number;
  vx: number;
  vy: number;
}

function stabilizedCandidates(f: WorkerFrameRecord, s: FrameSummary, aspect: number): StabilizedBall[] {
  return f.balls.map((b) => {
    const x = b.box.x + b.box.width / 2;
    const y = b.box.y + b.box.height / 2;
    return { b, x, y, sx: x + s.cameraX, sy: (y + s.cameraY) / aspect };
  });
}

function predict(state: TrackState, t: number): { sx: number; sy: number; dt: number } {
  const dt = Math.max(0, t - state.t);
  return { sx: state.sx + state.vx * dt, sy: state.sy + state.vy * dt, dt };
}

function updateState(state: TrackState, sx: number, sy: number, t: number): TrackState {
  const dt = t - state.t;
  if (dt <= 0) return { sx, sy, t, vx: state.vx, vy: state.vy };
  const vx = dt < 1.2 ? state.vx * 0.35 + ((sx - state.sx) / dt) * 0.65 : (sx - state.sx) / dt;
  const vy = dt < 1.2 ? state.vy * 0.35 + ((sy - state.sy) / dt) * 0.65 : (sy - state.sy) / dt;
  return { sx, sy, t, vx, vy };
}

function pickCandidate(cands: StabilizedBall[], state: TrackState | null, t: number): StabilizedBall | null {
  if (!cands.length) return null;
  if (!state) return cands.sort((a, b) => b.b.confidence - a.b.confidence)[0] ?? null;

  const { sx: px, sy: py, dt } = predict(state, t);
  const maxJump = 0.05 + 1.35 * dt;
  let best: StabilizedBall | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    const toPred = Math.hypot(c.sx - px, c.sy - py);
    const toLast = Math.hypot(c.sx - state.sx, c.sy - state.sy);
    const d = Math.min(toPred, toLast);
    if (d > maxJump) continue;
    const score = d / maxJump - c.b.confidence * 0.85 - (c.b.confidence >= 0.2 ? 0.08 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best) return best;
  const strong = cands.filter((c) => c.b.confidence >= 0.22).sort((a, b) => b.b.confidence - a.b.confidence)[0];
  if (strong && Math.hypot(strong.sx - state.sx, strong.sy - state.sy) <= maxJump * 1.35) return strong;
  return null;
}

function toObservation(
  pick: StabilizedBall,
  f: WorkerFrameRecord,
  fi: number,
  mapper: PitchMapper
): BallObservation & { sx: number; sy: number } {
  const p = mapper.method === "homography" ? mapper.map(fi, pick.x, pick.b.box.y + pick.b.box.height) : null;
  return {
    frameIndex: f.frameIndex,
    timestampSeconds: f.timestampSeconds,
    x: pick.x,
    y: pick.y,
    box: pick.b.box,
    confidence: pick.b.confidence,
    pitchX: p?.x,
    pitchY: p?.y,
    sx: pick.sx,
    sy: pick.sy,
  };
}

/** Forward pass with velocity prediction in camera-stabilized space. */
function forwardTrack(
  frames: WorkerFrameRecord[],
  summaries: FrameSummary[],
  mapper: PitchMapper,
  aspect: number
): Map<number, BallObservation & { sx: number; sy: number }> {
  const out = new Map<number, BallObservation & { sx: number; sy: number }>();
  let state: TrackState | null = null;
  frames.forEach((f, fi) => {
    const s = summaries[fi];
    if (s.sceneCut) state = null;
    const pick = pickCandidate(stabilizedCandidates(f, s, aspect), state, f.timestampSeconds);
    if (!pick) return;
    const obs = toObservation(pick, f, fi, mapper);
    out.set(f.frameIndex, obs);
    state = updateState(state ?? { sx: pick.sx, sy: pick.sy, t: f.timestampSeconds, vx: 0, vy: 0 }, pick.sx, pick.sy, f.timestampSeconds);
  });
  return out;
}

/** Fill 1–2 frame gaps when raw detections exist and neighbors agree. */
function gapFill(
  tracked: Map<number, BallObservation & { sx: number; sy: number }>,
  frames: WorkerFrameRecord[],
  summaries: FrameSummary[],
  mapper: PitchMapper,
  aspect: number
): Map<number, BallObservation & { sx: number; sy: number }> {
  const out = new Map(tracked);
  for (let fi = 0; fi < frames.length; fi++) {
    const f = frames[fi];
    if (out.has(f.frameIndex) || !f.balls.length) continue;
    const s = summaries[fi];
    let prev: (BallObservation & { sx: number; sy: number }) | null = null;
    let next: (BallObservation & { sx: number; sy: number }) | null = null;
    for (let j = fi - 1; j >= 0; j--) {
      const o = out.get(frames[j].frameIndex);
      if (o) {
        prev = o;
        break;
      }
    }
    for (let j = fi + 1; j < frames.length; j++) {
      const o = out.get(frames[j].frameIndex);
      if (o) {
        next = o;
        break;
      }
    }
    if (!prev && !next) continue;
    const anchor = prev && next ? (prev.timestampSeconds - f.timestampSeconds <= f.timestampSeconds - next.timestampSeconds ? prev : next) : prev ?? next!;
    const dt = Math.abs(f.timestampSeconds - anchor.timestampSeconds);
    if (dt > 0.55) continue;
    const cands = stabilizedCandidates(f, s, aspect);
    const maxJump = 0.045 + 1.1 * dt;
    let best: StabilizedBall | null = null;
    let bestScore = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.sx - anchor.sx, c.sy - anchor.sy);
      if (d > maxJump) continue;
      if (prev && next) {
        const lineD =
          Math.abs((next.sy - prev.sy) * c.sx - (next.sx - prev.sx) * c.sy + next.sx * prev.sy - next.sy * prev.sx) /
          (Math.hypot(next.sy - prev.sy, next.sx - prev.sx) + 1e-6);
        if (lineD > maxJump * 0.9) continue;
      }
      const score = d / maxJump - c.b.confidence;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && best.b.confidence >= 0.12) out.set(f.frameIndex, toObservation(best, f, fi, mapper));
  }
  return out;
}

/**
 * Choose at most one ball per sampled frame using temporal consistency in
 * camera-stabilized image space. Weak isolated detections are discarded rather
 * than trusted; no positions are interpolated.
 */
export function selectBall(
  frames: WorkerFrameRecord[],
  summaries: FrameSummary[],
  mapper: PitchMapper,
  aspect: number
): BallObservation[] {
  let tracked = forwardTrack(frames, summaries, mapper, aspect);
  tracked = gapFill(tracked, frames, summaries, mapper, aspect);

  const chosen = frames
    .map((f) => tracked.get(f.frameIndex))
    .filter((c): c is BallObservation & { sx: number; sy: number } => !!c);

  const consistent = chosen.filter((c, i) => {
    if (c.confidence >= 0.18) return true;
    const near = (j: number) => {
      const o = chosen[j];
      if (!o) return false;
      const dt = Math.abs(o.timestampSeconds - c.timestampSeconds);
      return dt <= 0.9 && Math.hypot(o.sx - c.sx, o.sy - c.sy) <= 0.055 + 1.2 * dt;
    };
    return near(i - 1) || near(i + 1);
  });

  const seen = new Set<number>();
  return consistent
    .filter((c) => {
      if (seen.has(c.frameIndex)) return false;
      seen.add(c.frameIndex);
      return true;
    })
    .map((c) => ({
      frameIndex: c.frameIndex,
      timestampSeconds: c.timestampSeconds,
      x: c.x,
      y: c.y,
      box: c.box,
      confidence: c.confidence,
      pitchX: c.pitchX,
      pitchY: c.pitchY,
    }));
}
