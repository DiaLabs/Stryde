// Logical data contracts from docs/specs.md §7, refined where the implementation needs extra fields.

export type TeamId = "team_a" | "team_b" | "unknown";
export type AnalysisMode = "faster" | "detailed";
export type ExecutionProvider = "webgpu" | "wasm";
export type QualityLevel = "high" | "medium" | "low" | "unavailable";

export interface MatchConfig {
  teamAName: string;
  teamBName: string;
  /** CSS hex color. Undefined means "estimate automatically". */
  teamAColor?: string;
  teamBColor?: string;
  mode: AnalysisMode;
}

export interface VideoMetadata {
  fileName: string;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate?: number;
  fileSizeBytes: number;
}

export type SessionStatus =
  | "idle"
  | "loading"
  | "processing"
  | "rendering"
  | "complete"
  | "cancelled"
  | "failed";

export interface AnalysisSession {
  sessionId: string;
  status: SessionStatus;
  mode: AnalysisMode;
  provider?: ExecutionProvider;
  progress: number;
  stage?: string;
  stageIndex?: number;
  warnings: string[];
  startedAt?: number;
  completedAt?: number;
  processedFrames?: number;
  totalFrames?: number;
}

export interface BoundingBox {
  /** normalized 0..1, top-left */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  frameIndex: number;
  timestampSeconds: number;
  class: "player" | "ball";
  box: BoundingBox;
  confidence: number;
}

/** CIE L*a*b* jersey color sample. */
export type LabColor = [number, number, number];

export interface TrackObservation {
  frameIndex: number;
  timestampSeconds: number;
  box: BoundingBox;
  imageCenterX: number;
  imageCenterY: number;
  pitchX?: number;
  pitchY?: number;
  speedMetersPerSecond?: number;
  confidence: number;
}

export interface ObjectTrack {
  trackId: string;
  objectType: "player" | "ball";
  teamId?: TeamId;
  teamConfidence?: number;
  observations: TrackObservation[];
  status: "active" | "stale" | "ended";
  /** Median jersey color of the track (internal, used for team classification). */
  jerseyColor?: LabColor;
}

export interface PossessionSample {
  timestampSeconds: number;
  teamId: TeamId;
  confidence: number;
  basis: "proximity_temporal" | "unknown";
  /** Track closest to the ball when the sample was assigned. Internal only. */
  nearestTrackId?: string;
}

export interface MatchEvent {
  eventId: string;
  type: "shot" | "goal";
  timestampSeconds: number;
  endTimestampSeconds?: number;
  teamId: TeamId;
  confidence: number;
  quality: QualityLevel;
  description?: string;
  /** Estimated ball path, normalized image coordinates for each observed ball sample. */
  trajectory?: { t: number; x: number; y: number; pitchX?: number; pitchY?: number }[];
}

export interface MetricValue {
  value: number | null;
  unit: string;
  quality: QualityLevel;
  explanation?: string;
}

export interface TeamAnalytics {
  teamId: "team_a" | "team_b";
  possessionPercent: MetricValue;
  possessionSeconds: MetricValue;
  distanceMeters: MetricValue;
  averageSpeedMetersPerSecond: MetricValue;
  widthMeters: MetricValue;
  depthMeters: MetricValue;
  compactness: MetricValue;
  shotCount: MetricValue;
  goalCount: MetricValue;
  averageVisiblePlayers: MetricValue;
  trackCount: MetricValue;
  /** Share of team presence per third of the pitch (left→right in pitch coordinates). */
  thirds: MetricValue[];
  occupancyGrid?: number[][];
}

export interface CalibrationPoint {
  /** normalized image coordinates on the calibration frame */
  imageX: number;
  imageY: number;
  /** pitch coordinates in meters (0..105, 0..68) */
  pitchX: number;
  pitchY: number;
  landmarkId: string;
}

export interface CalibrationState {
  available: boolean;
  quality: QualityLevel;
  method: "homography" | "image_space" | "unavailable";
  notes?: string;
  /** 3x3 row-major homography: normalized image → pitch meters */
  transform?: number[];
  referenceTimestamp?: number;
  referenceFrameIndex?: number;
  points?: CalibrationPoint[];
  reprojectionErrorMeters?: number;
  /** Fraction of sampled frames the homography could be applied to. */
  validFraction?: number;
}

export interface AnalysisResult {
  sessionId: string;
  video: VideoMetadata;
  teams: {
    teamAName: string;
    teamBName: string;
    teamAColor: string;
    teamBColor: string;
    colorSource: "estimated" | "user";
    colorConfidence: number;
  };
  analytics: TeamAnalytics[];
  possessionTimeline: PossessionSample[];
  possessionUnknownSeconds: number;
  events: MatchEvent[];
  eventAnalysis: { shots: QualityLevel; goals: QualityLevel; notes: string[] };
  tracks: ObjectTrack[];
  ball: BallObservation[];
  frames: FrameSummary[];
  warnings: string[];
  coverage: {
    videoDurationSeconds: number;
    analyzedDurationSeconds: number;
    sampledFrameCount: number;
    expectedFrameCount?: number;
    fraction?: number;
    sampleFps: number;
  };
  calibration: CalibrationState;
  processing: {
    provider: ExecutionProvider;
    model: string;
    inputSize: number;
    mode: AnalysisMode;
    durationMs: number;
    adaptations: string[];
  };
}

export interface BallObservation {
  frameIndex: number;
  timestampSeconds: number;
  x: number;
  y: number;
  box: BoundingBox;
  confidence: number;
  pitchX?: number;
  pitchY?: number;
}

/** Per sampled frame information shared by renderer and analytics. */
export interface FrameSummary {
  frameIndex: number;
  timestampSeconds: number;
  /** cumulative camera shift in normalized image units relative to frame 0 */
  cameraX: number;
  cameraY: number;
  sceneCut: boolean;
  /** true when the calibration homography applies to this frame */
  calibrated: boolean;
}

export interface AnalysisError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface OverlayOptions {
  showPlayerBoxes: boolean;
  showTeamLabels: boolean;
  showPossession: boolean;
  showBall: boolean;
  showSpeed: boolean;
  showTrails: boolean;
  showShotEvents: boolean;
  showGoalEvents: boolean;
  showHud: boolean;
  showConfidence: boolean;
}

/* ---------- Worker protocol ---------- */

export interface WorkerPlayerDetection {
  trackId: number;
  box: BoundingBox;
  confidence: number;
  color: LabColor | null;
}

export interface WorkerFrameRecord {
  frameIndex: number;
  timestampSeconds: number;
  players: WorkerPlayerDetection[];
  balls: { box: BoundingBox; confidence: number }[];
  /** frame-to-frame camera shift in normalized units */
  motionX: number;
  motionY: number;
  sceneCut: boolean;
  inferenceMs: number;
}

export interface DetectorSettings {
  modelUrl: string;
  inputSize: number;
  playerThreshold: number;
  ballThreshold: number;
  iouThreshold: number;
  preferredProvider: ExecutionProvider;
}

export type WorkerRequest =
  | { type: "init"; settings: DetectorSettings; ortBase: string; modelBuffer?: ArrayBuffer }
  | { type: "frame"; frameIndex: number; timestampSeconds: number; bitmap: ImageBitmap }
  | { type: "reset" }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready"; provider: ExecutionProvider; warnings: string[] }
  | { type: "frame"; record: WorkerFrameRecord }
  | { type: "error"; code: string; message: string; frameIndex?: number };
