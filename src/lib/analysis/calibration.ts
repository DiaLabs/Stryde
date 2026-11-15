import type { CalibrationPoint } from "../types";
import { applyHomography, isWellSpread, solveHomography, type Mat3 } from "./homography";

/** A landmark whose reprojection error is above this (metres) does not support the fit. */
export const INLIER_METERS = 2.5;

export interface CalibrationSolution {
  H: Mat3 | null;
  /** mean reprojection error of the inliers, metres */
  errorMeters: number;
  /** indices of the points that support the fit */
  inliers: number[];
  message?: string;
}

function reprojection(H: Mat3, p: CalibrationPoint): number {
  const q = applyHomography(H, p.imageX, p.imageY);
  return q ? Math.hypot(q.x - p.pitchX, q.y - p.pitchY) : Infinity;
}

function fit(points: CalibrationPoint[]): Mat3 | null {
  return solveHomography(
    points.map((p) => ({ x: p.imageX, y: p.imageY })),
    points.map((p) => ({ x: p.pitchX, y: p.pitchY }))
  );
}

function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * Image → pitch homography from clicked landmark pairs, robust to a mistaken click:
 * every 4-point subset is tried (RANSAC-style, exhaustive for the handful of points a person
 * clicks), the fit with the most landmarks under INLIER_METERS wins, and it is refitted on those.
 */
export function computeCalibration(points: CalibrationPoint[]): CalibrationSolution {
  const none = (message: string): CalibrationSolution => ({ H: null, errorMeters: Infinity, inliers: [], message });
  if (points.length < 4) return none("Select at least 4 landmark pairs.");
  const src = points.map((p) => ({ x: p.imageX, y: p.imageY }));
  const dst = points.map((p) => ({ x: p.pitchX, y: p.pitchY }));
  if (!isWellSpread(dst) || !isWellSpread(src)) return none("Points are nearly in a line; pick landmarks spread across the view.");

  let best: { inliers: number[]; error: number } | null = null;
  // cap the search for very long point lists (C(12,4) = 495 fits is still instant)
  const n = Math.min(points.length, 12);
  for (const subset of combinations(n, 4)) {
    const H = fit(subset.map((i) => points[i]));
    if (!H) continue;
    const errs = points.map((p) => reprojection(H, p));
    const inliers = errs.flatMap((e, i) => (e <= INLIER_METERS ? [i] : []));
    if (inliers.length < 4) continue;
    const error = inliers.reduce((s, i) => s + errs[i], 0) / inliers.length;
    if (!best || inliers.length > best.inliers.length || (inliers.length === best.inliers.length && error < best.error)) best = { inliers, error };
  }
  if (!best) {
    // no consistent subset: fall back to all points so the person sees how far off it is
    const H = fit(points);
    if (!H) return none("Could not solve the pitch mapping from these points.");
    const errs = points.map((p) => reprojection(H, p));
    return {
      H,
      errorMeters: errs.reduce((s, e) => s + e, 0) / errs.length,
      inliers: points.map((_, i) => i),
      message: "The landmarks don't agree with each other; check that each click matches its pitch point.",
    };
  }
  const H = fit(best.inliers.map((i) => points[i]));
  if (!H) return none("Could not solve the pitch mapping from these points.");
  const errs = best.inliers.map((i) => reprojection(H, points[i]));
  const outliers = points.length - best.inliers.length;
  return {
    H,
    errorMeters: errs.reduce((s, e) => s + e, 0) / errs.length,
    inliers: best.inliers,
    message: outliers ? `${outliers} landmark${outliers === 1 ? "" : "s"} didn't fit the others and ${outliers === 1 ? "was" : "were"} ignored.` : undefined,
  };
}
