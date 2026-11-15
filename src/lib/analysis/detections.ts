import type { LabColor, WorkerFrameRecord } from "../types";
import { deltaE } from "../vision/color";
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

/**
 * Current policy. Ball: up to 5 candidates per frame reach the path search, and "no grass
 * around it" is a soft penalty there instead of a hard filter (the old top-half exemption let
 * stands, boards and floodlights through unchecked).
 */
export const DEFAULT_POLICY: DetectionPolicy = {
  people: LEGACY_POLICY.people,
  ball: { ...LEGACY_POLICY.ball, maxWidth: 0.055, maxHeight: 0.075, minAspect: 0.4, maxAspect: 2.5, minGrass: 0, strongScore: 0, topHalfBypass: false, keep: 5 },
};

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

export const STITCH_PARAMS = {
  /**
   * longest gap between a track ending and another starting that can still be one player (a
   * panning camera loses players for several seconds; colour matching keeps joins within a team)
   */
  maxGapSeconds: 8,
  /** allowed camera-stabilised distance, in player heights: base + per second of gap */
  baseHeights: 1.5,
  heightsPerSecond: 2.5,
  maxColorDelta: 22,
  maxHeightRatio: 1.6,
  /** tracks seen fewer times than this are dropped (one-frame false detections) */
  minObservations: 2,
};

interface TrackSpan {
  id: number;
  segment: number;
  t0: number;
  t1: number;
  start: { x: number; y: number; h: number };
  end: { x: number; y: number; h: number };
  colorStart: LabColor | null;
  colorEnd: LabColor | null;
  count: number;
}

function meanColor(cs: (LabColor | null)[]): LabColor | null {
  const v = cs.filter((c): c is LabColor => !!c);
  if (!v.length) return null;
  return [v.reduce((s, c) => s + c[0], 0) / v.length, v.reduce((s, c) => s + c[1], 0) / v.length, v.reduce((s, c) => s + c[2], 0) / v.length];
}

/**
 * Offline track repair: drop one-frame tracks, then join a track that ends to one that starts
 * shortly after (same camera shot, reachable at running speed, similar size and shirt colour).
 * A player hidden in a crowd or briefly out of frame keeps one id instead of becoming a new one.
 */
export function stitchTracks(frames: WorkerFrameRecord[], P = STITCH_PARAMS): WorkerFrameRecord[] {
  // camera-stabilised coordinates (same convention as buildFrameSummaries)
  let camX = 0;
  let camY = 0;
  let segment = 0;
  const spans = new Map<number, TrackSpan>();
  const obsColors = new Map<number, (LabColor | null)[]>();
  frames.forEach((f) => {
    camX -= f.motionX;
    camY -= f.motionY;
    if (f.sceneCut) segment++;
    for (const p of f.players) {
      const pos = { x: p.box.x + p.box.width / 2 + camX, y: p.box.y + p.box.height + camY, h: p.box.height };
      const sp = spans.get(p.trackId);
      if (!sp) {
        spans.set(p.trackId, { id: p.trackId, segment, t0: f.timestampSeconds, t1: f.timestampSeconds, start: pos, end: pos, colorStart: null, colorEnd: null, count: 1 });
        obsColors.set(p.trackId, [p.color]);
      } else {
        sp.t1 = f.timestampSeconds;
        sp.end = pos;
        sp.count++;
        obsColors.get(p.trackId)!.push(p.color);
      }
    }
  });
  for (const sp of spans.values()) {
    const cs = obsColors.get(sp.id)!;
    sp.colorStart = meanColor(cs.slice(0, 4));
    sp.colorEnd = meanColor(cs.slice(-4));
  }

  const keep = [...spans.values()].filter((s) => s.count >= P.minObservations);
  const pairs: { a: TrackSpan; b: TrackSpan; cost: number }[] = [];
  for (const a of keep) {
    for (const b of keep) {
      if (a === b || b.segment !== a.segment) continue;
      const gap = b.t0 - a.t1;
      if (gap <= 0 || gap > P.maxGapSeconds) continue;
      const h = (a.end.h + b.start.h) / 2;
      const ratio = Math.max(a.end.h, b.start.h) / Math.max(1e-4, Math.min(a.end.h, b.start.h));
      if (ratio > P.maxHeightRatio) continue;
      const dist = Math.hypot(b.start.x - a.end.x, (b.start.y - a.end.y) * 0.8) / Math.max(0.01, h);
      const limit = P.baseHeights + P.heightsPerSecond * gap;
      if (dist > limit) continue;
      let dE = 0;
      if (a.colorEnd && b.colorStart) {
        dE = deltaE(a.colorEnd, b.colorStart);
        if (dE > P.maxColorDelta) continue;
      }
      pairs.push({ a, b, cost: dist / limit + dE / 50 + gap / 6 });
    }
  }
  pairs.sort((x, y) => x.cost - y.cost);
  const endUsed = new Set<number>();
  const startUsed = new Set<number>();
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    let r = id;
    while (parent.has(r)) r = parent.get(r)!;
    return r;
  };
  for (const { a, b } of pairs) {
    if (endUsed.has(a.id) || startUsed.has(b.id)) continue;
    endUsed.add(a.id);
    startUsed.add(b.id);
    parent.set(b.id, a.id);
  }
  const kept = new Set(keep.map((s) => s.id));
  return frames.map((f) => ({
    ...f,
    players: f.players.filter((p) => kept.has(p.trackId)).map((p) => ({ ...p, trackId: root(p.trackId) })),
  }));
}

/**
 * Rebuild `players` (with track ids) and `balls` from recorded features. Frames must be in
 * time order. Older recordings without features are returned unchanged.
 */
export function prepareFrames(frames: WorkerFrameRecord[], policy: DetectionPolicy = DEFAULT_POLICY): WorkerFrameRecord[] {
  if (!hasDetectionFeatures(frames)) return frames;
  const tracker = new AssociationTracker();
  const tracked = frames.map((f) => {
    const people = selectPeople(f.people!, policy);
    const inputs: TrackerInput[] = people.map((d) => ({ box: d.box, confidence: d.confidence, color: d.color }));
    const ids = tracker.update(inputs, f.timestampSeconds, f.motionX, f.motionY, f.sceneCut);
    const balls = selectBallCandidates(f.ballCandidates!, policy);
    return {
      ...f,
      players: people.map((d, i) => ({ trackId: ids[i], box: d.box, confidence: d.confidence, color: d.color })).filter((p) => p.trackId > 0),
      balls: balls.map((b) => ({ box: b.box, confidence: b.confidence, grass: b.grass })),
    };
  });
  return stitchTracks(tracked);
}
