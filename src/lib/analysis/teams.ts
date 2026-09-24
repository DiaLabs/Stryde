import type { LabColor, ObjectTrack, TeamId } from "../types";
import { deltaE, hexToLab, labToHex } from "../vision/color";

export interface TeamColorModel {
  teamA: LabColor;
  teamB: LabColor;
  source: "estimated" | "user";
  /** 0..1 separation-based confidence of the color model */
  confidence: number;
  /** typical in-cluster spread (ΔE) used for outlier rejection */
  spreadA: number;
  spreadB: number;
}

interface Sample {
  color: LabColor;
  weight: number;
}

function weightedKMeans2(samples: Sample[], iterations = 25): { centers: [LabColor, LabColor]; labels: number[] } {
  // init: farthest pair heuristic from the heaviest sample
  const heaviest = samples.reduce((a, b) => (b.weight > a.weight ? b : a));
  let far = samples[0];
  let farD = -1;
  for (const s of samples) {
    const d = deltaE(s.color, heaviest.color) * Math.sqrt(s.weight);
    if (d > farD) {
      farD = d;
      far = s;
    }
  }
  const centers: [LabColor, LabColor] = [[...heaviest.color] as LabColor, [...far.color] as LabColor];
  let labels = new Array(samples.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    labels = samples.map((s) => (deltaE(s.color, centers[0]) <= deltaE(s.color, centers[1]) ? 0 : 1));
    for (let c = 0; c < 2; c++) {
      let w = 0;
      const acc = [0, 0, 0];
      samples.forEach((s, i) => {
        if (labels[i] !== c) return;
        w += s.weight;
        acc[0] += s.color[0] * s.weight;
        acc[1] += s.color[1] * s.weight;
        acc[2] += s.color[2] * s.weight;
      });
      if (w > 0) centers[c] = [acc[0] / w, acc[1] / w, acc[2] / w];
    }
  }
  return { centers, labels };
}

function spread(samples: Sample[], center: LabColor): number {
  const ds = samples.map((s) => deltaE(s.color, center)).sort((a, b) => a - b);
  if (ds.length === 0) return 10;
  return Math.max(6, ds[Math.floor(ds.length * 0.75)]);
}

function trackSamples(tracks: ObjectTrack[], minObs: number): { track: ObjectTrack; sample: Sample }[] {
  return tracks
    .filter((t) => t.jerseyColor && t.observations.length >= minObs)
    .map((t) => ({ track: t, sample: { color: t.jerseyColor!, weight: Math.min(30, t.observations.length) } }));
}

/**
 * Estimate two team colors from track jersey colors. Returns null when evidence is
 * insufficient (too few tracks) — the UI then asks the user to set colors.
 */
export function estimateTeamColors(tracks: ObjectTrack[]): TeamColorModel | null {
  let items = trackSamples(tracks, 3);
  if (items.length < 4) items = trackSamples(tracks, 1);
  if (items.length < 2) return null;
  const samples = items.map((i) => i.sample);
  let { centers, labels } = weightedKMeans2(samples);
  // Drop outliers (referees, goalkeepers) and refit once.
  const sA = spread(samples.filter((_, i) => labels[i] === 0), centers[0]);
  const sB = spread(samples.filter((_, i) => labels[i] === 1), centers[1]);
  const inliers = samples.filter((s, i) => deltaE(s.color, centers[labels[i]]) <= 2.2 * (labels[i] === 0 ? sA : sB));
  if (inliers.length >= 4) ({ centers, labels } = weightedKMeans2(inliers));
  const base = inliers.length >= 4 ? inliers : samples;
  const wA = base.filter((_, i) => labels[i] === 0).reduce((s, x) => s + x.weight, 0);
  const wB = base.filter((_, i) => labels[i] === 1).reduce((s, x) => s + x.weight, 0);
  // Larger cluster first for determinism.
  const [a, b] = wA >= wB ? [0, 1] : [1, 0];
  const spreadA = spread(base.filter((_, i) => labels[i] === a), centers[a]);
  const spreadB = spread(base.filter((_, i) => labels[i] === b), centers[b]);
  const separation = deltaE(centers[a], centers[b]);
  const confidence = Math.max(0, Math.min(1, (separation / (spreadA + spreadB + 1e-6) - 0.5) / 1.5));
  return { teamA: centers[a], teamB: centers[b], source: "estimated", confidence, spreadA, spreadB };
}

export function userColorModel(teamAHex: string, teamBHex: string, estimated: TeamColorModel | null): TeamColorModel {
  const teamA = hexToLab(teamAHex);
  const teamB = hexToLab(teamBHex);
  const separation = deltaE(teamA, teamB);
  return {
    teamA,
    teamB,
    source: "user",
    confidence: Math.max(0, Math.min(1, (separation - 10) / 40)),
    spreadA: estimated?.spreadA ?? 18,
    spreadB: estimated?.spreadB ?? 18,
  };
}

/**
 * Assign each player track to team_a / team_b / unknown with a confidence.
 * Ambiguous or outlier colors stay "unknown" instead of being forced.
 */
export function classifyTracks(tracks: ObjectTrack[], model: TeamColorModel): void {
  const tolA = Math.max(20, 2.6 * model.spreadA);
  const tolB = Math.max(20, 2.6 * model.spreadB);
  for (const t of tracks) {
    if (t.objectType !== "player") continue;
    if (!t.jerseyColor) {
      t.teamId = "unknown";
      t.teamConfidence = 0;
      continue;
    }
    const dA = deltaE(t.jerseyColor, model.teamA);
    const dB = deltaE(t.jerseyColor, model.teamB);
    const nearest: TeamId = dA <= dB ? "team_a" : "team_b";
    const dNear = Math.min(dA, dB);
    const dFar = Math.max(dA, dB);
    const tol = nearest === "team_a" ? tolA : tolB;
    const margin = (dFar - dNear) / (dFar + dNear + 1e-6); // 0..1
    const evidence = Math.min(1, t.observations.length / 5);
    const conf = Math.max(0, Math.min(1, margin * 2.2)) * (0.6 + 0.4 * evidence) * (dNear <= tol ? 1 : 0);
    if (dNear > tol || margin < 0.12) {
      t.teamId = "unknown";
      t.teamConfidence = conf;
    } else {
      t.teamId = nearest;
      t.teamConfidence = conf;
    }
  }
}

export function modelHex(model: TeamColorModel): { a: string; b: string } {
  return { a: labToHex(model.teamA), b: labToHex(model.teamB) };
}
