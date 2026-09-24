import type { BallObservation, FrameSummary, WorkerFrameRecord } from "../types";
import type { PitchMapper } from "./tracks";

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
  const chosen: (BallObservation & { sx: number; sy: number })[] = [];
  let last: { sx: number; sy: number; t: number } | null = null;
  frames.forEach((f, fi) => {
    const s = summaries[fi];
    if (s.sceneCut) last = null;
    if (!f.balls.length) return;
    const cands = f.balls.map((b) => {
      const x = b.box.x + b.box.width / 2;
      const y = b.box.y + b.box.height / 2;
      return { b, x, y, sx: x + s.cameraX, sy: (y + s.cameraY) / aspect };
    });
    let pick: (typeof cands)[number] | null = null;
    if (last && f.timestampSeconds - last.t <= 0.8) {
      const dt = f.timestampSeconds - last.t;
      const maxJump = 0.06 + 1.1 * dt;
      let bestScore = Infinity;
      for (const c of cands) {
        const d = Math.hypot(c.sx - last.sx, c.sy - last.sy);
        if (d > maxJump) continue;
        const score = d / maxJump - c.b.confidence;
        if (score < bestScore) {
          bestScore = score;
          pick = c;
        }
      }
      if (!pick) {
        const strong = cands.filter((c) => c.b.confidence >= 0.35).sort((a, b) => b.b.confidence - a.b.confidence)[0];
        if (strong) pick = strong;
      }
    } else {
      pick = cands.sort((a, b) => b.b.confidence - a.b.confidence)[0];
    }
    if (!pick) return;
    const p = mapper.method === "homography" ? mapper.map(fi, pick.x, pick.b.box.y + pick.b.box.height) : null;
    chosen.push({
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
    });
    last = { sx: pick.sx, sy: pick.sy, t: f.timestampSeconds };
  });

  // Remove weak detections without a consistent neighbor within 1 s.
  const consistent = chosen.filter((c, i) => {
    if (c.confidence >= 0.3) return true;
    const near = (j: number) => {
      const o = chosen[j];
      if (!o) return false;
      const dt = Math.abs(o.timestampSeconds - c.timestampSeconds);
      return dt <= 1 && Math.hypot(o.sx - c.sx, o.sy - c.sy) <= 0.06 + 1.1 * dt;
    };
    return near(i - 1) || near(i + 1);
  });
  return consistent.map((c) => ({
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
