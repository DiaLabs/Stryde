import type { AnalysisResult } from "./types";

/**
 * One rule for "partial" everywhere (match list, workspace header, summary): part of the clip
 * wasn't analyzed, possession couldn't be estimated, shots are unavailable, or processing stopped.
 */
export function isPartial(result: AnalysisResult): boolean {
  return (
    (result.coverage.fraction ?? 1) < 0.98 ||
    result.analytics.some((a) => a.possessionPercent.quality === "unavailable") ||
    result.eventAnalysis.shots === "unavailable" ||
    result.warnings.some((w) => /stopped|could not/i.test(w))
  );
}
