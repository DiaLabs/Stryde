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

function chroma(lab: LabColor): number {
  return Math.hypot(lab[1], lab[2]);
}

/** Neon yellow/orange/pink kits worn by referees and officials — not a playing team. */
export function isLikelyOfficialColor(lab: LabColor): boolean {
  const [L, a, b] = lab;
  const c = chroma(lab);
  if (L > 52 && b > 22 && c > 28) return true; // yellow / lime
  if (L > 48 && a > 28 && b > 8 && c > 30) return true; // orange
  if (L > 42 && a > 18 && b < -2 && c > 22) return true; // pink / magenta
  return false;
}

function weightedMean(samples: Sample[]): LabColor {
  let w = 0;
  const acc = [0, 0, 0];
  for (const s of samples) {
    w += s.weight;
    acc[0] += s.color[0] * s.weight;
    acc[1] += s.color[1] * s.weight;
    acc[2] += s.color[2] * s.weight;
  }
  if (w <= 0) return samples[0].color;
  return [acc[0] / w, acc[1] / w, acc[2] / w];
}

function initCenters(samples: Sample[]): [LabColor, LabColor] {
  const Ls = samples.map((s) => s.color[0]);
  const lSpread = Math.max(...Ls) - Math.min(...Ls);
  // Light vs dark kit split — avoids picking a lone ref as a team center.
  if (lSpread > 22 && samples.length >= 4) {
    const sorted = [...samples].sort((x, y) => x.color[0] - y.color[0]);
    const cut = Math.max(1, Math.floor(sorted.length * 0.35));
    const dark = sorted.slice(0, cut);
    const light = sorted.slice(sorted.length - cut);
    return [weightedMean(light), weightedMean(dark)];
  }
  // Fallback: farthest pair among the heavier half of tracks.
  const heavy = [...samples].sort((a, b) => b.weight - a.weight).slice(0, Math.max(2, Math.ceil(samples.length * 0.6)));
  let bestA = heavy[0];
  let bestB = heavy[1] ?? heavy[0];
  let bestD = -1;
  for (let i = 0; i < heavy.length; i++) {
    for (let j = i + 1; j < heavy.length; j++) {
      const d = deltaE(heavy[i].color, heavy[j].color) * Math.sqrt(heavy[i].weight * heavy[j].weight);
      if (d > bestD) {
        bestD = d;
        bestA = heavy[i];
        bestB = heavy[j];
      }
    }
  }
  return [[...bestA.color] as LabColor, [...bestB.color] as LabColor];
}

function weightedKMeans2(samples: Sample[], iterations = 25): { centers: [LabColor, LabColor]; labels: number[] } {
  const centers = initCenters(samples);
  let labels = new Array(samples.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    labels = samples.map((s) => (deltaE(s.color, centers[0]) <= deltaE(s.color, centers[1]) ? 0 : 1));
    for (let c = 0; c < 2; c++) {
      const cluster = samples.filter((_, i) => labels[i] === c);
      if (cluster.length) centers[c] = weightedMean(cluster);
    }
  }
  return { centers, labels };
}

function clusterWeight(samples: Sample[], labels: number[], cluster: number): number {
  return samples.reduce((s, sample, i) => (labels[i] === cluster ? s + sample.weight : s), 0);
}

function clusterCount(labels: number[], cluster: number): number {
  return labels.filter((l) => l === cluster).length;
}

/** Drop tiny clusters (refs, subs) that would otherwise become a fake "team". */
function dropMinorityClusters(samples: Sample[]): Sample[] {
  if (samples.length < 4) return samples;
  let { labels } = weightedKMeans2(samples);
  const w0 = clusterWeight(samples, labels, 0);
  const w1 = clusterWeight(samples, labels, 1);
  const total = w0 + w1;
  const minority = w0 <= w1 ? 0 : 1;
  const minW = Math.min(w0, w1);
  const minCount = clusterCount(labels, minority);
  if (minW / total < 0.15 || minCount <= 2) {
    return samples.filter((_, i) => labels[i] !== minority);
  }
  return samples;
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

  let samples = items.map((i) => i.sample).filter((s) => !isLikelyOfficialColor(s.color));
  if (samples.length < 2) samples = items.map((i) => i.sample);
  samples = dropMinorityClusters(samples);
  if (samples.length < 2) return null;

  let { centers, labels } = weightedKMeans2(samples);
  const sA = spread(
    samples.filter((_, i) => labels[i] === 0),
    centers[0]
  );
  const sB = spread(
    samples.filter((_, i) => labels[i] === 1),
    centers[1]
  );
  const inliers = samples.filter((s, i) => deltaE(s.color, centers[labels[i]]) <= 2.2 * (labels[i] === 0 ? sA : sB));
  if (inliers.length >= 4) ({ centers, labels } = weightedKMeans2(inliers));
  const base = inliers.length >= 4 ? inliers : samples;
  const wA = base.filter((_, i) => labels[i] === 0).reduce((s, x) => s + x.weight, 0);
  const wB = base.filter((_, i) => labels[i] === 1).reduce((s, x) => s + x.weight, 0);
  const [a, b] = wA >= wB ? [0, 1] : [1, 0];
  const spreadA = spread(
    base.filter((_, i) => labels[i] === a),
    centers[a]
  );
  const spreadB = spread(
    base.filter((_, i) => labels[i] === b),
    centers[b]
  );
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
    if (isLikelyOfficialColor(t.jerseyColor)) {
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
    const margin = (dFar - dNear) / (dFar + dNear + 1e-6);
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
