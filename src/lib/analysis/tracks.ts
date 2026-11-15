import type { CalibrationState, FrameSummary, LabColor, ObjectTrack, WorkerFrameRecord } from "../types";
import { applyHomography } from "./homography";
import { PITCH_LENGTH, PITCH_WIDTH } from "./pitch";

export function buildFrameSummaries(frames: WorkerFrameRecord[]): FrameSummary[] {
  let camX = 0;
  let camY = 0;
  return frames.map((f) => {
    camX -= f.motionX;
    camY -= f.motionY;
    return {
      frameIndex: f.frameIndex,
      timestampSeconds: f.timestampSeconds,
      cameraX: camX,
      cameraY: camY,
      sceneCut: f.sceneCut,
      calibrated: false,
    };
  });
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

export function buildTracks(frames: WorkerFrameRecord[]): ObjectTrack[] {
  const map = new Map<number, { track: ObjectTrack; colors: LabColor[] }>();
  for (const f of frames) {
    for (const p of f.players) {
      let entry = map.get(p.trackId);
      if (!entry) {
        entry = {
          track: { trackId: `T${p.trackId}`, objectType: "player", observations: [], status: "ended" },
          colors: [],
        };
        map.set(p.trackId, entry);
      }
      entry.track.observations.push({
        frameIndex: f.frameIndex,
        timestampSeconds: f.timestampSeconds,
        box: p.box,
        imageCenterX: p.box.x + p.box.width / 2,
        imageCenterY: p.box.y + p.box.height / 2,
        confidence: p.confidence,
      });
      if (p.color) entry.colors.push(p.color);
    }
  }
  const lastT = frames.length ? frames[frames.length - 1].timestampSeconds : 0;
  const tracks: ObjectTrack[] = [];
  for (const { track, colors } of map.values()) {
    if (colors.length) {
      track.jerseyColor = [median(colors.map((c) => c[0])), median(colors.map((c) => c[1])), median(colors.map((c) => c[2]))];
      track.observationColors = colors;
    }
    const last = track.observations[track.observations.length - 1];
    track.status = lastT - last.timestampSeconds < 0.01 ? "active" : "ended";
    tracks.push(track);
  }
  return tracks;
}

export interface PitchMapper {
  method: CalibrationState["method"];
  /** Map a normalized image point observed at sampled frame `fi` (index into summaries) to pitch meters. */
  map(fi: number, x: number, y: number): { x: number; y: number } | null;
}

/** Calibrated homography mapper with camera-pan compensation relative to the reference frame. */
export function homographyMapper(
  summaries: FrameSummary[],
  H: number[],
  referenceIndex: number,
  maxDrift = 0.35
): { mapper: PitchMapper; validFraction: number; meanDrift: number } {
  const ref = summaries[referenceIndex];
  // Frames in the same camera segment (no scene cut between) with bounded drift.
  const valid = new Array(summaries.length).fill(false);
  let driftSum = 0;
  let validCount = 0;
  const mark = (i: number) => {
    const s = summaries[i];
    const drift = Math.hypot(s.cameraX - ref.cameraX, s.cameraY - ref.cameraY);
    if (drift > maxDrift) return false;
    valid[i] = true;
    driftSum += drift;
    validCount++;
    return true;
  };
  mark(referenceIndex);
  for (let i = referenceIndex + 1; i < summaries.length; i++) {
    if (summaries[i].sceneCut) break;
    mark(i);
  }
  for (let i = referenceIndex - 1; i >= 0; i--) {
    if (summaries[i + 1].sceneCut) break;
    mark(i);
  }
  summaries.forEach((s, i) => (s.calibrated = valid[i]));
  const mapper: PitchMapper = {
    method: "homography",
    map(fi, x, y) {
      if (!valid[fi]) return null;
      const s = summaries[fi];
      const p = applyHomography(H, x + s.cameraX - ref.cameraX, y + s.cameraY - ref.cameraY);
      if (!p) return null;
      // allow a margin outside the lines (throw-ins, goal kicks); reject absurd projections
      if (p.x < -8 || p.x > PITCH_LENGTH + 8 || p.y < -8 || p.y > PITCH_WIDTH + 8) return null;
      return p;
    },
  };
  return { mapper, validFraction: summaries.length ? validCount / summaries.length : 0, meanDrift: validCount ? driftSum / validCount : 0 };
}

/**
 * Several calibrated reference frames (a panning broadcast camera covers far more pitch than
 * one frame's pan compensation can reach). Each sampled frame is mapped through the reference
 * whose camera position is closest, among those whose coverage includes it.
 */
export function multiHomographyMapper(
  summaries: FrameSummary[],
  refs: { H: number[]; referenceIndex: number }[],
  maxDrift = 0.35
): { mapper: PitchMapper; validFraction: number; meanDrift: number } {
  if (refs.length === 1) return homographyMapper(summaries, refs[0].H, refs[0].referenceIndex, maxDrift);
  const singles = refs.map((r) => {
    const m = homographyMapper(summaries, r.H, r.referenceIndex, maxDrift);
    const valid = summaries.map((s) => s.calibrated);
    return { ...m, valid, ref: summaries[r.referenceIndex] };
  });
  const choice = summaries.map((s, i) => {
    let best = -1;
    let bestDrift = Infinity;
    singles.forEach((m, k) => {
      if (!m.valid[i]) return;
      const d = Math.hypot(s.cameraX - m.ref.cameraX, s.cameraY - m.ref.cameraY);
      if (d < bestDrift) {
        bestDrift = d;
        best = k;
      }
    });
    return { best, drift: bestDrift };
  });
  const covered = choice.filter((c) => c.best >= 0);
  summaries.forEach((s, i) => (s.calibrated = choice[i].best >= 0));
  return {
    mapper: {
      method: "homography",
      map(fi, x, y) {
        const c = choice[fi];
        return c && c.best >= 0 ? singles[c.best].mapper.map(fi, x, y) : null;
      },
    },
    validFraction: summaries.length ? covered.length / summaries.length : 0,
    meanDrift: covered.length ? covered.reduce((acc, c) => acc + c.drift, 0) / covered.length : 0,
  };
}

/**
 * Image-space fallback: camera-stabilized image coordinates stretched onto the pitch
 * rectangle. Approximate; not physical units.
 */
export function imageSpaceMapper(summaries: FrameSummary[], tracks: ObjectTrack[]): PitchMapper {
  const indexOf = new Map(summaries.map((s, i) => [s.frameIndex, i]));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tracks) {
    for (const o of t.observations) {
      const s = summaries[indexOf.get(o.frameIndex)!];
      const fx = o.imageCenterX + s.cameraX;
      const fy = o.box.y + o.box.height + s.cameraY;
      minX = Math.min(minX, fx);
      maxX = Math.max(maxX, fx);
      minY = Math.min(minY, fy);
      maxY = Math.max(maxY, fy);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }
  const spanX = Math.max(0.2, maxX - minX);
  const spanY = Math.max(0.2, maxY - minY);
  const padX = spanX * 0.12;
  const padY = spanY * 0.12;
  return {
    method: "image_space",
    map(fi, x, y) {
      const s = summaries[fi];
      const u = (x + s.cameraX - minX + padX) / (spanX + padX * 2);
      const v = (y + s.cameraY - minY + padY) / (spanY + padY * 2);
      return {
        x: Math.max(0, Math.min(1, u)) * PITCH_LENGTH,
        y: Math.max(0, Math.min(1, v)) * PITCH_WIDTH,
      };
    },
  };
}

/** Fill pitchX/pitchY (foot point) and calibrated speeds on track observations. */
export function mapTracks(tracks: ObjectTrack[], summaries: FrameSummary[], mapper: PitchMapper): void {
  const indexOf = new Map(summaries.map((s, i) => [s.frameIndex, i]));
  for (const t of tracks) {
    for (const o of t.observations) {
      const fi = indexOf.get(o.frameIndex)!;
      const p = mapper.map(fi, o.imageCenterX, o.box.y + o.box.height);
      o.pitchX = p?.x;
      o.pitchY = p?.y;
      o.speedMetersPerSecond = undefined;
    }
    if (mapper.method !== "homography") continue;
    // Box jitter at the feet is ~0.3–0.5 m per sample, which turns naive differencing into
    // several m/s of fake speed. Positions are averaged over ±0.6 s and speed is the slope of a
    // least-squares line through ±0.8 s of positions (at least 4 samples).
    const obs = t.observations;
    const SMOOTH = 0.6;
    const SLOPE = 0.8;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.pitchX === undefined) continue;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const q of obs) {
        if (q.pitchX === undefined || Math.abs(q.timestampSeconds - o.timestampSeconds) > SMOOTH) continue;
        sx += q.pitchX;
        sy += q.pitchY!;
        n++;
      }
      o.smoothPitchX = sx / n;
      o.smoothPitchY = sy / n;
    }
    for (const o of obs) {
      if (o.pitchX === undefined) continue;
      const pts: { t: number; x: number; y: number }[] = [];
      for (const q of obs) {
        if (q.pitchX === undefined || Math.abs(q.timestampSeconds - o.timestampSeconds) > SLOPE) continue;
        pts.push({ t: q.timestampSeconds - o.timestampSeconds, x: q.pitchX, y: q.pitchY! });
      }
      if (pts.length < 4) continue;
      const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length;
      const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      let stt = 0;
      let stx = 0;
      let sty = 0;
      for (const p of pts) {
        stt += (p.t - mt) ** 2;
        stx += (p.t - mt) * (p.x - mx);
        sty += (p.t - mt) * (p.y - my);
      }
      if (stt < 0.05) continue;
      const v = Math.hypot(stx / stt, sty / stt);
      if (v <= 11) o.speedMetersPerSecond = v;
    }
  }
}
