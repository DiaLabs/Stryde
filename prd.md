# Product Requirements Document (PRD)

## Stryde --- Real-Time Sports Analytics Platform

**Project ID:** TECH26-016\
**Team:** DiaLabs\
**Version:** 1.0\
**Status:** Draft --- requirements consolidated from product discovery\
**Initial sport:** Football (soccer)

------------------------------------------------------------------------

## 1. Product Overview

Stryde is a web-based football video analytics platform that converts
ordinary match footage into team-focused performance statistics and a
broadcast-style match-analysis experience.

Users upload a short football video. The system processes it, detects
and tracks players, identifies their teams, estimates team possession,
maps player movement onto a 2D pitch, and generates analytics. The
completed analysis is presented in the browser through an annotated
video player, a television-style HUD, team comparisons, and interactive
pitch visualizations.

The product prioritizes team-level insights. Temporary player tracking
identities may be used internally to maintain tracks and calculate
movement, but the initial release will not provide individual-player
profiles, named-player recognition, or individual performance
leaderboards.

## 2. Product Vision

Make football match analysis accessible through a simple web experience
that turns video into understandable team statistics and visual tactical
context, without requiring specialized tracking hardware.

The main experience combines: 1. An annotated video as the primary
focus. 2. A broadcast-style HUD showing match and team information. 3.
Team-level statistics and comparisons. 4. A 2D pitch with synchronized
movement and occupancy heatmaps.

## 3. Target Users

**Primary audience:** Students and sports enthusiasts.

The product should be approachable to users who want to explore football
footage and understand team-level performance without needing
professional analysis software or specialist knowledge.

## 4. Goals and Success Criteria

### 4.1 Product goals

-   Allow a user to upload football footage and automatically start
    analysis.
-   Detect and track players across video frames.
-   Assign detected players to Team A, Team B, or Unknown.
-   Estimate which team has possession, using lightweight ball detection
    and temporal reasoning.
-   Produce team-level movement, distribution, occupancy, and possession
    insights.
-   Present the analysis in an engaging broadcast-style video and
    interactive dashboard.
-   Provide a 2D pitch visualization, preferring calibrated coordinates
    when calibration is available.
-   Attempt shot and goal event detection, while communicating
    uncertainty.

### 4.2 Initial success criteria

The initial product should demonstrate that a user can: - Upload a
supported video and see processing progress. - View a processed video
with player boxes and team labels. - See possession indication and team
possession statistics when the estimator has sufficient evidence. -
Compare Team A and Team B statistics side by side. - Switch teams and
heatmap types, view both teams together, and synchronize the pitch
display with video playback. - See confidence/uncertainty indicators
where results are less reliable. - Play, pause, seek, and change
playback speed.

No numeric accuracy or performance guarantees are defined in this PRD.
Those should be established through implementation testing and
documented in the technical specifications.

## 5. Scope

### 5.1 In scope --- initial release

-   Football (soccer) only.
-   Video upload and automatic processing initiation.
-   Video metadata extraction and basic validation.
-   Player detection and multi-object tracking.
-   Team-color estimation and user correction of team color/team
    assignment configuration.
-   Lightweight ball detection for team possession estimation.
-   Team possession percentage and possession timeline.
-   Player bounding-box overlays with team labels.
-   Possession highlighting on players associated with the team
    currently estimated to have possession.
-   Player speed overlays when calibration and tracking quality support
    meaningful estimates.
-   Player movement trails, if supported by the tracking output.
-   Homography-based pitch mapping, with a standardized pitch fallback.
-   Team-level movement and occupancy heatmaps.
-   Team distribution and pitch-zone analysis.
-   Side-by-side team statistics.
-   Shot-attempt detection and shot trajectory visualization.
-   Goal detection attempts for cases where the ball crosses the goal
    line.
-   Annotated video playback with broadcast-style HUD.
-   Interactive dashboard with synchronized video and pitch analytics.
-   Best-effort results and confidence indicators.

### 5.2 Out of scope --- initial release

-   Individual-player reports, profiles, or performance leaderboards.
-   Recognition of real-world player identities or names.
-   Detailed reconstruction of the ball's complete trajectory throughout
    the match.
-   Individual touch tracking and individual possession heatmaps.
-   Pass detection, pass networks, and pass-completion statistics.
-   Advanced event detection beyond the specified shot and goal
    attempts.
-   Automated formation recognition and advanced tactical
    recommendations.
-   Live camera or RTSP-stream analysis.
-   Multi-sport support.
-   A manual correction interface for detected tracks, possession,
    shots, or goals.
-   Downloadable reports, heatmap images, or tracking-data exports.
    Results are displayed in the website dashboard.

## 6. Supported Inputs and Video Assumptions

### 6.1 Sport

Football/soccer.

### 6.2 Preferred footage

-   Broadcast footage with camera panning and zooming is a target input.
-   Static sideline footage is preferred where available because it may
    simplify spatial analysis.
-   The system should communicate that camera movement, occlusion, poor
    visibility, and framing can affect results.

### 6.3 Initial video constraints

-   Intended initial clip duration: approximately 30 seconds to 1
    minute.
-   Target input quality: 720p at 25 FPS.
-   The PRD does not define a complete list of supported codecs,
    containers, file-size limits, or aspect ratios. These must be
    specified and validated during technical design.

### 6.4 Upload behavior

Once upload completes successfully, processing begins automatically. The
user should not need to press a separate "Start analysis" button.

## 7. User Journey

1.  **Open the application.** The user reaches the upload/landing
    experience.
2.  **Provide match details.** The user may enter team names and
    configure team colors. Defaults such as "Team A" and "Team B" are
    available.
3.  **Upload footage.** The user selects a football video.
4.  **Validate and inspect.** The system checks whether the video can be
    processed and extracts basic metadata.
5.  **Begin processing automatically.** The application displays job
    status and progress.
6.  **Review team identification.** The system estimates team colors and
    exposes a way for the user to correct the team-color selections
    before or after processing. The exact reprocessing behavior for
    post-processing changes remains to be finalized in technical design.
7.  **Complete analysis.** The system stores results and creates the
    annotated video and visual analytics.
8.  **View the match dashboard.** The user watches the annotated video
    and explores the synchronized pitch, heatmaps, and team statistics.
9.  **Replay and inspect.** The user can pause, seek, and change
    playback speed, and can switch between teams and heatmap types.

## 8. Functional Requirements

### FR-01: Video upload

The application shall allow users to upload a football video that meets
the supported input constraints.

### FR-02: Automatic processing

The system shall start processing automatically after a successful
upload and validation.

### FR-03: Video validation and metadata

The system shall validate basic video readability and obtain available
metadata such as duration, frame rate, resolution, and frame count. If
the video cannot be processed, the application shall present a clear
failure state.

### FR-04: Player detection and tracking

The system shall detect players and maintain temporary track identifiers
across frames to support bounding-box continuity and movement
calculations. These identifiers are internal tracking references, not
real-world identities.

### FR-05: Team identification

The system shall estimate team grouping from visual/jersey-color
information and distinguish Team A, Team B, and Unknown where necessary.
Users shall be able to correct the estimated team-color selections. Team
names and display colors may be configured.

### FR-06: Annotated video

The system shall generate a playable annotated video containing player
bounding boxes and team labels. Additional supported overlays include
possession highlighting, speed, movement trails, ball indication, shot
trajectory, goal-event indicators, and a team possession HUD.

### FR-07: Team possession estimation

The system shall use lightweight ball detection and temporal
consistency, including proximity to tracked players, to estimate the
team in possession. It shall not attempt full-match ball trajectory
reconstruction or individual touch analytics in the initial release.

Possession must be treated as an estimate. When evidence is
insufficient, the system should represent possession as unknown or
uncertain rather than asserting an unsupported team assignment.

### FR-08: Team possession statistics

The system shall calculate and display estimated possession percentages
for Team A and Team B and provide a possession timeline where supported
by the analysis. The dashboard shall present team statistics side by
side.

### FR-09: Spatial mapping

The system shall support a standardized pitch view. It should prioritize
mapping image coordinates to pitch coordinates through calibration and
homography when calibration can be established. The application shall
indicate when spatial metrics are approximate or unavailable.

### FR-10: Team movement and occupancy analytics

The system shall calculate team-level movement and pitch occupancy from
tracked player positions. It shall provide team distribution and
movement-zone visualizations.

### FR-11: Heatmaps

The dashboard shall support: - Team A movement/occupancy
visualization. - Team B movement/occupancy visualization. - A view
comparing or displaying both teams simultaneously. - Switching between
available heatmap types. - Synchronization of the pitch/heatmap state
with video playback.

Ball-location heatmaps and individual touch/possession heatmaps are
excluded from the initial release.

### FR-12: Team-level statistics

The dashboard shall display team statistics side by side. Candidate
metrics include: - Estimated possession percentage. - Field occupancy
and pitch-zone presence. - Team distribution and movement patterns. -
Aggregate movement/distance and speed metrics, only when tracking and
calibration quality make them meaningful. - Team width, depth, or
compactness, if reliably derived. - Detected shot attempts and potential
goals, with uncertainty communicated.

The exact formulas and metric inclusion thresholds belong in `specs.md`.

### FR-13: Shot detection and trajectory

The system shall attempt to detect shot attempts toward the goal and
visualize an estimated trajectory for the shot. This is limited
event-specific ball analysis and does not imply general ball trajectory
tracking throughout the match. Shot outputs shall be presented as
detections/estimates, not guaranteed ground truth.

### FR-14: Goal detection

The system shall attempt to detect a goal event when the ball crosses
the goal line and enters the goal. Because visual evidence may be
incomplete, detected goals should be identified as potential/estimated
events where confidence is limited. The PRD does not require a manual
event-correction interface.

### FR-15: Dashboard and synchronized playback

The match dashboard shall combine: - Annotated video as the primary
visual element. - Broadcast-style HUD. - Team statistics displayed side
by side. - Possession information and timeline, where available. - A 2D
pitch and heatmaps. - Team distribution and movement-zone information.

Pitch positions and heatmaps shall correspond to the current video time
to the extent supported by the processed data.

### FR-16: Playback controls

The user shall be able to play, pause, seek, and change playback speed.

### FR-17: Confidence and partial results

The system shall use best-effort processing and show available results
even when some analytics cannot be produced. Confidence or uncertainty
indicators shall be used for uncertain outputs. The initial release
shall not include a manual correction workflow for analytics.

### FR-18: Processing status

The application shall communicate processing status and progress. The
user should be able to distinguish queued/processing/completed/failed
states. Detailed stages and progress reporting mechanics will be defined
in `specs.md`.

## 9. Dashboard Information Architecture

### 9.1 Primary video area

-   Annotated match video.
-   Player boxes and team labels.
-   Possession highlight and HUD.
-   Optional speed and movement trails where supported.
-   Shot trajectory and goal indicators when detected.
-   Standard playback controls.

### 9.2 Match/team overview

-   Team A and Team B statistics side by side.
-   Estimated possession share.
-   Possession timeline.
-   Shot and goal event summaries, with uncertainty labels.

### 9.3 Tactical pitch area

-   2D pitch projection.
-   Team switching and simultaneous team display.
-   Heatmap-type selection.
-   Team movement and occupancy.
-   Distribution and movement-zone information.
-   Synchronization with the video time.

### 9.4 Display principles

-   Video is the main attraction; analytics support and contextualize
    it.
-   Use team colors consistently across labels, bounding boxes, pitch
    markers, and statistics.
-   Do not display individual performance rankings or imply real-world
    player identity.
-   Do not present uncertain computer-vision estimates as definitive
    facts.

## 10. Analytics Definitions --- Product-Level

These are product-level meanings. Exact algorithms, thresholds,
smoothing, and confidence calculations will be documented in `specs.md`.

  -----------------------------------------------------------------------
  Analytics                           Product definition
  ----------------------------------- -----------------------------------
  Team possession                     Estimated share of analyzed time
                                      during which a team controls the
                                      ball.

  Team occupancy                      Distribution of tracked team-player
                                      presence across the pitch.

  Team movement heatmap               Spatial density of tracked player
                                      movement for a team.

  Team distribution                   How a team's tracked players are
                                      spread across the pitch at a given
                                      time or interval.

  Movement zones                      Aggregated presence or movement
                                      within defined pitch regions.

  Aggregate speed/distance            Estimated team movement derived
                                      from tracked positions; dependent
                                      on suitable calibration and
                                      tracking quality.

  Shot attempt                        A detected player action
                                      interpreted as an attempt toward
                                      goal.

  Shot trajectory                     Estimated ball path associated with
                                      a detected shot, not a full-match
                                      ball path.

  Goal event                          A potential event where visual
                                      analysis indicates the ball crossed
                                      the goal line into the goal.
  -----------------------------------------------------------------------

## 11. Non-Functional Requirements

### 11.1 Usability

-   Upload and processing status must be understandable to
    non-specialist users.
-   The dashboard must make the video, team comparison, and pitch
    visualizations easy to navigate.
-   Team colors and labels should remain consistent throughout the
    interface.

### 11.2 Reliability and graceful degradation

-   Invalid or unreadable videos should produce a clear error.
-   Where only some analytics fail, the system should return available
    results and identify unavailable/uncertain metrics.
-   The application should not fabricate missing positions, possession,
    shots, or goals.

### 11.3 Performance and processing

-   Video inference is computationally intensive and should be handled
    as a background processing workload rather than blocking a normal
    API request.
-   The product should expose processing progress.
-   Exact latency, concurrency, resolution, and resource targets remain
    to be set in technical design and validated against deployment
    capacity.

### 11.4 Privacy and data lifecycle

-   The product will handle user-uploaded video and generated analysis
    artifacts.
-   Retention duration, account requirements, access controls, and
    deletion behavior are not yet specified and must be decided before
    production deployment.

### 11.5 Compatibility

-   The application is a web application.
-   Browser support, mobile responsiveness requirements, and
    accessibility targets remain to be defined in `design.md` and
    technical planning.

## 12. Error and Uncertainty Handling

The product should distinguish between: - **Processing failure:** The
video cannot be decoded or the job cannot continue. - **Partial
analysis:** The video is usable, but one or more analytics are
unavailable. - **Low-confidence result:** An output exists but is
uncertain. - **Unknown state:** The system has insufficient evidence to
assign a team or event.

Where possible, partial analysis should still be viewable. A failure
should include a clear explanation and an appropriate next step. No
manual analytics correction interface is required in the initial
release.

## 13. Acceptance Criteria

The initial release is acceptable when the following can be demonstrated
on supported football footage:

1.  A user can upload a valid video and processing starts automatically.
2.  The application displays meaningful processing status.
3.  The system produces an annotated video with player detections and
    team labels when detections are available.
4.  Team-color estimates can be reviewed and corrected through the
    supported configuration flow.
5.  The system produces team possession estimates when ball evidence is
    sufficient and handles uncertain possession explicitly.
6.  The dashboard displays Team A and Team B statistics side by side.
7.  A 2D pitch view and team heatmaps are available, with team/type
    switching and a both-teams view.
8.  Pitch/heatmap information follows the video timeline to the extent
    supported by the processed data.
9.  The user can play, pause, seek, and change playback speed.
10. Shot-attempt/trajectory and goal detection are attempted and
    uncertain outputs are communicated appropriately.
11. The system presents partial results when feasible and clearly
    reports unrecoverable processing failures.
12. The initial product does not expose individual-player performance
    reports, real-world identity recognition, full ball trajectory
    analytics, or downloadable reports.

## 14. Risks and Dependencies

  -----------------------------------------------------------------------
  Risk/dependency                     Product impact / handling
  ----------------------------------- -----------------------------------
  Ball is small, blurred, or occluded Possession, shots, and goals may be
                                      uncertain; use confidence/unknown
                                      states.

  Broadcast camera pans and zooms     Image coordinates may not
                                      correspond to stable pitch
                                      coordinates; calibration and
                                      camera-motion handling are
                                      important.

  Team jersey colors overlap          Team grouping may be ambiguous;
                                      allow user correction and an
                                      Unknown class.

  Player occlusion and missed         Tracking and movement metrics may
  detections                          degrade; provide best-effort output
                                      and confidence cues.

  Homography/calibration quality      Speed, distance, occupancy, and
                                      tactical metrics depend on reliable
                                      spatial mapping.

  Compute and hosting constraints     Video processing must be separated
                                      from request handling and sized to
                                      the selected infrastructure.

  Goal/shot interpretation            These are difficult visual events;
                                      treat detections as estimates and
                                      avoid guaranteeing correctness.
  -----------------------------------------------------------------------

## 15. Future Roadmap

The following are future possibilities and are not commitments for the
initial release: - Individual-player statistics, reports, and
leaderboards. - Real-world player identity recognition. - Full ball
trajectory and ball-speed analytics. - Individual touch and possession
heatmaps. - Pass detection, pass networks, and completion statistics. -
Additional event detection such as interceptions and carries. -
Automated formation recognition and advanced tactical analysis. - Live
camera/RTSP analytics. - Support for sports beyond football. - Manual
correction of tracks, possession, and detected events. - Exportable
reports, heatmaps, or tracking data.

## 16. Related Project Documents

-   **`specs.md`** --- Detailed technical architecture, processing
    pipeline, data model, endpoints, algorithms, job lifecycle, and
    implementation constraints.
-   **`design.md`** --- Visual design language, dashboard structure,
    components, interaction patterns, and responsive behavior.

These documents should remain consistent with this PRD. Where an
implementation detail is undecided here, the technical/design documents
should explicitly record the chosen assumption rather than silently
treating it as a product requirement.

------------------------------------------------------------------------

**End of PRD**
