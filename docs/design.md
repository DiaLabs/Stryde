# Stryde — UI/UX Design Specification

**Status:** Revised design specification aligned to the PRD and technical specifications  
**Product:** Stryde  
**Team / organization:** DiaLabs  
**Design input:** User-provided nine-panel interface image, used as visual inspiration only

---

## 1. Purpose and document relationship

This document defines the intended user experience and visual system for Stryde. The supplied image is a **reference for look, feel, and possible layout patterns**, not a requirement to reproduce its screens or include every feature shown in it.

The product requirements and technical specifications take precedence over the reference image:

- **PRD:** Defines product goals, user journey, in-scope and excluded features, functional requirements FR-01 through FR-18, and product-level analytics.
- **Technical specifications (`specs.md`):** Defines the browser-first processing architecture, module responsibilities, data contracts, quality rules, and implementation constraints.
- **This design document (`design.md`):** Maps those requirements into screen structure, navigation, interaction behavior, visual hierarchy, and states.

If a reference-image element conflicts with the PRD or technical specification, follow the PRD and technical specification. Do not add an unapproved feature merely because it appears in the reference.

### 1.1 Product experience

Stryde converts short soccer footage into an interactive analysis experience. The central experience combines:

1. Annotated video as the primary focus.
2. A broadcast-style HUD and overlays.
3. Team A / Team B statistics shown side by side.
4. A synchronized 2D pitch with team movement, occupancy, distribution, and heatmaps.
5. Best-effort possession, shot, and goal estimates with appropriate uncertainty indicators.

### 1.2 Design principles

- **Video first:** Analytics support and contextualize the footage.
- **Team-focused:** The initial product emphasizes team-level insights, not individual-player rankings or identities.
- **Clear uncertainty:** Show when information is estimated, low-confidence, partial, or unavailable.
- **Local-processing transparency:** Tell users that analysis happens in their browser and the video is not uploaded to Stryde for analysis.
- **Progressive disclosure:** Keep the main review experience approachable while making detailed visualizations available through tabs and controls.
- **Faithful to scope:** Do not make mockup-only features appear functional if they are not implemented.

---

## 2. Visual design system

The image suggests a dark football-inspired brand frame combined with light, readable analytics surfaces. Use that direction without treating its exact dimensions, text, statistics, or screen arrangements as fixed requirements.

### 2.1 Color tokens

These are starting tokens; validate contrast and team-color conflicts during implementation.

| Token | Suggested value | Purpose |
|---|---|---|
| `brand-primary` | `#20C785` | Primary actions, active indicators, selected states |
| `brand-hover` | `#18AD72` | Hover/pressed state |
| `navy-950` | `#07131D` | Sidebar and deep background |
| `navy-900` | `#0D1D2A` | Dark panels and brand areas |
| `navy-800` | `#162B3B` | Secondary dark surfaces |
| `surface-page` | `#F5F7F8` | Main workspace background |
| `surface-card` | `#FFFFFF` | Cards and content panels |
| `border-default` | `#DDE3E7` | Dividers and outlines |
| `text-primary` | `#17232D` | Main text on light surfaces |
| `text-secondary` | `#65727D` | Metadata and helper text |
| `status-success-bg` | `#E5F7EF` | Completed status |
| `status-warning-bg` | `#FFF5DD` | Caution and low-confidence notices |
| `status-error` | `#C83F4F` | Errors and destructive actions |

Team colors must remain consistent across player labels, bounding boxes, pitch markers, charts, and team cards. Since user-selected team colors may be similar, add labels, line styles, or symbols so team identity is not conveyed by color alone.

### 2.2 Typography and density

- Use Inter or a comparable readable sans-serif.
- Page heading: 24–32 px, semibold/bold.
- Section heading: 16–20 px, semibold.
- Body: 14–16 px.
- Supporting labels: generally 12–14 px with adequate contrast.
- KPI values: 22–30 px depending on layout.
- Avoid tiny chart labels and excessive decoration over video.

### 2.3 Layout

- Desktop: persistent left navigation, flexible central workspace, and optional contextual side panel.
- Use a consistent 4 px spacing scale.
- Cards use restrained borders, subtle shadows, and approximately 8–12 px corner radii.
- Prefer a calm grid and consistent alignment over replicating the exact panel density of the reference.
- Tablet: collapse navigation and stack secondary content.
- Mobile: prioritize video and primary actions; stack metrics and provide deliberate chart overflow only when needed.

### 2.4 Reusable components

Build reusable components for the application shell, sidebar, top bar, buttons, tabs, metric cards, status badges, progress steps, video player, overlay toggles, team selectors, color controls, pitch visualization, heatmap controls, event timeline, quality notices, empty states, error states, loading skeletons, and confirmation dialogs.

All interactive components need keyboard focus, hover, active, disabled, and loading states.

---

## 3. Navigation and screen map

The signed-in workspace may use a sidebar inspired by the reference. Keep navigation labels aligned with implemented functionality:

- **Home**
- **Matches**
- **Team Analysis**
- **Settings / Help**, if included in the application shell

A tracked-entity inspection view may be provided as a secondary tool only if it remains within the PRD's constraints: temporary track IDs, no real-world identity recognition, no individual possession statistics, and no individual performance reports or leaderboards.

The reference's Players, Reports, Pricing, account, social sign-in, and sharing elements are not automatically approved product requirements. They should be omitted, deferred, or treated as optional shell features unless separately specified and implemented. In particular, the PRD excludes downloadable reports and analysis exports.

### 3.1 Primary user flow

1. Visitor opens the landing page or application.
2. User selects a local video.
3. The app reads metadata and validates the video.
4. User configures team names/colors and selects Faster or More Detailed analysis.
5. Analysis begins automatically once upload/selection and required validation/configuration are complete.
6. Processing status and any warnings are shown.
7. Results open in the match analysis workspace.
8. User reviews annotated playback, team statistics, pitch visualizations, heatmaps, and supported events.

The UI must not require a separate “Start Analysis” click after a successfully completed upload if doing so would contradict the PRD's automatic-processing behavior. If the product design requires match configuration first, make the transition clear and start processing automatically as soon as required inputs are complete.

---

## 4. Screen and feature specifications

## 4.1 Landing / entry page

**Purpose:** Explain the product and guide the user to select a match video.

**Layout:**
- Dark navy hero region with a soccer visual and restrained green accents.
- Stryde brand mark and concise navigation.
- Headline communicating that Stryde turns soccer footage into team insights.
- Short copy mentioning player tracking, estimated possession, heatmaps, and match review.
- Primary action: **Analyze a Match** or **Get Started**.
- Optional demo action only if a genuine demo is implemented and clearly labeled as sample footage/results.
- Supporting sections may explain local browser processing, supported footage, and current limitations.

**Behavior:**
- Primary action opens the upload flow.
- Any product metrics or performance claims must be supported by documented evaluation. Do not copy illustrative counts or accuracy percentages from the reference image.

**Traceability:** PRD goals and user journey; FR-01, FR-02; technical specification §§2–3, 4.1.

## 4.2 Authentication / account screens — optional

Authentication is not established as a required feature by the current PRD or technical specification. Do not make it a dependency for local analysis unless the product team explicitly adds that requirement.

If authentication is later introduced:
- Keep sign-in and sign-up forms simple and accessible.
- Include password recovery and clear validation states.
- Show third-party sign-in only for providers actually integrated.
- Explain whether account use changes video privacy or persistence; do not imply cloud storage by default.

**Traceability:** Not required by current FR-01–FR-18; optional future shell capability.

## 4.3 Home / dashboard

**Purpose:** Give users a concise entry point to recent local or session-available analyses and the next action.

**Layout:**
- Application navigation and page header.
- Primary **Upload Match** action.
- Recent analysis list only to the extent the application can actually retain or recover it.
- Each available match entry may show a thumbnail, user-entered team names, duration, analysis status, and a View action.
- If a session has no saved history, show a clear empty state with an Upload Match action.
- Optional summary cards may show metrics for a specifically selected match. Any aggregate across matches must state its period and data source.

**Important lifecycle constraint:** The initial architecture has no database or server-side match archive. Do not promise cross-device history or persistent match records. Browser refresh/navigation may discard analysis unless a local persistence feature is separately designed and implemented.

**Traceability:** FR-18; technical specification §§3, 4.2, 11; PRD user journey.

## 4.4 Upload and match setup

**Purpose:** Select and validate a local soccer video, configure teams, and begin analysis.

**Layout:**
- Page title such as **Analyze a Match**.
- Drag-and-drop area and file-picker button.
- Guidance about supported formats and target footage, once validated.
- File summary showing filename, file size, duration, resolution, and frame rate when available.
- Team setup:
  - Team A and Team B names, defaulting to those labels.
  - Estimated team colors and editable corrections.
  - Faster / More Detailed mode selection.
- Visible local-processing notice: the selected video is processed in the browser and is not uploaded to Stryde for analysis.

**Behavior:**
- Validate media readability and required metadata.
- Estimate team colors where suitable samples exist; allow the user to correct them.
- Handle uncertain team colors without forcing an unsupported assignment.
- Begin analysis automatically once the file is valid and required configuration is complete.
- Display a clear error and recovery action for unsupported or unreadable media.

**Traceability:** FR-01, FR-02, FR-03, FR-05; technical specification §§4.1, 5, 12.

## 4.5 Processing state

**Purpose:** Show meaningful status while browser-side analysis runs.

**Layout:**
- Match summary with team names and clip metadata.
- Progress indicator and current stage.
- Suggested stages:
  1. Preparing video and frames.
  2. Detecting players and ball.
  3. Tracking objects and assigning teams.
  4. Calibrating pitch and calculating team analytics.
  5. Preparing annotated playback and visualizations.
- Recent processed-frame preview only if it is affordable and does not disrupt inference.
- Cancel action.
- Privacy reminder that processing is local.

**Behavior:**
- Progress must reflect actual work or use an indeterminate indicator; never invent percentages or frame counts.
- Keep the interface responsive while workers perform computation.
- Provide useful recovery steps for runtime, model, browser, and memory failures.
- Explain that closing/reloading the page may interrupt or discard the session.

**Traceability:** FR-18, FR-17; technical specification §§4.2, 5, 6, 12.

## 4.6 Match analysis workspace — primary results screen

**Purpose:** Present the main broadcast-style video review with synchronized team information.

**Layout:**
- Match header with team names, clip duration, and analysis quality/status.
- Annotated video as the dominant element.
- Broadcast-style HUD showing available match/team context.
- Video-side or lower panel with Team A and Team B statistics side by side.
- Tactical pitch and heatmap region synchronized with the video where supported.
- Event timeline/markers for estimated shots and possible goals when available.
- Quality/coverage notice visible without overwhelming the video.

**Video overlays:**
- Player bounding boxes.
- Team labels.
- Ball indicator when detected.
- Possession highlighting for the team currently estimated to have possession.
- Team possession HUD.
- Speed only where calibration and tracking quality support meaningful estimates.
- Movement trails if supported and useful.
- Estimated shot trajectory and goal-event indicators when detected.

Optional overlay controls may toggle supported layers. Do not show controls for features that are not implemented.

**Playback controls:**
- Play and pause.
- Seek.
- Playback speed.
- Fullscreen where supported.
- Other media controls only where applicable.

**Behavior:**
- Seeking updates the pitch, heatmaps, and event context to the corresponding time as far as analyzed data permits.
- Clicking an event marker seeks to its timestamp.
- Low-confidence or missing detections must not be visually represented as certain.
- Do not provide download/export buttons in the initial version.

**Traceability:** FR-04, FR-06, FR-07, FR-08, FR-13, FR-14, FR-15, FR-16, FR-17; technical specification §§4.3–4.11, 9–10.

## 4.7 Team analysis and tactical pitch

**Purpose:** Explore team-level spatial and temporal behavior.

**Layout:**
- Team A / Team B / both teams selector.
- Standardized 2D pitch.
- Heatmap type selector for supported team movement/occupancy views.
- Team distribution and movement-zone summaries.
- Possession timeline.
- Side-by-side team metrics, with definitions and units.
- Calibration and coverage notice.

**Supported views:**
- Team movement heatmap.
- Team occupancy.
- Team distribution.
- Movement-zone or pitch-third analysis.
- Possession timeline and possession estimates.
- Aggregate speed/distance, width, depth, or compactness only when data quality supports them.
- Shot and goal estimates where available.

**Behavior:**
- Team and heatmap selections update the pitch visualization.
- Both teams can be displayed together.
- Pitch and heatmap state follows video time to the extent supported by processed observations.
- Unknown possession periods and unobserved regions must not be silently counted as zero.
- Use standardized pitch coordinates by default and calibrated homography when feasible; communicate image-space fallback or unavailable calibration.

**Traceability:** FR-07–FR-12, FR-15, FR-17; technical specification §§4.6–4.9, 9–10.

## 4.8 Tracked-object inspection — limited/optional

The PRD permits temporary track IDs for continuity and movement calculations but excludes individual-player profiles, identity recognition, individual reports, leaderboards, and individual possession analytics.

If a track inspector is included:
- Identify tracks with neutral labels such as `Track 12`, never an automatically inferred real name.
- Show team assignment and confidence where available.
- Provide a movement path or heatmap only if useful and supported.
- Do not include individual possession, rankings, player reports, or unvalidated action counts.
- Do not imply identity recognition.
- If individual inspection is not part of the initial build, omit this screen rather than copying the reference's player profile.

**Traceability:** PRD FR-04 and scope exclusions; technical specification §§1.2, 4.4, 4.5, 7.

## 4.9 Events view

**Purpose:** Review estimated shot attempts and possible goals.

**Layout:**
- Chronological event list/timeline.
- Event type, timestamp, team assignment if supported, and confidence/quality.
- Link to seek the match video to the event.
- Estimated shot trajectory visualization in the video/pitch when available.

**Behavior:**
- Clearly distinguish “possible goal” and “estimated shot” from verified match facts.
- If no events are detected, distinguish that from event analysis being unavailable.
- No manual event correction interface in the initial release.

**Traceability:** FR-13, FR-14, FR-17; technical specification §§4.8, 9, 12.

## 4.10 Reports / summary view — in-dashboard only

**Purpose:** Organize a readable summary of the available match analysis.

This is a dashboard presentation of results, not a downloadable report feature.

**Content:**
- Concise executive summary based on available metrics.
- Team possession and spatial insights.
- Shot/goal estimates and timestamps.
- Coverage, calibration, and confidence caveats.
- Links to relevant video times and dashboard sections.

**Constraints:**
- Do not add PDF, CSV, image, or tracking-data downloads in the initial release.
- Do not fabricate insights when data is missing.
- Avoid definitive coaching claims; use evidence-based descriptive wording.
- Hide unsupported report categories rather than filling them with mock statistics.

**Traceability:** FR-08, FR-12–FR-17; PRD exclusion of downloadable reports; technical specification §§9–10.

---

## 5. Cross-screen interaction requirements

### 5.1 Team settings

Team names and display colors should be consistent across the entire match experience. If colors are corrected after processing, the UI should make clear whether existing outputs update immediately or whether a recalculation is required. Do not suggest that correction of analytics themselves is available; the PRD excludes a manual analytics correction workflow.

### 5.2 Synchronized playback

The video timestamp is the primary time reference. Pitch positions, heatmaps, possession timeline, and event markers should synchronize to it where observations exist. If the selected timestamp falls between sampled frames or in a data gap, the UI should indicate that the visualization is approximate or unavailable rather than inventing an exact position.

### 5.3 Partial analysis

The results workspace should remain usable when some modules fail. Show available outputs and label unavailable metrics individually. A partial result must not be presented as a complete analysis.

### 5.4 Session cleanup

When the user cancels, exits, or disposes of a session, release temporary browser resources in accordance with the technical specification. If results are session-only, warn users before navigation when practical that leaving may discard them.

---

## 6. Responsive design

### Desktop
- Full sidebar and multi-column analysis workspace.
- Video and core match metrics visible together where practical.
- Pitch and heatmaps placed adjacent to or below video depending on viewport width.

### Tablet
- Collapsible sidebar or navigation drawer.
- Stack secondary analytics below the video.
- Maintain usable chart controls and touch targets.

### Mobile
- Compact navigation and vertically stacked cards.
- Video and playback controls receive priority.
- Simplify chart labels and allow deliberate horizontal scrolling within chart regions.
- Show capability warnings if the device is not suitable for the selected analysis mode.
- Do not imply that processing will perform equally across device classes.

---

## 7. Accessibility

- Target WCAG 2.2 AA practices.
- Use semantic structure, labels, and keyboard-operable controls.
- Maintain visible focus indicators.
- Do not use color as the sole distinction between teams or states.
- Provide text summaries for important charts and heatmaps.
- Respect reduced-motion preferences.
- Keep overlays from obscuring essential video controls.
- Use readable contrast and avoid tiny labels.
- Provide actionable error messages and cancellation confirmation where work may be lost.

---

## 8. Status, quality, and uncertainty language

Use consistent terms throughout the product:

| State | UI meaning |
|---|---|
| **Processing** | Work is currently running in the browser |
| **Completed** | The analysis pipeline reached its completion state; individual metrics may still be partial |
| **Partial analysis** | Some results are available, but one or more modules or metrics could not produce a usable result |
| **Estimated** | Inferred from detections or other indirect evidence |
| **Low confidence** | Available evidence is weak or inconsistent |
| **Unknown** | Evidence is insufficient to assign a team/event/state |
| **Unavailable** | A metric cannot be produced from the available footage or calibration |
| **Partial coverage** | Only some frames or intervals were analyzed successfully |

Metric cards and charts should include units, relevant time period, and quality information where applicable. Explain whether a value is directly observed, inferred, or dependent on pitch calibration.

---

## 9. Empty, loading, and error states

Design explicit states for:

- No match selected.
- No previous session available.
- File metadata loading.
- Unsupported or unreadable video.
- Model initialization/loading.
- Browser backend unavailable.
- Processing in progress.
- Processing cancelled.
- Processing failed.
- Partial results.
- Ball detections insufficient for possession estimates.
- Team colors ambiguous.
- Pitch calibration unavailable or invalidated by camera movement.
- No shot/goal candidates detected.
- Event analysis unavailable.
- Track with too few observations for movement metrics.
- Resource/memory limit reached.
- Annotated playback rendering failure.

Errors should explain what happened, clarify that the original video remains local, and provide an actionable next step when possible.

---

## 10. Feature traceability matrix

This matrix maps the PRD's functional requirements to the intended UI. The PRD and technical specification define the actual feature behavior; this document defines its presentation.

| PRD requirement | UI location / presentation | Relevant technical specification |
|---|---|---|
| **FR-01 Video upload** | Upload and match setup screen; file picker/drop zone and file summary | §§4.1, 5, 12 |
| **FR-02 Automatic processing** | Processing screen begins automatically after valid input and required configuration | §§4.2, 5 |
| **FR-03 Metadata and validation** | File summary, compatibility guidance, and validation/error states | §§4.1, 12 |
| **FR-04 Player detection/tracking** | Annotated video boxes; optional neutral track inspection | §§4.3–4.4, 10 |
| **FR-05 Team identification** | Team setup, estimated color controls, team labels, unknown state | §§4.5, 10 |
| **FR-06 Annotated video** | Main match workspace with supported overlays and HUD | §§4.10, 10 |
| **FR-07 Team possession estimation** | Video possession highlight/HUD and possession timeline; uncertainty state | §§4.7, 9 |
| **FR-08 Possession statistics** | Side-by-side team metrics and possession timeline | §§4.9, 9–10 |
| **FR-09 Spatial mapping** | Tactical pitch, calibration status, approximate/unavailable messaging | §§4.6, 9 |
| **FR-10 Movement and occupancy** | Team analysis views and movement/occupancy visualizations | §§4.9, 9 |
| **FR-11 Heatmaps** | Team and heatmap-type selectors; both-team view; synchronized pitch | §§4.9, 10 |
| **FR-12 Team-level statistics** | Team cards, comparison panels, and team analysis page | §§4.9, 9 |
| **FR-13 Shot/trajectory** | Event timeline, video overlay, and estimated trajectory | §§4.8, 9 |
| **FR-14 Goal detection** | Possible-goal event marker/list item with confidence | §§4.8, 9 |
| **FR-15 Dashboard and synchronization** | Match workspace combines video, HUD, metrics, pitch, heatmaps, and timeline | §§4.11, 5, 10 |
| **FR-16 Playback controls** | Video player controls for play, pause, seek, and speed | §§4.10, 10 |
| **FR-17 Confidence and partial results** | Quality badges, warnings, metric-level states, partial-analysis display | §§9, 12 |
| **FR-18 Processing status** | Processing stepper, progress, completed/failed/cancelled states | §§4.2, 5, 12 |

### 10.1 Scope exclusions mapped to design

| Excluded or deferred capability | Design treatment |
|---|---|
| Real-world player identity recognition | Never show identity claims; use temporary track IDs only |
| Individual-player reports/profiles/leaderboards | Omit from initial navigation and results |
| Individual possession/touch heatmaps | Do not offer those visualizations |
| Full-match ball trajectory | Only show estimated shot-specific trajectory when available |
| Passing, pass networks, completion statistics | Omit or mark future only; do not present as implemented |
| Advanced event detection and formations | Omit from initial experience |
| Live/RTSP analysis and multi-sport support | Not represented as supported |
| Manual correction of tracks/events/analytics | No correction workflow; team color configuration remains supported |
| Downloadable reports or analysis exports | No download/export controls |
| Permanent video archive or server-side processing | Communicate browser-local processing; do not imply cloud video storage |

---

## 11. Design acceptance checklist

The design is aligned and ready for implementation when:

- It follows the PRD and technical specification rather than copying the reference image literally.
- The reference's dark/navy and green visual language is used as inspiration, with accessible light analytics surfaces.
- Video is the primary focus of the match review experience.
- Upload supports local file selection, metadata/validation, team configuration, analysis mode, and automatic start after required inputs.
- Processing communicates real status, progress, cancellation, and recoverable errors.
- Match analysis combines supported overlays, team statistics, pitch, heatmaps, possession, and estimated events.
- Team switching, both-team heatmaps, and video synchronization are represented.
- Uncertain, unknown, partial, and unavailable outputs have clear visual states.
- The interface does not claim identity recognition, individual possession, unsupported metrics, downloads, persistent cloud history, or server-side analysis.
- Every FR-01–FR-18 requirement has a corresponding UI location or state in the traceability matrix.
- Deferred features are hidden or clearly identified as not available, never represented with fabricated data.

---

## 12. Source-of-truth rule

If the design, PRD, technical specification, and visual reference disagree:

1. Follow the agreed product scope and constraints in the PRD.
2. Follow the technical feasibility, architecture, and data contracts in `specs.md`.
3. Use this document to determine the interface presentation and interactions.
4. Treat the supplied image only as visual inspiration unless a specific element is independently required by the PRD or approved as a new requirement.
