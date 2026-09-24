import type { AnalysisResult, BallObservation, BoundingBox, FrameSummary, MatchEvent, PossessionSample, TeamId } from "../types";

export interface RenderPlayer {
  trackId: string;
  num: number;
  box: BoundingBox;
  teamId: TeamId;
  teamConfidence: number;
  detectionConfidence: number;
  speed?: number;
}

/** Precomputed lookups so per-frame drawing stays cheap. */
export interface RenderIndex {
  times: number[];
  frames: FrameSummary[];
  players: RenderPlayer[][];
  ball: (BallObservation | undefined)[];
  possession: PossessionSample[];
  /** cumulative possession seconds up to each sample */
  cumA: number[];
  cumB: number[];
  interval: number;
  events: MatchEvent[];
  trackHistory: Map<string, { t: number; x: number; y: number }[]>;
}

export function buildRenderIndex(result: AnalysisResult): RenderIndex {
  const frames = result.frames;
  const times = frames.map((f) => f.timestampSeconds);
  const idx = new Map(frames.map((f, i) => [f.frameIndex, i]));
  const players: RenderPlayer[][] = frames.map(() => []);
  const trackHistory = new Map<string, { t: number; x: number; y: number }[]>();
  for (const tr of result.tracks) {
    const num = parseInt(tr.trackId.replace(/\D/g, ""), 10) || 0;
    const hist: { t: number; x: number; y: number }[] = [];
    for (const o of tr.observations) {
      const i = idx.get(o.frameIndex);
      if (i === undefined) continue;
      players[i].push({
        trackId: tr.trackId,
        num,
        box: o.box,
        teamId: tr.teamId ?? "unknown",
        teamConfidence: tr.teamConfidence ?? 0,
        detectionConfidence: o.confidence,
        speed: o.speedMetersPerSecond,
      });
      // stabilized foot point for trails
      hist.push({ t: o.timestampSeconds, x: o.imageCenterX + frames[i].cameraX, y: o.box.y + o.box.height + frames[i].cameraY });
    }
    trackHistory.set(tr.trackId, hist);
  }
  const ball: (BallObservation | undefined)[] = frames.map(() => undefined);
  for (const b of result.ball) {
    const i = idx.get(b.frameIndex);
    if (i !== undefined) ball[i] = b;
  }
  const interval = 1 / result.coverage.sampleFps;
  const cumA: number[] = [];
  const cumB: number[] = [];
  let a = 0;
  let bb = 0;
  result.possessionTimeline.forEach((p, i) => {
    const dt = i > 0 ? Math.min(interval * 2.5, p.timestampSeconds - result.possessionTimeline[i - 1].timestampSeconds) : 0;
    const prev = i > 0 ? result.possessionTimeline[i - 1].teamId : "unknown";
    if (prev === "team_a") a += dt;
    if (prev === "team_b") bb += dt;
    cumA.push(a);
    cumB.push(bb);
  });
  return {
    times,
    frames,
    players,
    ball,
    possession: result.possessionTimeline,
    cumA,
    cumB,
    interval,
    events: result.events,
    trackHistory,
  };
}

/** Index of the last sample with time ≤ t (or -1). */
export function sampleIndexAt(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || t < times[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function nearestSample(index: RenderIndex, t: number): { i: number; gap: boolean } {
  const i0 = sampleIndexAt(index.times, t);
  const cands = [i0, i0 + 1].filter((i) => i >= 0 && i < index.times.length);
  if (!cands.length) return { i: -1, gap: true };
  const i = cands.reduce((a, b) => (Math.abs(index.times[a] - t) <= Math.abs(index.times[b] - t) ? a : b));
  return { i, gap: Math.abs(index.times[i] - t) > index.interval * 1.5 };
}

export function cameraAt(index: RenderIndex, t: number): { x: number; y: number } {
  const i0 = sampleIndexAt(index.times, t);
  if (i0 < 0) return { x: index.frames[0]?.cameraX ?? 0, y: index.frames[0]?.cameraY ?? 0 };
  const f0 = index.frames[i0];
  const f1 = index.frames[i0 + 1];
  if (!f1 || f1.sceneCut) return { x: f0.cameraX, y: f0.cameraY };
  const a = (t - f0.timestampSeconds) / Math.max(1e-6, f1.timestampSeconds - f0.timestampSeconds);
  return { x: f0.cameraX + (f1.cameraX - f0.cameraX) * a, y: f0.cameraY + (f1.cameraY - f0.cameraY) * a };
}

/** Players at time t, box-interpolated between the bracketing samples when the same track appears in both. */
export function playersAt(index: RenderIndex, t: number): RenderPlayer[] {
  const i0 = sampleIndexAt(index.times, t);
  const maxSpan = index.interval * 2.6;
  if (i0 < 0) {
    return index.times.length && index.times[0] - t <= index.interval * 0.6 ? index.players[0] : [];
  }
  const t0 = index.times[i0];
  const i1 = i0 + 1;
  if (i1 >= index.times.length || index.frames[i1].sceneCut || index.times[i1] - t0 > maxSpan) {
    return t - t0 <= index.interval * 0.6 ? index.players[i0] : [];
  }
  const t1 = index.times[i1];
  const a = (t - t0) / (t1 - t0);
  const next = new Map(index.players[i1].map((p) => [p.trackId, p]));
  const out: RenderPlayer[] = [];
  for (const p of index.players[i0]) {
    const q = next.get(p.trackId);
    if (q) {
      out.push({
        ...p,
        box: {
          x: p.box.x + (q.box.x - p.box.x) * a,
          y: p.box.y + (q.box.y - p.box.y) * a,
          width: p.box.width + (q.box.width - p.box.width) * a,
          height: p.box.height + (q.box.height - p.box.height) * a,
        },
        speed: a < 0.5 ? p.speed : q.speed,
      });
      next.delete(p.trackId);
    } else if (a < 0.5) out.push(p);
  }
  if (a >= 0.5) for (const q of next.values()) out.push(q);
  return out;
}

export function possessionAt(index: RenderIndex, t: number): { sample: PossessionSample | null; a: number; b: number } {
  const i = sampleIndexAt(index.times, t);
  if (i < 0) return { sample: null, a: 0, b: 0 };
  const s = index.possession[i];
  const near = Math.abs(index.times[i] - t) <= index.interval * 1.5 ? s : null;
  return { sample: near, a: index.cumA[i], b: index.cumB[i] };
}
