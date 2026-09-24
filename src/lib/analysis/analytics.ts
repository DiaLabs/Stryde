import type {
  CalibrationState,
  FrameSummary,
  MatchEvent,
  MetricValue,
  ObjectTrack,
  PossessionSample,
  QualityLevel,
  TeamAnalytics,
} from "../types";
import { PITCH_LENGTH, PITCH_WIDTH } from "./pitch";
import { sampleDurations } from "./possession";

export const GRID_X = 21;
export const GRID_Y = 14;

const unavailable = (unit: string, explanation: string): MetricValue => ({
  value: null,
  unit,
  quality: "unavailable",
  explanation,
});

export interface TeamPoint {
  trackId: string;
  x: number;
  y: number;
  /** displacement since the previous observation of the same track (pitch units) */
  move: number;
}

export interface TeamFrame {
  frameIndex: number;
  t: number;
  dt: number;
  team_a: TeamPoint[];
  team_b: TeamPoint[];
}

/** Per sampled frame, mapped positions of each team's tracked players. */
export function buildTeamFrames(tracks: ObjectTrack[], summaries: FrameSummary[], sampleInterval: number): TeamFrame[] {
  const dts = sampleDurations(
    summaries.map((s) => s.timestampSeconds),
    sampleInterval * 2.5
  );
  const frames: TeamFrame[] = summaries.map((s, i) => ({
    frameIndex: s.frameIndex,
    t: s.timestampSeconds,
    dt: dts[i],
    team_a: [],
    team_b: [],
  }));
  const indexOf = new Map(summaries.map((s, i) => [s.frameIndex, i]));
  for (const tr of tracks) {
    if (tr.teamId !== "team_a" && tr.teamId !== "team_b") continue;
    let prev: { x: number; y: number; t: number } | null = null;
    for (const o of tr.observations) {
      if (o.pitchX === undefined || o.pitchY === undefined) {
        prev = null;
        continue;
      }
      let move = 0;
      if (prev && o.timestampSeconds - prev.t <= sampleInterval * 2.5) {
        move = Math.hypot(o.pitchX - prev.x, o.pitchY - prev.y);
      }
      frames[indexOf.get(o.frameIndex)!][tr.teamId].push({ trackId: tr.trackId, x: o.pitchX, y: o.pitchY, move });
      prev = { x: o.pitchX, y: o.pitchY, t: o.timestampSeconds };
    }
  }
  return frames;
}

export type HeatmapType = "occupancy" | "movement";

export function computeGrid(
  frames: TeamFrame[],
  team: "team_a" | "team_b",
  type: HeatmapType,
  range: [number, number] = [-Infinity, Infinity]
): { grid: number[][]; total: number; frames: number } {
  const grid = Array.from({ length: GRID_Y }, () => new Array(GRID_X).fill(0));
  let total = 0;
  let count = 0;
  for (const f of frames) {
    if (f.t < range[0] || f.t > range[1]) continue;
    if (f[team].length) count++;
    for (const p of f[team]) {
      const gx = Math.min(GRID_X - 1, Math.max(0, Math.floor((p.x / PITCH_LENGTH) * GRID_X)));
      const gy = Math.min(GRID_Y - 1, Math.max(0, Math.floor((p.y / PITCH_WIDTH) * GRID_Y)));
      const w = type === "occupancy" ? f.dt : p.move;
      grid[gy][gx] += w;
      total += w;
    }
  }
  return { grid, total, frames: count };
}

/** Share of presence per pitch third (left, middle, right) and per channel (top, centre, bottom). */
export function zoneShares(
  frames: TeamFrame[],
  team: "team_a" | "team_b",
  range: [number, number] = [-Infinity, Infinity]
): { thirds: number[]; channels: number[]; zones: number[][]; total: number } {
  const zones = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let total = 0;
  for (const f of frames) {
    if (f.t < range[0] || f.t > range[1]) continue;
    for (const p of f[team]) {
      const zx = Math.min(2, Math.max(0, Math.floor((p.x / PITCH_LENGTH) * 3)));
      const zy = Math.min(2, Math.max(0, Math.floor((p.y / PITCH_WIDTH) * 3)));
      zones[zy][zx] += f.dt;
      total += f.dt;
    }
  }
  const norm = (v: number) => (total > 0 ? v / total : 0);
  return {
    thirds: [0, 1, 2].map((x) => norm(zones[0][x] + zones[1][x] + zones[2][x])),
    channels: [0, 1, 2].map((y) => norm(zones[y][0] + zones[y][1] + zones[y][2])),
    zones: zones.map((row) => row.map(norm)),
    total,
  };
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof pts = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof pts = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export interface ShapeSnapshot {
  centroid: { x: number; y: number };
  width: number;
  depth: number;
  compactness: number;
  hull: { x: number; y: number }[];
  count: number;
}

export function teamShape(points: TeamPoint[]): ShapeSnapshot | null {
  if (points.length < 3) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    centroid: { x: cx, y: cy },
    depth: Math.max(...xs) - Math.min(...xs),
    width: Math.max(...ys) - Math.min(...ys),
    compactness: points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length,
    hull: convexHull(points),
    count: points.length,
  };
}

/** Nearest sampled frame to time t, or null when t falls in a data gap. */
export function frameAt<T extends { t: number }>(frames: T[], t: number, tolerance: number): T | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [frames[lo], frames[lo - 1]].filter(Boolean) as T[];
  const best = cands.reduce((a, b) => (Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b));
  return Math.abs(best.t - t) <= tolerance ? best : null;
}

export function calculateAnalytics(params: {
  tracks: ObjectTrack[];
  teamFrames: TeamFrame[];
  possession: PossessionSample[];
  possessionDurations: number[];
  events: MatchEvent[];
  calibration: CalibrationState;
  eventQuality: { shots: QualityLevel; goals: QualityLevel };
  analyzedSeconds: number;
}): { analytics: TeamAnalytics[]; unknownSeconds: number } {
  const { tracks, teamFrames, possession, possessionDurations, events, calibration } = params;
  const calibrated = calibration.method === "homography" && calibration.available;
  const calQuality: QualityLevel = calibrated ? calibration.quality : "unavailable";

  let secA = 0;
  let secB = 0;
  let unknown = 0;
  possession.forEach((p, i) => {
    const d = possessionDurations[i];
    if (p.teamId === "team_a") secA += d;
    else if (p.teamId === "team_b") secB += d;
    else unknown += d;
  });
  const known = secA + secB;
  const knownShare = params.analyzedSeconds > 0 ? known / params.analyzedSeconds : 0;
  const possQuality: QualityLevel =
    known < 2 ? "unavailable" : knownShare >= 0.6 ? "medium" : knownShare >= 0.25 ? "low" : "low";

  const analytics = (["team_a", "team_b"] as const).map((team): TeamAnalytics => {
    const teamTracks = tracks.filter((t) => t.teamId === team);
    const secs = team === "team_a" ? secA : secB;
    const possessionPercent: MetricValue =
      possQuality === "unavailable"
        ? unavailable("%", "Not enough ball evidence near tracked players to estimate possession.")
        : {
            value: (secs / known) * 100,
            unit: "%",
            quality: possQuality,
            explanation: `Share of ${known.toFixed(1)} s with an estimated team in possession. ${unknown.toFixed(
              1
            )} s unknown/contested excluded from the denominator.`,
          };

    // visible players per frame (image-based count, independent of calibration)
    const observations = teamTracks.reduce((s, t) => s + t.observations.length, 0);
    const averageVisiblePlayers: MetricValue = observations
      ? {
          value: observations / Math.max(1, teamFrames.length),
          unit: "players",
          quality: "medium",
          explanation: "Average tracked players of this team per sampled frame (only players visible on camera).",
        }
      : unavailable("players", "No players were assigned to this team.");

    let distanceMeters = unavailable("m", "Requires pitch calibration to express movement in meters.");
    let averageSpeedMetersPerSecond = unavailable("m/s", "Requires pitch calibration to express speed in m/s.");
    let widthMeters = unavailable("m", "Requires pitch calibration.");
    let depthMeters = unavailable("m", "Requires pitch calibration.");
    let compactness = unavailable("m", "Requires pitch calibration.");

    if (calibrated) {
      let dist = 0;
      const speeds: number[] = [];
      for (const tr of teamTracks) {
        const obs = tr.observations;
        for (let i = 1; i < obs.length; i++) {
          const a = obs[i - 1];
          const b = obs[i];
          if (a.pitchX === undefined || b.pitchX === undefined) continue;
          const dt = b.timestampSeconds - a.timestampSeconds;
          if (dt <= 0 || dt > 1.2) continue;
          const d = Math.hypot(b.pitchX - a.pitchX, b.pitchY! - a.pitchY!);
          if (d / dt > 11) continue;
          dist += d;
        }
        for (const o of obs) if (o.speedMetersPerSecond !== undefined) speeds.push(o.speedMetersPerSecond);
      }
      const q: QualityLevel = calQuality === "high" ? "medium" : "low";
      if (speeds.length >= 10) {
        distanceMeters = {
          value: dist,
          unit: "m",
          quality: q,
          explanation: "Sum of tracked movement across this team's visible players over calibrated frames only.",
        };
        averageSpeedMetersPerSecond = {
          value: speeds.reduce((s, v) => s + v, 0) / speeds.length,
          unit: "m/s",
          quality: q,
          explanation: "Mean smoothed speed of tracked players (calibrated frames only; jumps > 11 m/s discarded).",
        };
      } else {
        distanceMeters = unavailable("m", "Too few calibrated, continuous track observations.");
        averageSpeedMetersPerSecond = unavailable("m/s", "Too few calibrated, continuous track observations.");
      }
      const shapes = teamFrames.map((f) => (f[team].length >= 5 ? teamShape(f[team]) : null)).filter(Boolean) as ShapeSnapshot[];
      if (shapes.length >= 5) {
        const avg = (k: "width" | "depth" | "compactness") => shapes.reduce((s, x) => s + x[k], 0) / shapes.length;
        const expl = `Average over ${shapes.length} calibrated frames with ≥5 visible players; players off camera are not included.`;
        widthMeters = { value: avg("width"), unit: "m", quality: "low", explanation: expl };
        depthMeters = { value: avg("depth"), unit: "m", quality: "low", explanation: expl };
        compactness = {
          value: avg("compactness"),
          unit: "m",
          quality: "low",
          explanation: "Mean distance of visible players to their centroid. " + expl,
        };
      } else {
        const why = "Too few calibrated frames with ≥5 visible players of this team.";
        widthMeters = unavailable("m", why);
        depthMeters = unavailable("m", why);
        compactness = unavailable("m", why);
      }
    }

    const shots = events.filter((e) => e.type === "shot" && e.teamId === team).length;
    const goals = events.filter((e) => e.type === "goal" && e.teamId === team).length;
    const zs = zoneShares(teamFrames, team);
    const spatialQuality: QualityLevel = calibrated ? (calQuality === "high" ? "medium" : "low") : "low";
    const { grid } = computeGrid(teamFrames, team, "occupancy");
    return {
      teamId: team,
      possessionPercent,
      possessionSeconds:
        possQuality === "unavailable"
          ? unavailable("s", "Possession unavailable.")
          : { value: secs, unit: "s", quality: possQuality },
      distanceMeters,
      averageSpeedMetersPerSecond,
      widthMeters,
      depthMeters,
      compactness,
      shotCount:
        params.eventQuality.shots === "unavailable"
          ? unavailable("shots", "Shot estimation unavailable for this footage.")
          : {
              value: shots,
              unit: "shots",
              quality: params.eventQuality.shots,
              explanation: "Estimated shot attempts attributed via the possession estimate before the shot.",
            },
      goalCount:
        params.eventQuality.goals === "unavailable"
          ? unavailable("goals", "Goal estimation requires pitch calibration.")
          : { value: goals, unit: "goals", quality: params.eventQuality.goals, explanation: "Possible goals (estimated)." },
      averageVisiblePlayers,
      trackCount: {
        value: teamTracks.length,
        unit: "tracks",
        quality: "low",
        explanation: "Temporary track IDs; one player may produce several tracks after occlusions or camera cuts.",
      },
      thirds:
        zs.total > 0
          ? zs.thirds.map((v) => ({
              value: v * 100,
              unit: "%",
              quality: spatialQuality,
              explanation: calibrated ? "Calibrated pitch coordinates." : "Image-space approximation.",
            }))
          : [0, 1, 2].map(() => unavailable("%", "No mapped positions.")),
      occupancyGrid: grid,
    };
  });
  return { analytics, unknownSeconds: unknown };
}
