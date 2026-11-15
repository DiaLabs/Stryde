import type { WorkerFrameRecord } from "../types";
import type { BallCandidate, PersonDetection } from "../vision/frame";
import { AssociationTracker, type TrackerInput } from "../vision/tracker";

/**
 * Detection policy: which person detections count as on-pitch players and which ball
 * candidates are kept, applied offline to the per-frame features recorded by the worker.
 */
export interface DetectionPolicy {
  people: {
    minHeight: number;
    minWidth: number;
    minAspect: number;
    maxAspect: number;
    maxHeight: number;
    minFeetGrass: number;
  };
  ball: {
    maxWidth: number;
    maxHeight: number;
    minAspect: number;
    maxAspect: number;
    minGrass: number;
    /** candidates above this score skip the grass check */
    strongScore: number;
    /** legacy: candidates in the top half of the frame skip the grass check */
    topHalfBypass: boolean;
    /** how many candidates per frame reach ball tracking */
    keep: number;
  };
}

/** Exactly what the worker did before Phase 1 (kept for baseline comparisons). */
export const LEGACY_POLICY: DetectionPolicy = {
  people: { minHeight: 0.025, minWidth: 0.004, minAspect: 0.9, maxAspect: 5.5, maxHeight: 0.6, minFeetGrass: 0.2 },
  ball: { maxWidth: 0.048, maxHeight: 0.065, minAspect: 0.45, maxAspect: 2.2, minGrass: 0.1, strongScore: 0.22, topHalfBypass: true, keep: 1 },
};

export const DEFAULT_POLICY: DetectionPolicy = LEGACY_POLICY;

export function selectPeople(people: PersonDetection[], policy: DetectionPolicy = DEFAULT_POLICY): PersonDetection[] {
  const p = policy.people;
  return people.filter((d) => {
    const b = d.box;
    if (b.height < p.minHeight || b.width < p.minWidth || b.height > p.maxHeight) return false;
    const aspect = b.height / Math.max(1e-4, b.width);
    if (aspect < p.minAspect || aspect > p.maxAspect) return false;
    return d.grass >= p.minFeetGrass;
  });
}

export function selectBallCandidates(balls: BallCandidate[], policy: DetectionPolicy = DEFAULT_POLICY): BallCandidate[] {
  const p = policy.ball;
  return balls
    .filter((d) => {
      const b = d.box;
      if (b.width > p.maxWidth || b.height > p.maxHeight) return false;
      const ar = b.width / Math.max(1e-4, b.height);
      if (ar < p.minAspect || ar > p.maxAspect) return false;
      const cy = b.y + b.height / 2;
      if (d.confidence >= p.strongScore) return true;
      if (p.topHalfBypass && cy < 0.5) return true;
      return d.grass >= p.minGrass;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, p.keep);
}

/** True when the frames carry raw per-frame features (recorded by the current worker). */
export function hasDetectionFeatures(frames: WorkerFrameRecord[]): boolean {
  return frames.length > 0 && frames.every((f) => Array.isArray(f.people) && Array.isArray(f.ballCandidates));
}

/**
 * Rebuild `players` (with track ids) and `balls` from recorded features. Frames must be in
 * time order. Older recordings without features are returned unchanged.
 */
export function prepareFrames(frames: WorkerFrameRecord[], policy: DetectionPolicy = DEFAULT_POLICY): WorkerFrameRecord[] {
  if (!hasDetectionFeatures(frames)) return frames;
  const tracker = new AssociationTracker();
  return frames.map((f) => {
    const people = selectPeople(f.people!, policy);
    const inputs: TrackerInput[] = people.map((d) => ({ box: d.box, confidence: d.confidence, color: d.color }));
    const ids = tracker.update(inputs, f.timestampSeconds, f.motionX, f.motionY, f.sceneCut);
    const balls = selectBallCandidates(f.ballCandidates!, policy);
    return {
      ...f,
      players: people.map((d, i) => ({ trackId: ids[i], box: d.box, confidence: d.confidence, color: d.color })).filter((p) => p.trackId > 0),
      balls: balls.map((b) => ({ box: b.box, confidence: b.confidence })),
    };
  });
}
