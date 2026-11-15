import type { BoundingBox } from "../types";
import type { BallCandidate, PersonDetection } from "./frame";
import type { RawDetection } from "./yolo";

/*
 * Zoomed ball pass. At broadcast scale the ball is a few pixels wide and the full-frame
 * detector misses it most of the time. A second detector run on a crop around where the ball
 * probably is (last confident position, else the centre of the players) sees it ~2.5x bigger.
 * Pure helpers shared by the browser worker and the Node eval harness.
 */

export const BALL_CROP = {
  /** crop side as a fraction of the frame width (square crop) */
  sideFraction: 0.42,
  /** a confident ball (either pass) becomes the next crop centre */
  trackScore: 0.25,
  /** how long a remembered ball position steers the crop */
  memorySeconds: 1.2,
  /** skip the crop pass when the full-frame pass already has a ball this confident */
  skipIfFullFrameScore: 0.45,
  /** detector threshold for ball boxes inside the crop */
  threshold: 0.08,
};

export interface CropRect {
  /** pixels in the source frame */
  x: number;
  y: number;
  side: number;
}

export interface BallCropState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

/** Where to look: predicted ball position, else the median of the on-pitch players. */
export function cropCenter(state: BallCropState | null, t: number, people: PersonDetection[]): { x: number; y: number } | null {
  if (state && t - state.t <= BALL_CROP.memorySeconds) {
    const dt = Math.min(0.4, t - state.t);
    return { x: state.x + state.vx * dt, y: state.y + state.vy * dt };
  }
  const onPitch = people.filter((p) => p.grass >= 0.2);
  if (!onPitch.length) return null;
  const xs = onPitch.map((p) => p.box.x + p.box.width / 2).sort((a, b) => a - b);
  const ys = onPitch.map((p) => p.box.y + p.box.height).sort((a, b) => a - b);
  return { x: xs[xs.length >> 1], y: ys[ys.length >> 1] };
}

export function cropRect(center: { x: number; y: number }, W: number, H: number): CropRect {
  const side = Math.min(H, Math.round(BALL_CROP.sideFraction * W));
  const x = Math.round(Math.min(W - side, Math.max(0, center.x * W - side / 2)));
  const y = Math.round(Math.min(H - side, Math.max(0, center.y * H - side / 2)));
  return { x, y, side };
}

/** Map detections normalised to the crop back to frame-normalised boxes. */
export function cropToFrame(box: BoundingBox, rect: CropRect, W: number, H: number): BoundingBox {
  return {
    x: (rect.x + box.x * rect.side) / W,
    y: (rect.y + box.y * rect.side) / H,
    width: (box.width * rect.side) / W,
    height: (box.height * rect.side) / H,
  };
}

/** Merge crop-pass balls into the full-frame candidates (dedupe near-identical boxes, keep the higher score). */
export function mergeBallCandidates(full: BallCandidate[], crop: BallCandidate[], maxOut = 8): BallCandidate[] {
  const out = [...full];
  for (const c of crop) {
    const cx = c.box.x + c.box.width / 2;
    const cy = c.box.y + c.box.height / 2;
    const dup = out.findIndex((o) => Math.hypot(o.box.x + o.box.width / 2 - cx, o.box.y + o.box.height / 2 - cy) < 0.012);
    if (dup >= 0) {
      if (c.confidence > out[dup].confidence) out[dup] = c;
    } else out.push(c);
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, maxOut);
}

/** Update the crop steering state from this frame's most confident ball, if any. */
export function updateCropState(state: BallCropState | null, balls: BallCandidate[], t: number): BallCropState | null {
  const best = balls.find((b) => b.confidence >= BALL_CROP.trackScore);
  if (!best) return state && t - state.t <= BALL_CROP.memorySeconds ? state : null;
  const x = best.box.x + best.box.width / 2;
  const y = best.box.y + best.box.height / 2;
  if (state && t - state.t <= BALL_CROP.memorySeconds && t > state.t) {
    const dt = t - state.t;
    return { x, y, vx: 0.5 * state.vx + 0.5 * ((x - state.x) / dt), vy: 0.5 * state.vy + 0.5 * ((y - state.y) / dt), t };
  }
  return { x, y, vx: 0, vy: 0, t };
}

/** True when the crop pass is worth running for this frame. */
export function needsCropPass(fullFrameBalls: RawDetection[]): boolean {
  return !fullFrameBalls.some((b) => b.score >= BALL_CROP.skipIfFullFrameScore);
}
