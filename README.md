# Stryde

Stryde is a browser-based football analytics application that turns a short soccer clip into a readable team analysis experience. Users can upload match footage, process it locally in the browser, review player tracking, estimate team possession, inspect pitch-based movement, and view annotated playback with side-by-side team statistics.

The app is designed for users who want a simple way to study football clips without uploading their video to a server. All analysis runs in the browser on the user’s device.

## Quick start

Requires Node 22.12+ and [pnpm](https://pnpm.io) (the version is pinned in `package.json`; `corepack enable` picks it up).

```bash
pnpm install
pnpm dev
```

`pnpm dev` downloads the detection models and sample clip on first run, bundles the analysis worker in watch mode and starts Next.js.

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

## Useful commands

```bash
pnpm install
pnpm dev         # assets + worker watch + next dev
pnpm build       # assets + production build
pnpm start
pnpm lint
pnpm typecheck   # generates route types, then tsc
pnpm scorecard   # accuracy check against hand-labelled demo clips (see eval/scorecard)
```

## Models

Detection runs in the browser with [ONNX Runtime Web](https://onnxruntime.ai):

- **Players (and a fallback ball):** Ultralytics YOLO11n (Faster) or YOLO11s (More detailed),
  pretrained on COCO, exported to ONNX at 960 px. They are downloaded at build time by
  `scripts/download-assets.mjs`.
- **Ball:** a YOLO11n fine-tuned on football footage to find only the ball,
  [martinjolif/yolo-football-ball-detection](https://huggingface.co/martinjolif/yolo-football-ball-detection)
  (revision `63666b30`), converted to ONNX and committed as
  `public/models/football-ball-960.onnx`. On the accuracy scorecard it raised the share of
  moments where the app finds the ball from 50% to 67%, at about a third more processing time on
  the CPU. If it is missing, analysis falls back to the COCO model for the ball.

All of these weights are licensed under AGPL-3.0, like Ultralytics YOLO itself.

To reproduce the ball model conversion (Python 3.12, CPU PyTorch):

```bash
uv venv --python 3.12 .venv-export
uv pip install --python .venv-export/bin/python --index-url https://download.pytorch.org/whl/cpu torch torchvision
uv pip install --python .venv-export/bin/python ultralytics onnx onnxslim
curl -L -o ball.pt https://huggingface.co/martinjolif/yolo-football-ball-detection/resolve/63666b30e2a4973e089c982769f146af54530750/yolo-football-ball-detection.pt
.venv-export/bin/python -c "from ultralytics import YOLO; YOLO('ball.pt').export(format='onnx', imgsz=960, opset=17, simplify=True)"
mv ball.onnx public/models/football-ball-960.onnx && rm -rf .venv-export ball.pt
```

The checkpoint is a pickle, which runs code when loaded. The pinned revision was checked first:
its SHA-256 is `fb37942448e7de08745e8aab148d0794f680a738ddd55e5f17abe9ab2d6313fb`, and it only
references PyTorch and Ultralytics model classes.

## Deployment

Stryde is a static-friendly Next.js application and can be deployed to hosts such as Vercel. The project is configured to support browser-based WebAssembly and worker execution, which are required for the local analysis pipeline.

## Limitations

Stryde provides best-effort estimates, not guaranteed professional match truth. Accuracy depends on video quality, camera motion, visibility, occlusion, and calibration quality. Metrics such as possession, shots, and goals are presented as estimates and may be unavailable for clips that do not support them reliably.
