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
  return {
    method: "image_space",
    map(fi, x, y) {
      const s = summaries[fi];
      const u = (x + s.cameraX - minX) / spanX;
      const v = (y + s.cameraY - minY) / spanY;
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
    // Speeds from 3-sample smoothed positions, differenced ±2 observations apart,
    // to suppress bounding-box jitter at the feet.
    const obs = t.observations;
    const smooth = obs.map((o, i) => {
      if (o.pitchX === undefined) return null;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = Math.max(0, i - 1); k <= Math.min(obs.length - 1, i + 1); k++) {
        const q = obs[k];
        if (q.pitchX === undefined || Math.abs(q.timestampSeconds - o.timestampSeconds) > 0.6) continue;
        sx += q.pitchX;
        sy += q.pitchY!;
        n++;
      }
      return { x: sx / n, y: sy / n, t: o.timestampSeconds };
    });
    for (let i = 0; i < obs.length; i++) {
      const a = smooth[Math.max(0, i - 2)];
      const b = smooth[Math.min(obs.length - 1, i + 2)];
      if (!a || !b || a === b) continue;
      const dt = b.t - a.t;
      if (dt <= 0.15 || dt > 1.6) continue;
      const v = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      if (v <= 11) obs[i].speedMetersPerSecond = v;
    }
  }
}
