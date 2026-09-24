# Stryde — Technical Specifications

**Document status:** Initial implementation specification  
**Project:** Stryde  
**Team / organization:** DiaLabs

---

## 1. Purpose and scope

Stryde turns soccer match footage into a browser-based analysis experience containing annotated video, team-level statistics, tactical pitch visualizations, heatmaps, and estimated shot/goal events.

The initial implementation is **browser-first**: the user's device performs video decoding, model inference, tracking, event estimation, analytics, and annotated rendering. The backend is not responsible for computer-vision processing and does not need to store match videos or analysis results.

This document defines the proposed architecture, module boundaries, data contracts, workflows, and algorithmic expectations. Low-level model tuning and implementation details remain subject to benchmarking.

### 1.1 In scope

- Soccer footage supplied by the user as a local video file.
- Player and ball detection.
- Temporary object tracking IDs; no identity recognition.
- Team-color estimation with user correction.
- Estimated team possession.
- Pitch calibration and homography-based mapping where feasible.
- Team-level movement, occupancy, distribution, and heatmap analytics.
- Best-effort shot and goal estimates.
- Annotated video and interactive browser dashboard.
- Faster and more detailed analysis modes.
- Confidence/quality indicators and clear limitations.

### 1.2 Out of scope for the initial version

- Permanent video storage or video archive.
- Server-side inference, mandatory database, or processing queue.
- Individual player profiles, identity recognition, reports, or leaderboards.
- Individual possession statistics.
- Detailed ball trajectory or touch history beyond what is needed for the supported events.
- Pass detection/networks, formation recognition, live streams, multi-sport support, and manual correction of analysis results.
- Downloadable analysis exports.

---

## 2. Product and operating assumptions

- Sport: association football (soccer) only.
- Audience: students and sports enthusiasts.
- Input target: approximately 30 seconds to 1 minute, with 720p and 25 FPS as initial target characteristics. These are target assumptions, not hard guarantees.
- Footage may be broadcast-style with panning/zooming or static sideline footage. Static footage is expected to be easier to calibrate; broadcast footage requires handling camera motion and cuts.
- Processing begins automatically once the user has selected a file and confirmed the match setup.
- Team names may be user-defined or default to Team A and Team B.
- Team colors are estimated automatically and can be corrected before or after processing.
- The user chooses Faster or More Detailed analysis.
- Results are shown in the website dashboard; the initial version does not offer downloadable outputs.
- The product reports best-effort estimates and must not imply certainty where detections or calibration are weak.

---

## 3. System architecture

### 3.1 High-level architecture

```text
Browser
 ├─ Next.js application
 ├─ Local video selection and decoding
 ├─ Analysis coordinator
 ├─ Web Worker(s)
 │   ├─ ONNX Runtime Web
 │   ├─ Object detector (initial candidate: YOLO26n; compare YOLO11n)
 │   ├─ Object tracker
 │   ├─ Team-color classifier
 │   ├─ Pitch calibration / homography
 │   ├─ Possession and event estimators
 │   └─ Analytics aggregation
 ├─ Annotated video renderer
 └─ Dashboard, pitch and heatmap visualizations

Backend / hosting
 ├─ Vercel: serves Next.js application
 └─ Static model assets / application assets
     (No video inference service, database, or queue required initially)
```

The detector and runtime are candidates, not an irrevocable model commitment. Before release, compare supported exports and browser execution performance on representative soccer footage.

### 3.2 Architecture principles

1. **Local-first processing:** The original video remains on the user's device. It is not uploaded for analysis.
2. **No permanent storage:** Do not persist original videos, rendered videos, frames, detections, or analytics on Stryde infrastructure.
3. **Ephemeral browser state:** Keep working data in memory where practical. If temporary browser storage is introduced, document its lifecycle and clear it when the session ends or the user requests cleanup.
4. **Graceful degradation:** Detect available execution providers and capabilities. Prefer WebGPU where supported and tested; use WebAssembly/CPU fallback where feasible.
5. **Modularity:** Detector, tracker, calibration, event logic, analytics, and rendering must be independently replaceable.
6. **Responsive UI:** Intensive processing must not block the main UI thread.
7. **Honest results:** Surface confidence and coverage indicators, and distinguish estimates from verified facts.
8. **No unsupported performance promises:** Set processing-time targets only after benchmarking.

### 3.3 Proposed technology choices

| Layer | Proposed technology | Notes |
|---|---|---|
| Web application | Next.js / React / TypeScript | Hosted on Vercel |
| Inference runtime | ONNX Runtime Web | Validate operator and execution-provider compatibility |
| Primary accelerator | WebGPU | Use only when supported and validated |
| Fallback execution | WebAssembly | CPU fallback; may be slower |
| Background work | Web Workers | Keep inference and frame work off the UI thread |
| Video access | Browser video APIs; evaluate WebCodecs | Select the approach based on browser support and encoding needs |
| Visualization | Canvas or WebGL-capable rendering; SVG/DOM for controls | Keep overlays synchronized with video |
| Model | YOLO26n candidate; YOLO11n benchmark alternative | Model/export choice gated by soccer-footage evaluation |
| Tracking | Lightweight association tracker, ByteTrack-style approach candidate | Browser performance and robustness must be tested |

---

## 4. Application modules

### 4.1 Upload and match setup

Responsibilities:
- Accept a local video file through a file picker and, optionally, drag-and-drop.
- Validate file type and readable metadata.
- Display filename, duration, dimensions, and frame rate when available.
- Collect team names, team colors, and analysis mode.
- Estimate team colors from suitable frames and let the user adjust them.
- Start analysis after setup is complete.

The application must explain that processing occurs locally in the browser.

### 4.2 Analysis coordinator

Responsibilities:
- Create and manage an analysis session.
- Select a processing configuration based on user mode and device capability.
- Load model assets and initialize inference.
- Schedule frame extraction and inference.
- Coordinate tracker, classifier, calibration, event logic, and analytics.
- Report progress, errors, cancellation, and completion.
- Release temporary resources on cancellation, failure, or session teardown.

### 4.3 Detection module

Input: decoded or preprocessed frame.  
Output: object detections with class, bounding box, confidence, and frame timestamp/index.

Required classes:
- Person/player candidate.
- Soccer ball.

The detector must support configurable input size and thresholds. Defaults must be established by evaluation rather than assumed universally optimal. The system should preserve detector confidence and avoid silently treating low-confidence objects as certain.

### 4.4 Tracking module

Responsibilities:
- Associate detections across processed frames.
- Assign temporary track IDs.
- Maintain track state, timestamps, bounding boxes, and association confidence.
- Handle short occlusions and missed detections conservatively.
- Expire stale tracks.

Track IDs are technical identifiers only. They must not be linked to real-world identities or presented as player names.

### 4.5 Team classification module

Responsibilities:
- Estimate team colors from player crops and/or representative frames.
- Assign player tracks to one of two teams when evidence is adequate.
- Support user-provided team names and color corrections.
- Re-evaluate team assignments after user correction where possible.

If the classification is ambiguous, retain an unknown/uncertain assignment rather than forcing a confident team label.

### 4.6 Pitch calibration module

Responsibilities:
- Estimate the mapping from image coordinates to a standardized pitch coordinate system.
- Use field lines/landmarks and user-assisted calibration if implemented.
- Support homography mapping when sufficient geometric evidence exists.
- Track calibration quality and indicate when measurements are only image-space estimates.

A broadcast camera pan, zoom, or cut may invalidate a previous mapping. The implementation should detect or conservatively handle these changes; it must not assume a single fixed homography applies to an entire broadcast video.

### 4.7 Possession estimator

Responsibilities:
- Estimate which team is in possession over time using ball detections, proximity to player tracks, temporal consistency, and team assignments.
- Permit an unknown/contested state when evidence is insufficient.
- Aggregate team possession duration and percentage over valid analyzed intervals.

Do not calculate or display individual player possession statistics. The output is an estimate, not an official match statistic.

### 4.8 Shot and goal event estimator

Responsibilities:
- Identify possible shot attempts directed toward the goal using available ball/player observations and pitch geometry.
- Estimate possible goals when evidence suggests the ball crossed the goal line into the goal.
- Attach timestamps and confidence/quality information.
- Avoid asserting an event when evidence is too weak.

Goal-line and shot inference are best-effort features. Results must be labeled as estimates and may be unavailable for unsuitable footage.

### 4.9 Analytics aggregator

Responsibilities:
- Produce team-level statistics and time series.
- Generate team occupancy and movement distributions.
- Compute aggregate speed/distance only when tracking and pitch calibration support meaningful physical units.
- Compute width, depth, or compactness only when the underlying data quality is adequate.
- Aggregate shot and goal estimates.
- Preserve quality metadata for each metric.

### 4.10 Annotated renderer

Responsibilities:
- Render player boxes and team labels.
- Render ball indicator when detected.
- Render estimated possession highlighting.
- Render speed only when reliable and calibrated; otherwise omit it or clearly label it as an image-space estimate.
- Render shot trajectory/event indicators when supported.
- Optionally render short trails if performance permits.
- Keep annotations synchronized with the video timeline.

The overlay must remain readable and must not imply that missing detections mean an object was absent.

### 4.11 Dashboard

Responsibilities:
- Play, pause, seek, and change playback speed.
- Show annotated video.
- Show team statistics side by side.
- Show tactical pitch and heatmaps.
- Allow switching between teams and heatmap types.
- Allow both teams to be displayed simultaneously.
- Keep visualizations synchronized with video time where applicable.
- Display analysis status, limitations, confidence, and warnings.

---

## 5. Analysis workflow

1. User selects a local video.
2. Browser reads metadata and validates basic compatibility.
3. User enters team names, reviews/corrects estimated colors, and chooses Faster or More Detailed.
4. Coordinator checks browser capabilities and initializes a supported inference backend.
5. Video frames are sampled according to the selected mode and validated device profile.
6. Detector returns player and ball detections.
7. Tracker associates detections across processed frames.
8. Team classifier assigns teams or marks uncertainty.
9. Calibration module estimates pitch coordinates where possible.
10. Possession and event estimators produce time-indexed estimates.
11. Analytics aggregator computes team metrics and quality indicators.
12. Renderer generates synchronized annotated playback.
13. Dashboard presents video, team metrics, pitch visualizations, heatmaps, and events.
14. On user exit, cancellation, or cleanup, release object URLs, frame buffers, model/session resources when no longer needed, and temporary analysis state.

The app must support cancellation and surface recoverable errors without leaving large buffers or workers running unnecessarily.

---

## 6. Analysis modes and performance behavior

### 6.1 Faster

- Favor lower inference cost and responsive progress updates.
- Sample fewer frames and/or use a smaller model input size, subject to quality validation.
- Retain enough temporal information for useful tracking and team-level analysis.
- Clearly communicate reduced temporal coverage where relevant.

### 6.2 More Detailed

- Process more frames and/or use a larger input size, subject to device limits.
- Prefer richer temporal coverage for tracking and event estimates.
- Warn users if memory, thermal, or runtime constraints require reducing the workload.

### 6.3 Adaptive execution

The coordinator may adjust processing settings based on detected capabilities and runtime failures. Any adaptation that materially reduces analysis coverage should be reflected in the result metadata.

Do not hard-code promised processing durations before testing. Benchmark across representative desktop and mobile devices, browsers, GPU/CPU execution providers, video resolutions, and camera styles.

---

## 7. Data models

The following TypeScript-like interfaces define logical contracts. Implementations may refine field names while preserving meaning.

```ts
type TeamId = "team_a" | "team_b" | "unknown";
type AnalysisMode = "faster" | "detailed";
type ExecutionProvider = "webgpu" | "wasm";
type QualityLevel = "high" | "medium" | "low" | "unavailable";

interface MatchConfig {
  teamAName: string;
  teamBName: string;
  teamAColor?: string; // CSS color, user-correctable
  teamBColor?: string;
  mode: AnalysisMode;
}

interface VideoMetadata {
  fileName: string;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate?: number;
  fileSizeBytes: number;
}

interface AnalysisSession {
  sessionId: string; // random, session-local identifier
  status: "idle" | "loading" | "processing" | "rendering" |
          "complete" | "cancelled" | "failed";
  mode: AnalysisMode;
  provider?: ExecutionProvider;
  progress: number; // 0..1
  stage?: string;
  warnings: string[];
  startedAt?: number;
  completedAt?: number;
}

interface BoundingBox {
  x: number; // normalized 0..1, top-left
  y: number; // normalized 0..1, top-left
  width: number; // normalized 0..1
  height: number; // normalized 0..1
}

interface Detection {
  frameIndex: number;
  timestampSeconds: number;
  class: "player" | "ball";
  box: BoundingBox;
  confidence: number; // 0..1
}

interface TrackObservation {
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

interface ObjectTrack {
  trackId: string; // ephemeral; not an identity
  objectType: "player" | "ball";
  teamId?: TeamId;
  teamConfidence?: number;
  observations: TrackObservation[];
  status: "active" | "stale" | "ended";
}

interface PossessionSample {
  timestampSeconds: number;
  teamId: TeamId;
  confidence: number;
  basis: "proximity_temporal" | "unknown";
}

interface MatchEvent {
  eventId: string;
  type: "shot" | "goal";
  timestampSeconds: number;
  teamId: TeamId;
  confidence: number;
  description?: string;
}

interface MetricValue {
  value: number | null;
  unit: string;
  quality: QualityLevel;
  explanation?: string;
}

interface TeamAnalytics {
  teamId: "team_a" | "team_b";
  possessionPercent: MetricValue;
  distanceMeters?: MetricValue;
  averageSpeedMetersPerSecond?: MetricValue;
  widthMeters?: MetricValue;
  depthMeters?: MetricValue;
  compactness?: MetricValue;
  shotCount: MetricValue;
  goalCount: MetricValue;
  occupancyGrid?: number[][];
}

interface AnalysisResult {
  sessionId: string;
  video: VideoMetadata;
  teams: {
    teamAName: string;
    teamBName: string;
    teamAColor?: string;
    teamBColor?: string;
  };
  analytics: TeamAnalytics[];
  possessionTimeline: PossessionSample[];
  events: MatchEvent[];
  tracks: ObjectTrack[];
  warnings: string[];
  coverage: {
    videoDurationSeconds: number;
    analyzedDurationSeconds: number;
    sampledFrameCount: number;
    expectedFrameCount?: number;
    fraction?: number;
  };
  calibration: {
    available: boolean;
    quality: QualityLevel;
    method?: "homography" | "image_space" | "unavailable";
    notes?: string;
  };
}
```

### Data lifecycle

- These objects are held locally for the active analysis session.
- Do not send them to a server in the initial architecture.
- Avoid retaining full decoded frames after their processing is complete.
- Clear references and revoke object URLs when the session is disposed.
- Track IDs and session IDs must not be treated as persistent user identifiers.

---

## 8. API and module contracts

The initial application does not require a Stryde application backend API for analysis. Contracts below are internal browser module boundaries.

### 8.1 Analysis coordinator

```ts
interface AnalysisCoordinator {
  initialize(config: MatchConfig, video: File): Promise<AnalysisSession>;
  start(): Promise<void>;
  cancel(): Promise<void>;
  getSession(): AnalysisSession;
  onProgress(callback: (session: AnalysisSession) => void): () => void;
  onComplete(callback: (result: AnalysisResult) => void): () => void;
  onError(callback: (error: AnalysisError) => void): () => void;
  dispose(): Promise<void>;
}

interface AnalysisError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}
```

### 8.2 Detector

```ts
interface Detector {
  load(provider: ExecutionProvider): Promise<void>;
  detect(frame: ImageData | VideoFrame, timestampSeconds: number):
    Promise<Detection[]>;
  dispose(): Promise<void>;
}
```

### 8.3 Tracker

```ts
interface Tracker {
  update(detections: Detection[], timestampSeconds: number): ObjectTrack[];
  getTracks(): ObjectTrack[];
  reset(): void;
}
```

### 8.4 Team classifier

```ts
interface TeamClassifier {
  estimateColors(samples: ImageData[]): Promise<{
    teamAColor?: string;
    teamBColor?: string;
    confidence: number;
  }>;
  classifyTracks(tracks: ObjectTrack[], config: MatchConfig): ObjectTrack[];
  applyCorrection(teamId: "team_a" | "team_b", color: string): void;
}
```

### 8.5 Calibration

```ts
interface PitchCalibrator {
  calibrate(frame: ImageData, hints?: unknown): Promise<{
    available: boolean;
    quality: QualityLevel;
    transform?: number[]; // 3x3 homography, row-major
    notes?: string;
  }>;
  imageToPitch(x: number, y: number): { x: number; y: number } | null;
  reset(): void;
}
```

### 8.6 Analytics

```ts
interface AnalyticsEngine {
  calculate(
    tracks: ObjectTrack[],
    possession: PossessionSample[],
    events: MatchEvent[],
    calibrationQuality: QualityLevel
  ): TeamAnalytics[];
}
```

### 8.7 Renderer

```ts
interface AnnotationRenderer {
  renderFrame(
    source: CanvasImageSource,
    timestampSeconds: number,
    tracks: ObjectTrack[],
    possession: PossessionSample[],
    events: MatchEvent[],
    options: OverlayOptions
  ): Promise<void>;
  dispose(): void;
}

interface OverlayOptions {
  showPlayerBoxes: boolean;
  showTeamLabels: boolean;
  showPossession: boolean;
  showBall: boolean;
  showSpeed: boolean;
  showTrails: boolean;
  showShotEvents: boolean;
  showGoalEvents: boolean;
}
```

---

## 9. Metric definitions and interpretation

Metrics must include units and quality metadata. Exact thresholds and filtering parameters are implementation/evaluation decisions.

- **Team possession percentage:** proportion of valid analyzed time assigned to each team. Unknown/contested intervals should be excluded from the denominator or reported separately; the chosen convention must be documented in the UI.
- **Occupancy/heatmap:** spatial distribution of a team's tracked player positions over valid calibrated or image-space observations. State the coordinate basis.
- **Distance and average speed:** compute only when track continuity and calibration support physical units. Otherwise return unavailable rather than inventing meters.
- **Width/depth/compactness:** derive from simultaneous team positions only when enough players are visible and coordinate mapping is credible.
- **Shots/goals:** count detected candidate events, label them estimated, and expose confidence/limitations.
- **Coverage:** report analyzed duration and sampled-frame coverage so users can understand gaps.

The UI must not present estimates as official league statistics or imply that low-quality metrics are authoritative.

---

## 10. User interface requirements

### 10.1 Main states

1. **Select video:** choose local file and view compatibility information.
2. **Configure match:** edit team names/colors and select analysis mode.
3. **Processing:** progress stage, progress indicator, cancel action, and warnings.
4. **Results:** annotated playback, statistics, pitch, heatmaps, and event timeline.
5. **Error/unsupported:** concise explanation and practical next steps.

### 10.2 Playback

- Play/pause.
- Seek using the video timeline.
- Change playback speed.
- Keep overlays synchronized with the current timestamp.
- Ensure controls remain responsive during analysis and playback.

### 10.3 Analytics display

- Team statistics shown side by side.
- Heatmap controls to select team(s) and heatmap type.
- Both teams may be shown simultaneously.
- Pitch visualization synchronized with playback where feasible.
- Missing or low-quality values must have a visible explanation.

---

## 11. Privacy, security, and resource management

- The initial design must not upload match footage or analysis payloads to Stryde servers.
- Do not persist videos, frames, tracks, or analytics in a database or object store.
- Do not log local filenames, video content, frame images, or detailed analysis payloads to remote telemetry.
- Explain local processing and its limitations to the user.
- Validate file type and handle malformed or unsupported media safely.
- Treat model assets as application resources; version and integrity-check them as appropriate.
- Use session-local random identifiers only.
- Terminate workers and release model sessions, frame buffers, canvases, and object URLs on cancellation, completion cleanup, navigation, or failure.
- If a browser crashes or reloads, analysis may be lost; the initial version does not promise resumability.
- Avoid retaining large frame arrays. Prefer incremental processing and bounded queues.

---

## 12. Error handling

The app should handle at least:

- Unsupported or unreadable video format.
- Browser lacks a supported inference backend.
- Model download/load failure.
- ONNX operator or execution-provider incompatibility.
- GPU/device memory exhaustion.
- Worker initialization or runtime failure.
- Decoder failure or malformed media.
- Insufficient detections for meaningful analysis.
- Unreliable team-color separation.
- Insufficient pitch landmarks or invalidated calibration.
- Cancellation or navigation during processing.
- Rendering/encoding failure.

For each failure, provide a concise explanation and, where possible, an action such as retrying with Faster mode, using a supported browser, or choosing a shorter/lower-resolution video. Do not silently substitute unsupported results.

---

## 13. Testing and acceptance criteria

### 13.1 Functional acceptance

- A user can select a local soccer video and configure teams and analysis mode.
- Video analysis runs in the browser without uploading the video to Stryde infrastructure.
- The UI remains responsive during inference.
- Player/ball detections can be visualized with confidence values.
- Temporary tracking IDs persist across suitable consecutive detections.
- Team colors can be corrected by the user.
- Team possession is estimated with an unknown state for ambiguous intervals.
- The app produces team-level statistics and heatmaps where the data supports them.
- Shot/goal estimates include timestamps and confidence/quality information.
- Annotated playback supports pause, seek, and playback-speed changes.
- The app exposes warnings and coverage/quality indicators.
- Cancellation and session cleanup release resources.

### 13.2 Performance and compatibility evaluation

Before setting release thresholds, benchmark:

- YOLO26n versus YOLO11n candidate exports.
- WebGPU versus WASM on supported devices.
- Faster versus More Detailed mode.
- Player detection and ball detection separately.
- Tracking continuity and team assignment.
- Memory use, UI responsiveness, and browser stability.
- Static sideline footage versus broadcast footage with pans/zooms/cuts.
- Representative browsers and device classes.

### 13.3 Quality evaluation

Create a small, manually reviewed evaluation set covering:
- Clear and distant players.
- Ball visible, small, blurred, and occluded.
- Similar and contrasting team colors.
- Camera motion and cuts.
- Crowded play near goals.
- Static and broadcast camera views.

Measure precision/recall or suitable detection metrics, tracking continuity, team classification accuracy, possession agreement, and event-estimation performance. Report sample size and limitations; do not claim general reliability from a small set.

---

## 14. Implementation phases

### Phase 1 — Browser inference proof of concept
- Load local video.
- Initialize candidate ONNX model.
- Run sampled-frame inference in a worker.
- Display detections and progress.
- Validate WebGPU/WASM support and basic resource cleanup.

### Phase 2 — Tracking and team classification
- Add track association and temporary IDs.
- Add automatic team-color estimation and correction.
- Evaluate across representative clips.

### Phase 3 — Pitch calibration and team analytics
- Implement pitch mapping and calibration-quality reporting.
- Add team occupancy, heatmaps, and supported aggregate metrics.
- Distinguish calibrated physical measurements from image-space metrics.

### Phase 4 — Possession and events
- Add team possession estimation.
- Add best-effort shot and goal event logic.
- Include confidence and unknown states.

### Phase 5 — Dashboard and annotated rendering
- Integrate video controls, overlays, side-by-side statistics, pitch, heatmaps, and event timeline.
- Validate synchronization and responsiveness.

### Phase 6 — Benchmark, harden, and release
- Benchmark models, execution providers, modes, browsers, and devices.
- Tune thresholds and sampling strategy.
- Test cancellation, memory pressure, unsupported media, and cleanup.
- Document supported environments and known limitations.

---

## 15. Open technical decisions

These decisions should be settled through implementation and evaluation:

1. Final detector and export format: YOLO26n versus YOLO11n or a soccer-specialized model.
2. Exact input dimensions, confidence thresholds, and non-maximum suppression settings.
3. Frame-sampling rates for each mode.
4. Tracker implementation and association parameters.
5. Whether to use WebCodecs or a canvas/video-element pipeline for annotated output.
6. Whether browser output should be encoded as a Blob or rendered through synchronized overlays over the source video.
7. Pitch calibration method and whether user-assisted landmark selection is needed for the first release.
8. Which aggregate physical metrics meet a minimum quality threshold.
9. Supported browser/device matrix and measurable performance acceptance targets.
10. Whether a later optional server/GPU fallback is warranted; it is not part of the initial local-only processing design.

---

## 16. Definition of done

The initial version is ready for evaluation when a user can select a supported soccer clip, configure two teams, run browser-side analysis, view annotated playback and team-level visualizations, and understand which results are estimates or unavailable due to quality limitations—without uploading the match video to Stryde's backend.
