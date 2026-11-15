import type { BallObservation, FrameSummary, WorkerFrameRecord } from "../types";
import type { PitchMapper } from "./tracks";

/*
 * Ball tracking: choose at most one ball per sampled frame by finding the globally cheapest
 * path through all candidates of all frames (dynamic programming / Viterbi). Working offline on
 * the whole clip lets a weak but consistent detection beat a strong one-frame false positive
 * (a head, a sock, the penalty spot), which a greedy frame-by-frame choice cannot do.
 *
 * Costs (lower is better; every frame is either a chosen candidate or a miss):
 *   unary     -confidence reward, plus a penalty when a weak candidate has no grass around it
 *   transition  squared, gated, camera-stabilised displacement minus a continuity bonus
 *   skip      small cost per frame skipped inside a run (the detector missed the ball)
 *   restart   cost of starting a new run, so isolated weak detections are not worth taking
 * Short gaps inside a run are then filled by linear interpolation and flagged `interpolated`.
 */

export const BALL_PARAMS = {
  /** reward per unit of detector confidence */
  confWeight: 4,
  /** base cost of any candidate (makes very weak candidates net-neutral) */
  unaryBase: 0.15,
  /** weak candidates (< strongScore) without grass around them */
  noGrassPenalty: 0.6,
  minGrass: 0.1,
  strongScore: 0.22,
  restartCost: 0.6,
  skipCost: 0.12,
  continuityBonus: 0.25,
  transitionWeight: 0.8,
  /** gating: max stabilised jump (frame widths) = jumpBase + jumpPerSecond * dt */
  jumpBase: 0.05,
  jumpPerSecond: 1.35,
  /** how far back (seconds) a run may bridge missing detections */
  maxBridgeSeconds: 0.9,
  /** gaps up to this long inside a run are interpolated */
  maxInterpolateSeconds: 0.6,
};

interface Cand {
  fi: number;
  box: BallObservation["box"];
  confidence: number;
  grass?: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

function candidates(f: WorkerFrameRecord, s: FrameSummary, fi: number, aspect: number): Cand[] {
  return f.balls.map((b) => {
    const x = b.box.x + b.box.width / 2;
    const y = b.box.y + b.box.height / 2;
    return { fi, box: b.box, confidence: b.confidence, grass: b.grass, x, y, sx: x + s.cameraX, sy: (y + s.cameraY) / aspect };
  });
}

function unary(c: Cand, P = BALL_PARAMS): number {
  let u = P.unaryBase - P.confWeight * c.confidence;
  // no grass around it: stands, boards, TV graphics. Strong detections are penalised less (a
  // ball in the air), never exempt (a confident false ball on the advertising boards is common).
  // The penalty grows with confidence up to 0.45 so only a very confident detection (a ball in
  // the air above the stands' edge) can outweigh it.
  if (c.grass !== undefined && c.grass < P.minGrass) u += P.noGrassPenalty + P.confWeight * 0.8 * Math.min(c.confidence, 0.45);
  return u;
}

function transition(a: Cand, b: Cand, dt: number, P = BALL_PARAMS): number {
  const d = Math.hypot(b.sx - a.sx, b.sy - a.sy);
  const maxJump = P.jumpBase + P.jumpPerSecond * dt;
  if (d > maxJump) return Infinity;
  const r = d / maxJump;
  return P.transitionWeight * r * r - P.continuityBonus;
}

/**
 * Cheapest path, in time order. State 0 at a frame means "no ball"; state k > 0 is candidate
 * k - 1. Every state keeps a back-pointer (frame, state); a pointer that jumps back more than one
 * frame bridges frames whose ball was missed by the detector.
 */
function bestPath(frames: WorkerFrameRecord[], summaries: FrameSummary[], cands: Cand[][], P = BALL_PARAMS): Cand[] {
  const n = frames.length;
  const times = frames.map((f) => f.timestampSeconds);
  const cost: Float64Array[] = cands.map((cs) => new Float64Array(cs.length + 1));
  const ptrF: Int32Array[] = cands.map((cs) => new Int32Array(cs.length + 1).fill(-1));
  const ptrS: Int32Array[] = cands.map((cs) => new Int32Array(cs.length + 1));

  for (let i = 0; i < n; i++) {
    // "no ball" at i: best state of the previous frame
    if (i === 0) cost[0][0] = 0;
    else {
      let best = Infinity;
      let arg = 0;
      for (let s = 0; s < cost[i - 1].length; s++) {
        if (cost[i - 1][s] < best) {
          best = cost[i - 1][s];
          arg = s;
        }
      }
      cost[i][0] = best;
      ptrF[i][0] = i - 1;
      ptrS[i][0] = arg;
    }

    for (let k = 0; k < cands[i].length; k++) {
      const c = cands[i][k];
      // start a run (after "no ball" at i-1, or at the very first frame)
      let best = (i > 0 ? cost[i - 1][0] : 0) + P.restartCost;
      let bf = i > 0 ? i - 1 : -1;
      let bs = 0;
      // continue a run from a candidate up to maxBridgeSeconds back, never across a scene cut
      for (let j = i - 1; j >= 0 && times[i] - times[j] <= P.maxBridgeSeconds + 1e-6; j--) {
        if (summaries[j + 1].sceneCut) break;
        const dt = times[i] - times[j];
        const skipped = i - j - 1;
        for (let q = 0; q < cands[j].length; q++) {
          const tr = transition(cands[j][q], c, dt, P);
          if (!Number.isFinite(tr)) continue;
          const v = cost[j][q + 1] + tr + skipped * P.skipCost;
          if (v < best) {
            best = v;
            bf = j;
            bs = q + 1;
          }
        }
      }
      cost[i][k + 1] = best + unary(c, P);
      ptrF[i][k + 1] = bf;
      ptrS[i][k + 1] = bs;
    }
  }

  let s = 0;
  for (let k = 1; k < cost[n - 1].length; k++) if (cost[n - 1][k] < cost[n - 1][s]) s = k;
  const path: Cand[] = [];
  let i = n - 1;
  while (i >= 0) {
    if (s > 0) path.push(cands[i][s - 1]);
    const pi = ptrF[i][s];
    const ps = ptrS[i][s];
    i = pi;
    s = ps;
  }
  return path.reverse();
}

function toObservation(c: Cand, f: WorkerFrameRecord, mapper: PitchMapper, extra?: Partial<BallObservation>): BallObservation {
  const p = mapper.method === "homography" ? mapper.map(c.fi, c.x, c.box.y + c.box.height) : null;
  return {
    frameIndex: f.frameIndex,
    timestampSeconds: f.timestampSeconds,
    x: c.x,
    y: c.y,
    box: c.box,
    confidence: c.confidence,
    pitchX: p?.x,
    pitchY: p?.y,
    ...extra,
  };
}

export function selectBall(frames: WorkerFrameRecord[], summaries: FrameSummary[], mapper: PitchMapper, aspect: number, P = BALL_PARAMS): BallObservation[] {
  if (!frames.length) return [];
  const cands = frames.map((f, fi) => candidates(f, summaries[fi], fi, aspect));
  const path = bestPath(frames, summaries, cands, P);

  const out: BallObservation[] = [];
  for (let k = 0; k < path.length; k++) {
    const a = path[k];
    out.push(toObservation(a, frames[a.fi], mapper));
    const b = path[k + 1];
    if (!b || b.fi === a.fi + 1) continue;
    // interpolate a short gap inside a run (no scene cut between)
    const dt = frames[b.fi].timestampSeconds - frames[a.fi].timestampSeconds;
    if (dt > P.maxInterpolateSeconds) continue;
    let cut = false;
    for (let j = a.fi + 1; j <= b.fi; j++) if (summaries[j].sceneCut) cut = true;
    if (cut) continue;
    const maxJump = P.jumpBase + P.jumpPerSecond * dt;
    if (Math.hypot(b.sx - a.sx, b.sy - a.sy) > maxJump) continue; // two separate runs, not one
    for (let j = a.fi + 1; j < b.fi; j++) {
      const u = (frames[j].timestampSeconds - frames[a.fi].timestampSeconds) / dt;
      const sx = a.sx + (b.sx - a.sx) * u;
      const sy = a.sy + (b.sy - a.sy) * u;
      const s = summaries[j];
      const x = sx - s.cameraX;
      const y = sy * aspect - s.cameraY;
      const w = (a.box.width + b.box.width) / 2;
      const h = (a.box.height + b.box.height) / 2;
      const c: Cand = { fi: j, box: { x: x - w / 2, y: y - h / 2, width: w, height: h }, confidence: Math.min(a.confidence, b.confidence) * 0.5, x, y, sx, sy };
      out.push(toObservation(c, frames[j], mapper, { interpolated: true }));
    }
  }
  return out.sort((p, q) => p.timestampSeconds - q.timestampSeconds);
}
