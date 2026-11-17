# Accuracy scorecard

Hand-checked ground truth for the three demo clips in the repo root, and scripts to measure the
real app against it. Use it before keeping any change to detection, ball choice, teams or
possession: a change that does not move these numbers is not an improvement.

## What is labelled

`labels.json` marks where the real ball is in 105 sampled frames (69 with the ball clearly
identified: 59 among the YOLO11n candidates, plus 10 the football ball model found where
YOLO11n had no candidate, each checked by eye). For each frame, `candidates-<clip>.json` lists the model's ball candidates and the
label says which one is the real ball, or that none is. Labels were made by eye from enlarged
crops of each candidate. `labels.json` explains the codes.

Team assignment is checked by eye with `teams.mjs`, which draws every player in its team
colour. A mistake shows up as one shirt colour drawn in both team colours within one frame.

## Running it

Start the dev server (`pnpm dev`), then:

```bash
pnpm scorecard --name base --url http://localhost:3000
```

This runs each clip through the app in a headless Chrome and scores the ball. It saves each
result and the worker's raw detections to `eval/scorecard/runs/` (git-ignored). On the CPU a
full run takes about 5 minutes. Add `--gpu` to use WebGPU on Vulkan, if your machine supports it
(about 2 minutes), or `--mode detailed` to test More detailed mode.

To measure a change to `src/lib/analysis` (ball choice, teams, possession, events), you don't
need the browser again. Replay the pipeline on the saved detections in seconds, optionally next
to the pipeline at a git ref:

```bash
pnpm scorecard:replay --name base --compare HEAD
```

To check camera tracking, which places players on the top-down pitch view as the camera pans,
against ffmpeg's frame-by-frame stabiliser (vidstab):

```bash
pnpm scorecard:camera --name base
```

On 2026-11-18, with the old estimator vs the current one on the same frames: error per 0.2 s
step went from 0.51 / 1.16 / 0.65% to 0.29 / 0.70 / 0.57% of the frame width (demo1 / 2 / 3).
The worst drift between cuts went from 18 / 32 / 20% to 8 / 16 / 12%, and slow pans are no
longer read as no motion (before: 22, 2 and 11 steps). vidstab's zoom estimates drift too much
to use as a reference, so zoom is not checked.

To check teams by eye:

```bash
node scripts/scorecard/teams.mjs --name base --clip d1 --times 2,10,18,26
```

To label more clips, `scripts/scorecard/candidates.mjs` makes the enlarged-crop sheets. It needs
`onnxruntime-node`; the instructions are at the top of that file.

## Reading the numbers

- **found:** the app's ball is within 28 px of the labelled ball.
- **wrong:** the app reports a ball somewhere else.
- **missed:** the app reports no ball although one was labelled.
- **ball-when-none:** a ball is reported where every candidate was false.
- **right:** the share of reported balls that were the real one.
- **real ball among candidates** (replay only): how often the worker produced the real ball at
  all. This is the ceiling for any change to ball choice. The worker currently passes on only its
  most confident candidate per frame, so this counts how often that one is right.

## Results so far (2026-11-17, original engine, Faster mode)

| | Ball found | Reported balls right |
|---|---|---|
| Original engine | 53% (28 of 53) | 65% |
| Whole-clip ball path | 51–57% | 60–65% |
| More candidates, lower threshold | 45–51% | 55–61% |
| More detailed mode (YOLO11s, 10 fps) | 53% | 68% |
| **Football ball model + COCO fallback (shipped)** | **67%** (on the 60-label set below) | **68%** |

The real ball is among the model's candidates in only about 57–72% of labelled moments, so ball
choice is not the limit; the detector is. The rows above were measured on the first 53 labels.

After 10 more balls were labelled (ones only the football model found), the set has 60 labels
that match app frames. On that set the original engine finds 50% of balls (67% right), and with
the football ball model it finds 67% (68% right). demo2 rose from 18% to 55%, and demo3 from 39%
to 67%. On the CPU, demo1 takes about 214 s instead of 161 s. Splitting tracks whose shirt colour switches team
fixed 2 wrong-team boxes out of about 170 checked and broke none, so it was kept.

## Notes

- The clips must start at timestamp zero. The originals did not: Chrome then shows the first
  frame for every seek before the first timestamp. They were re-timed in commit `e96bc34`.
- The labels are for these exact files. Re-encoding or trimming a clip invalidates its labels.
