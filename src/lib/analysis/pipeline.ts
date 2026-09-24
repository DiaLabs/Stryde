import type {
  AnalysisMode,
  AnalysisResult,
  CalibrationPoint,
  CalibrationState,
  ExecutionProvider,
  MatchConfig,
  QualityLevel,
  VideoMetadata,
  WorkerFrameRecord,
} from "../types";
import { deltaE, hexToLab, labToHex } from "../vision/color";
import { buildTeamFrames, calculateAnalytics } from "./analytics";
import { selectBall } from "./ball";
import { detectEvents } from "./events";
import { applyHomography, isWellSpread, solveHomography } from "./homography";
import { estimatePossession, sampleDurations } from "./possession";
import { classifyTracks, estimateTeamColors, userColorModel } from "./teams";
import { buildFrameSummaries, buildTracks, homographyMapper, imageSpaceMapper, mapTracks, type PitchMapper } from "./tracks";

/** Everything produced by the expensive browser-inference pass. Re-analysis reuses it. */
export interface RawAnalysis {
  sessionId: string;
  video: VideoMetadata;
  config: MatchConfig;
  frames: WorkerFrameRecord[];
  sampleFps: number;
  expectedFrameCount: number;
  provider: ExecutionProvider;
  model: string;
  inputSize: number;
  mode: AnalysisMode;
  durationMs: number;
  adaptations: string[];
  warnings: string[];
  cancelledEarly: boolean;
}

export interface AnalysisOverrides {
  teamAColor?: string;
  teamBColor?: string;
  calibration?: { points: CalibrationPoint[]; referenceFrameIndex: number } | null;
}

export function computeCalibration(points: CalibrationPoint[]): {
  H: number[] | null;
  errorMeters: number;
  message?: string;
} {
  if (points.length < 4) return { H: null, errorMeters: Infinity, message: "Select at least 4 landmark pairs." };
  const src = points.map((p) => ({ x: p.imageX, y: p.imageY }));
  const dst = points.map((p) => ({ x: p.pitchX, y: p.pitchY }));
  if (!isWellSpread(dst) || !isWellSpread(src))
    return { H: null, errorMeters: Infinity, message: "Points are nearly collinear; pick landmarks spread across the view." };
  const H = solveHomography(src, dst);
  if (!H) return { H: null, errorMeters: Infinity, message: "Could not solve the pitch mapping from these points." };
  const errs = points.map((p) => {
    const q = applyHomography(H, p.imageX, p.imageY);
    return q ? Math.hypot(q.x - p.pitchX, q.y - p.pitchY) : 99;
  });
  return { H, errorMeters: errs.reduce((s, e) => s + e, 0) / errs.length };
}

export function buildResult(raw: RawAnalysis, overrides: AnalysisOverrides = {}): AnalysisResult {
  const frames = raw.frames.slice().sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const warnings = [...raw.warnings];
  const summaries = buildFrameSummaries(frames);
  const tracks = buildTracks(frames);
  const aspect = raw.video.width / Math.max(1, raw.video.height);
  const sampleInterval = 1 / raw.sampleFps;

  // ---- teams
  const estimated = estimateTeamColors(tracks);
  // override "" means "auto-detect", undefined means "keep the setup choice"
  const userA = overrides.teamAColor !== undefined ? overrides.teamAColor || undefined : raw.config.teamAColor;
  const userB = overrides.teamBColor !== undefined ? overrides.teamBColor || undefined : raw.config.teamBColor;
  let model = estimated;
  if (userA && userB) model = userColorModel(userA, userB, estimated);
  else if (estimated && (userA || userB)) {
    // one user color: the other team is the estimated cluster farthest from it
    const given = hexToLab((userA ?? userB)!);
    const other = deltaE(given, estimated.teamA) > deltaE(given, estimated.teamB) ? estimated.teamA : estimated.teamB;
    const a = userA ?? labToHex(other);
    const b = userB ?? labToHex(other);
    model = userColorModel(a, b, estimated);
  }
  if (model) classifyTracks(tracks, model);
  else {
    tracks.forEach((t) => ((t.teamId = "unknown"), (t.teamConfidence = 0)));
    warnings.push("Team colors could not be estimated (too few tracked players). Set team colors manually.");
  }
  if (model && model.confidence < 0.35) {
    warnings.push("Team jersey colors look similar; team assignment is low confidence. Review or correct team colors.");
  }
  const teamAColor = userA ?? (model ? labToHex(model.teamA) : "#2F80ED");
  const teamBColor = userB ?? (model ? labToHex(model.teamB) : "#EB5757");

  // ---- calibration / pitch mapping
  let calibration: CalibrationState = {
    available: false,
    quality: "low",
    method: "image_space",
    notes: "No pitch calibration. Pitch positions are camera-stabilized image-space approximations; physical metrics are unavailable.",
  };
  let mapper: PitchMapper = imageSpaceMapper(summaries, tracks);
  const cal = overrides.calibration;
  if (cal && cal.points.length >= 4) {
    const { H, errorMeters, message } = computeCalibration(cal.points);
    const refIdx = summaries.findIndex((s) => s.frameIndex === cal.referenceFrameIndex);
    if (H && refIdx >= 0) {
      const hm = homographyMapper(summaries, H, refIdx);
      const quality: QualityLevel =
        errorMeters < 1.5 && hm.meanDrift < 0.1 ? "high" : errorMeters < 3.5 && hm.meanDrift < 0.22 ? "medium" : "low";
      mapper = hm.mapper;
      calibration = {
        available: true,
        quality,
        method: "homography",
        transform: H,
        referenceTimestamp: summaries[refIdx].timestampSeconds,
        referenceFrameIndex: cal.referenceFrameIndex,
        points: cal.points,
        reprojectionErrorMeters: errorMeters,
        validFraction: hm.validFraction,
        notes:
          `Homography from ${cal.points.length} landmarks (mean error ${errorMeters.toFixed(1)} m), pan-compensated. ` +
          `Applies to ${(hm.validFraction * 100).toFixed(0)}% of sampled frames; other frames are excluded from pitch metrics.`,
      };
      if (hm.validFraction < 0.5)
        warnings.push("Calibration covers less than half of the clip (camera movement or cuts). Spatial metrics use calibrated frames only.");
    } else {
      warnings.push(`Pitch calibration could not be applied: ${message ?? "reference frame not found"}.`);
    }
  }
  mapTracks(tracks, summaries, mapper);
  const calibrated = calibration.method === "homography";

  // ---- ball, possession, events
  const ball = selectBall(frames, summaries, mapper, aspect);
  const ballCoverage = frames.length ? ball.length / frames.length : 0;
  if (ballCoverage < 0.15)
    warnings.push(`Ball detected in only ${(ballCoverage * 100).toFixed(0)}% of sampled frames; possession and events are limited.`);
  const frameTimes = summaries.map((s) => ({ frameIndex: s.frameIndex, t: s.timestampSeconds }));
  const possession = estimatePossession(frameTimes, tracks, ball, calibrated);
  const durations = sampleDurations(
    summaries.map((s) => s.timestampSeconds),
    sampleInterval * 2.5
  );
  const eventAnalysis = detectEvents(ball, summaries, possession, calibrated, aspect, raw.sampleFps);

  // ---- analytics
  const teamFrames = buildTeamFrames(tracks, summaries, sampleInterval);
  const analyzedSeconds = durations.reduce((s, d) => s + d, 0);
  const { analytics, unknownSeconds } = calculateAnalytics({
    tracks,
    teamFrames,
    possession,
    possessionDurations: durations,
    events: eventAnalysis.events,
    calibration,
    eventQuality: eventAnalysis,
    analyzedSeconds,
  });

  const playerTracks = tracks.filter((t) => t.observations.length >= 2);
  if (playerTracks.length < 4) warnings.push("Very few players were tracked; most analytics are unavailable or unreliable.");
  const cuts = summaries.filter((s) => s.sceneCut).length;
  if (cuts > 0) warnings.push(`${cuts} camera cut${cuts > 1 ? "s" : ""} detected; tracks restart after each cut.`);
  if (raw.cancelledEarly) warnings.push("Analysis stopped early; results cover only the processed part of the clip.");

  const lastT = summaries.length ? summaries[summaries.length - 1].timestampSeconds : 0;
  return {
    sessionId: raw.sessionId,
    video: raw.video,
    teams: {
      teamAName: raw.config.teamAName,
      teamBName: raw.config.teamBName,
      teamAColor,
      teamBColor,
      colorSource: userA && userB ? "user" : "estimated",
      colorConfidence: model?.confidence ?? 0,
    },
    analytics,
    possessionTimeline: possession,
    possessionUnknownSeconds: unknownSeconds,
    events: eventAnalysis.events,
    eventAnalysis: { shots: eventAnalysis.shots, goals: eventAnalysis.goals, notes: eventAnalysis.notes },
    tracks,
    ball,
    frames: summaries,
    warnings,
    coverage: {
      videoDurationSeconds: raw.video.durationSeconds,
      analyzedDurationSeconds: Math.min(raw.video.durationSeconds, lastT + sampleInterval),
      sampledFrameCount: frames.length,
      expectedFrameCount: raw.expectedFrameCount,
      fraction: raw.expectedFrameCount ? frames.length / raw.expectedFrameCount : undefined,
      sampleFps: raw.sampleFps,
    },
    calibration,
    processing: {
      provider: raw.provider,
      model: raw.model,
      inputSize: raw.inputSize,
      mode: raw.mode,
      durationMs: raw.durationMs,
      adaptations: raw.adaptations,
    },
  };
}
