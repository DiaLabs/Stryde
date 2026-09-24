# Stryde

Stryde is a browser-based football analytics application that turns a short soccer clip into a readable team analysis experience. Users can upload match footage, process it locally in the browser, review player tracking, estimate team possession, inspect pitch-based movement, and view annotated playback with side-by-side team statistics.

The app is designed for users who want a simple way to study football clips without uploading their video to a server. All analysis runs in the browser on the user’s device.

## Quick start

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

From there:

1. Click "Analyze a match"
2. Upload a local football video
3. Enter team names and optional colors
4. Choose Faster or More Detailed analysis
5. Let the app process the clip automatically
6. View annotated playback, possession, pitch, and team metrics

## Objective of the application

The goal of Stryde is to make football analysis more accessible by giving users a quick, privacy-friendly way to:

- analyze short match clips
- detect players and the ball
- estimate team possession
- compare team movement and pitch positioning
- review annotated video with supporting statistics

## Overview

Stryde focuses on team-level insights rather than individual player profiling. It estimates which team is in possession, tracks player movement, groups players by team color, and presents results in a dashboard designed around the video itself.

The app keeps the workflow simple:

- upload a local soccer video
- validate and inspect metadata
- run browser-side analysis
- view annotated results and tactical outputs

## Features

- local video upload and validation
- automatic analysis start
- browser-based player and ball detection
- temporary object tracking across frames
- team color estimation with user correction
- estimated possession timeline and percentages
- team movement and occupancy insights
- pitch-style visualization and heatmaps
- best-effort shot and goal event estimates
- annotated playback with team labels and overlays
- privacy-first, no backend upload requirement

## Project documentation

- [docs/prd.md](docs/prd.md) — product requirements document
- [docs/specs.md](docs/specs.md) — technical specification
- [docs/design.md](docs/design.md) — design and UX direction
- [docs/project-analysis.md](docs/project-analysis.md) — project analysis
- [docs/project-features-and-flow.md](docs/project-features-and-flow.md) — feature and flow overview

## Useful commands

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## Deployment

Stryde is a static-friendly Next.js application and can be deployed to hosts such as Vercel. The project is configured to support browser-based WebAssembly and worker execution, which are required for the local analysis pipeline.

## Limitations

Stryde provides best-effort estimates, not guaranteed professional match truth. Accuracy depends on video quality, camera motion, visibility, occlusion, and calibration quality. Metrics such as possession, shots, and goals are presented as estimates and may be unavailable for clips that do not support them reliably.
