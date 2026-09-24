# Stryde

Browser-first football (soccer) video analytics by DiaLabs. Choose a short match clip and Stryde detects and tracks players, groups them into teams by jersey color, estimates team possession, maps movement onto a 2D pitch and presents everything as annotated playback with a broadcast-style HUD, side-by-side team statistics, synchronized heatmaps and estimated shot/goal events.

All computer vision runs locally in the browser (ONNX Runtime Web on WebGPU, WebAssembly fallback). The video is never uploaded and results live only in the tab's memory.

Product and design sources: [`docs/prd.md`](docs/prd.md), [`docs/specs.md`](docs/specs.md), [`docs/design.md`](docs/design.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` / `npm run build` first run `scripts/download-assets.mjs` (YOLO ONNX weights + demo clip from GitHub) and `scripts/build-assets.mjs` (ONNX Runtime Web + analysis worker into `public/ort/` and `public/workers/`). Model files are not stored in git — they are fetched on first dev/build.

Open **Analyze a match**, optionally name the teams, then drop a clip or use **Try the sample clip**. Analysis starts automatically after validation.

Other scripts: `npm run typecheck`, `npm run lint`, `npm start` (after build).

## Deployment

Static-friendly Next.js app (Vercel-ready). `next.config.ts` sets `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` so multi-threaded WebAssembly is available; keep these headers on any host.

## Architecture

```
src/
  app/                       routes: landing, /app (home), analyze, matches, match/[id], team, help
  workers/analysis.worker.ts ONNX inference, pitch/grass filtering, jersey colors, camera motion, tracking
  lib/
    vision/                  YOLO decode + NMS, association tracker, Lab color, camera-motion estimator
    analysis/
      coordinator.ts         frame sampling via <video> seeking, worker orchestration, progress, cancel, GPU→CPU fallback
      pipeline.ts            raw detections → AnalysisResult (re-run instantly for color/calibration changes)
      teams.ts               jersey-color clustering and track classification (with Unknown)
      tracks.ts, homography.ts, pitch.ts   pitch mapping: image-space fallback or user-calibrated homography
      ball.ts, possession.ts, events.ts    ball selection, possession estimate, shot/goal candidates
      analytics.ts           team metrics, heatmap grids, zones, team shape
    render/                  overlay renderer (boxes, labels, possession, ball, trails, speed, shots, goals)
    store.ts                 in-memory session store (zustand)
  components/                shell, UI primitives, processing view, match workspace
public/models/               YOLO11n / YOLO11s ONNX exports (downloaded at build; gitignored)
```

### Analysis modes

| Mode | Model | Sampling |
|---|---|---|
| Faster | YOLO11n @ 960 px | 5 frames/s |
| More detailed | YOLO11s @ 960 px (WebGPU) | 10 frames/s |
| More detailed without WebGPU | YOLO11n @ 960 px | 8 frames/s |

Models were exported with Ultralytics (`yolo export model=yolo11n.pt format=onnx imgsz=960 opset=17 simplify=True`).

### Key assumptions recorded for open decisions (specs §15)

- **Output rendering:** overlays are drawn on a canvas synchronized with the original video rather than re-encoding a new file.
- **Frame access:** `<video>` seeking + `createImageBitmap`, transferred to a classic Web Worker.
- **Calibration:** user-assisted — click ≥4 pitch markings on a frame and match them to landmarks. The homography is pan-compensated using the estimated camera motion; frames after cuts or with large drift are excluded from pitch metrics. Without calibration, positions are camera-stabilized image coordinates and physical metrics (m, m/s, width/depth, goals) are reported as unavailable.
- **Possession percentage:** unknown/contested time is excluded from the denominator and reported separately.
- **Team color correction after processing:** re-runs team assignment, possession and analytics instantly from stored detections; no video re-processing.
- **Persistence:** none. Results are session-only; the app warns before a reload discards them.

### Limitations

Estimates only. Small or occluded balls are often missed; shots are inferred from fast straight ball travel (passes can look similar); possible goals need calibration and do not observe ball height. No individual-player statistics, identity recognition, pass detection, manual correction of analytics, or exports.
