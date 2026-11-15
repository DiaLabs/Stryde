/*
 * Record a detection fixture for the analysis evaluation harness.
 *
 *   pnpm eval:extract [--video public/samples/sample-match.mp4] [--fps 5]
 *                     [--model public/models/yolo11n-960.onnx] [--size 960] [--out eval/fixtures/<name>.json]
 *
 * Decodes the clip with ffmpeg at the sampling rate, runs the same letterbox → YOLO → decode →
 * camera motion → frame features code as the browser worker (onnxruntime-node instead of
 * onnxruntime-web), and writes per-frame features. The pipeline then replays these offline, so
 * changes to filtering, tracking, teams, possession and events can be measured in seconds.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as ort from "onnxruntime-node";
import type { WorkerFrameRecord } from "../../src/lib/types";
import type { RgbaImage } from "../../src/lib/vision/features";
import { BALL_CROP, cropCenter, cropRect, cropToFrame, mergeBallCandidates, needsCropPass, updateCropState, type BallCropState } from "../../src/lib/vision/ballcrop";
import { ballGrass, frameFeatures } from "../../src/lib/vision/frame";
import { estimateMotion, makeThumb, thumbSignature, type Thumb } from "../../src/lib/vision/motion";
import { decodeYolo, letterboxParams, toTensorData } from "../../src/lib/vision/yolo";
import { parseArgs, resizeBilinear, roundForJson } from "./util";

const args = parseArgs(process.argv.slice(2));
const video = args.video ?? "public/samples/sample-match.mp4";
const fps = Number(args.fps ?? 5);
const modelPath = args.model ?? "public/models/yolo11n-960.onnx";
const size = Number(args.size ?? 960);
const cropPass = args["no-crop"] !== "true";
const out = args.out ?? `eval/fixtures/${basename(video).replace(/\.[^.]+$/, "")}-${fps}fps.json`;

const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", video]).toString();
const info = JSON.parse(probe) as { streams: { width: number; height: number; r_frame_rate: string }[]; format: { duration: string } };
const W = info.streams[0].width;
const H = info.streams[0].height;
const duration = Number(info.format.duration);
const [rn, rd] = info.streams[0].r_frame_rate.split("/").map(Number);

// same sampling as the browser coordinator: t_i = i / fps + 0.02
const total = Math.max(1, Math.floor(duration * fps));
const times = Array.from({ length: total }, (_, i) => Math.min(duration - 0.04, i / fps + 0.02));

// the worker caps the feature frame at 1280 px wide
const fscale = Math.min(1, 1280 / W);
const FW = Math.round(W * fscale);
const FH = Math.round(H * fscale);

async function main() {
  const session = await ort.InferenceSession.create(modelPath, { graphOptimizationLevel: "all" });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const lb = letterboxParams(W, H, size);
  const rw = Math.round(W * lb.scale);
  const rh = Math.round(H * lb.scale);
  const canvas = new Uint8ClampedArray(size * size * 4);
  let tensor: Float32Array | undefined;
  let prevThumb: Thumb | null = null;
  let cropState: BallCropState | null = null;
  let cropRuns = 0;
  const frames: WorkerFrameRecord[] = [];

  /** run the detector on a square crop of the source frame (pixels) */
  const detectCrop = async (src: RgbaImage, r: { x: number; y: number; side: number }) => {
    const tile = new Uint8ClampedArray(r.side * r.side * 4);
    for (let y = 0; y < r.side; y++) tile.set(src.data.subarray(((r.y + y) * src.width + r.x) * 4, ((r.y + y) * src.width + r.x + r.side) * 4), y * r.side * 4);
    const clb = letterboxParams(r.side, r.side, size);
    const cw = Math.round(r.side * clb.scale);
    const resized = resizeBilinear({ data: tile, width: r.side, height: r.side }, cw, cw);
    canvas.fill(114);
    for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255;
    for (let y = 0; y < cw; y++) canvas.set(resized.data.subarray(y * cw * 4, (y + 1) * cw * 4), ((y + clb.padY) * size + clb.padX) * 4);
    tensor = toTensorData(canvas, size, tensor);
    const res = await session.run({ [inputName]: new ort.Tensor("float32", tensor, [1, 3, size, size]) });
    const o = res[outputName];
    return decodeYolo(o.data as Float32Array, o.dims, clb, { player: 1.01, ball: BALL_CROP.threshold }, 0.5).balls;
  };

  // decode exactly the sampled timestamps (select filter) so frame i is time t_i
  const select = times.map((t) => `lt(prev_t\\,${t.toFixed(4)})*gte(t\\,${t.toFixed(4)})`).join("+");
  const ff = spawn("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=${select}`, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const frameBytes = W * H * 4;
  let pending = Buffer.alloc(0);
  let index = 0;
  const started = Date.now();

  const handle = async (buf: Buffer) => {
    const t = times[index] ?? index / fps;
    const src: RgbaImage = { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, frameBytes), width: W, height: H };
    const img: RgbaImage = fscale < 1 ? resizeBilinear(src, FW, FH) : src;

    // letterboxed detector input, grey 114 padding like the worker
    canvas.fill(114);
    for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255;
    const resized = resizeBilinear(src, rw, rh);
    for (let y = 0; y < rh; y++) {
      const dst = ((y + lb.padY) * size + lb.padX) * 4;
      canvas.set(resized.data.subarray(y * rw * 4, (y + 1) * rw * 4), dst);
    }
    tensor = toTensorData(canvas, size, tensor);
    const t0 = performance.now();
    const res = await session.run({ [inputName]: new ort.Tensor("float32", tensor, [1, 3, size, size]) });
    const inferenceMs = performance.now() - t0;
    const o = res[outputName];
    const decoded = decodeYolo(o.data as Float32Array, o.dims, lb, { player: 0.2, ball: fps >= 8 ? 0.06 : 0.075 }, 0.5);

    const thumb = makeThumb(img);
    let motionX = 0;
    let motionY = 0;
    let sceneCut = false;
    let motionResidual = 0;
    if (prevThumb) {
      const m = estimateMotion(prevThumb, thumb);
      motionX = m.dx;
      motionY = m.dy;
      sceneCut = m.sceneCut;
      motionResidual = m.residual;
    }
    prevThumb = thumb;

    const feats = frameFeatures(decoded, img);
    let ballCandidates = feats.balls;
    if (cropPass && needsCropPass(decoded.balls)) {
      const center = cropCenter(cropState, t, feats.people);
      if (center) {
        const r = cropRect(center, W, H);
        const found = await detectCrop(src, r);
        cropRuns++;
        const cands = found
          .filter((d) => d.box.width * r.side <= 40 && d.box.height * r.side <= 40)
          .map((d) => {
            const box = cropToFrame(d.box, r, W, H);
            return { box, confidence: d.score, grass: ballGrass(img, box), source: "crop" as const };
          });
        ballCandidates = mergeBallCandidates(feats.balls, cands);
      }
    }
    cropState = updateCropState(cropState, ballCandidates, t);
    frames.push({
      frameIndex: index,
      timestampSeconds: t,
      players: [],
      balls: [],
      motionX,
      motionY,
      sceneCut,
      inferenceMs,
      people: feats.people,
      ballCandidates,
      motionResidual,
      signature: thumbSignature(thumb),
    });
    index++;
    if (index % 25 === 0) process.stdout.write(`  ${index}/${total} frames\n`);
  };

  // process frames strictly in order (motion depends on the previous frame)
  let chain = Promise.resolve();
  ff.stdout.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= frameBytes) {
      const frame = Buffer.from(pending.subarray(0, frameBytes));
      pending = pending.subarray(frameBytes);
      chain = chain.then(() => handle(frame));
    }
  });
  await new Promise<void>((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));
  await chain;

  const fixture = {
    meta: {
      video: basename(video),
      width: W,
      height: H,
      frameRate: rd ? rn / rd : undefined,
      durationSeconds: duration,
      sampleFps: fps,
      model: basename(modelPath),
      ballCropPass: cropPass,
      cropRuns,
      inputSize: size,
      frames: frames.length,
      expectedFrames: total,
      recordedAt: new Date().toISOString(),
    },
    frames,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(fixture, roundForJson));
  console.log(`wrote ${out}: ${frames.length}/${total} frames in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
