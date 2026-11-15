import type {
  AnalysisMode,
  AnalysisResult,
  CalibrationPoint,
  CalibrationState,
  QualityLevel,
  ExecutionProvider,
  MatchConfig,
  VideoMetadata,
  WorkerFrameRecord,
} from "../types";
import { deltaE, hexToLab, labToHex } from "../vision/color";
import { buildTeamFrames, calculateAnalytics } from "./analytics";
import { selectBall } from "./ball";
import { prepareFrames } from "./detections";
import { detectEvents } from "./events";
import { estimatePossession, sampleDurations } from "./possession";
import { classifyTracks, estimateTeamColors, userColorModel } from "./teams";
import { computeCalibration } from "./calibration";
import { buildFrameSummaries, buildTracks, imageSpaceMapper, mapTracks, multiHomographyMapper, type PitchMapper } from "./tracks";

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
  /** manual pitch calibration: clicked landmarks on one reference frame */
  calibration?: CalibrationReference | null;
  /** additional calibrated reference frames (a panning camera needs several) */
  calibrations?: CalibrationReference[];
}

export interface CalibrationReference {
  points: CalibrationPoint[];
  referenceFrameIndex: number;
}

export function buildResult(raw: RawAnalysis, overrides: AnalysisOverrides = {}): AnalysisResult {
  const frames = prepareFrames(raw.frames.slice().sort((a, b) => a.timestampSeconds - b.timestampSeconds));
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

  // ---- pitch mapping: calibrated homography when landmarks are given, else camera-stabilised image space
  let calibration: CalibrationState = {
    available: false,
    quality: "low",
    method: "image_space",
    notes: "Positions are mapped from camera-stabilized image coordinates. Calibrate the pitch for distances, speeds and team shape.",
  };
  let mapper: PitchMapper = imageSpaceMapper(summaries, tracks);
  const refsIn = [...(overrides.calibrations ?? []), ...(overrides.calibration ? [overrides.calibration] : [])].filter(
    (r, i, all) => r.points.length >= 4 && all.findIndex((q) => q.referenceFrameIndex === r.referenceFrameIndex) === i
  );
  if (refsIn.length) {
    const solved = refsIn.map((r) => ({ r, s: computeCalibration(r.points), idx: summaries.findIndex((x) => x.frameIndex === r.referenceFrameIndex) }));
    const usable = solved.filter((x) => x.s.H && x.idx >= 0);
    for (const x of solved) if (!x.s.H || x.idx < 0) warnings.push(`A pitch calibration could not be applied: ${x.s.message ?? "reference frame not found"}.`);
    if (usable.length) {
      const hm = multiHomographyMapper(
        summaries,
        usable.map((x) => ({ H: x.s.H!, referenceIndex: x.idx }))
      );
      const errorMeters = usable.reduce((acc, x) => acc + x.s.errorMeters, 0) / usable.length;
      const quality: QualityLevel = errorMeters < 1.5 && hm.meanDrift < 0.1 ? "high" : errorMeters < 3.5 && hm.meanDrift < 0.22 ? "medium" : "low";
      mapper = hm.mapper;
      const first = usable[0];
      calibration = {
        available: true,
        quality,
        method: "homography",
        transform: first.s.H!,
        referenceTimestamp: summaries[first.idx].timestampSeconds,
        referenceFrameIndex: first.r.referenceFrameIndex,
        points: first.r.points,
        reprojectionErrorMeters: errorMeters,
        validFraction: hm.validFraction,
        notes:
          `${usable.length === 1 ? "One calibrated frame" : `${usable.length} calibrated frames`} (mean landmark error ${errorMeters.toFixed(1)} m), pan-compensated. ` +
          `Covers ${(hm.validFraction * 100).toFixed(0)}% of sampled frames; other frames are left out of pitch metrics.`,
      };
      if (hm.validFraction < 0.5)
        warnings.push("Calibration covers less than half of the clip because the camera pans away from the calibrated view. Calibrate another frame from the uncovered part to extend it.");
    }
  }
  mapTracks(tracks, summaries, mapper);
  const calibrated = calibration.method === "homography";

  // ---- ball, possession, events
  const ball = selectBall(frames, summaries, mapper, aspect);
  const ballCoverage = frames.length ? ball.length / frames.length : 0;
  if (ballCoverage < 0.2)
    warnings.push(`Ball detected in only ${(ballCoverage * 100).toFixed(0)}% of sampled frames; possession and events are limited.`);
  const frameTimes = summaries.map((s) => ({ frameIndex: s.frameIndex, t: s.timestampSeconds }));
  const possession = estimatePossession(frameTimes, tracks, ball, calibrated, aspect);
  const durations = sampleDurations(
    summaries.map((s) => s.timestampSeconds),
    sampleInterval * 2.5
  );
  const eventAnalysis = detectEvents(ball, summaries, possession, calibrated, aspect, raw.sampleFps, frames);

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
