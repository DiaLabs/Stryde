/*
 * Build an automatic ball reference for a clip (pseudo ground truth for the eval harness).
 *
 *   pnpm eval:reference [--video public/samples/sample-match.mp4] [--fps 5]
 *                       [--model public/models/yolo11s-960.onnx] [--min 0.35]
 *
 * Runs the larger model on overlapping zoomed tiles of each sampled frame (SAHI-style), where a
 * small broadcast ball is ~2–3× bigger than in the full-frame pass, and keeps only confident ball
 * detections. Frames without a confident reference are "unknown" and are excluded from scoring.
 * This is a reference, not truth: it is only used to compare pipeline variants against each other.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as ort from "onnxruntime-node";
import type { RgbaImage } from "../../src/lib/vision/features";
import { decodeYolo, letterboxParams, toTensorData } from "../../src/lib/vision/yolo";
import { parseArgs, resizeBilinear, roundForJson } from "./util";

const args = parseArgs(process.argv.slice(2));
const video = args.video ?? "public/samples/sample-match.mp4";
const fps = Number(args.fps ?? 5);
const modelPath = args.model ?? "public/models/yolo11s-960.onnx";
const minScore = Number(args.min ?? 0.35);
const size = 960;
const out = args.out ?? `eval/fixtures/${basename(video).replace(/\.[^.]+$/, "")}-${fps}fps.ball-reference.json`;

const info = JSON.parse(
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video]).toString()
) as { streams: { width: number; height: number }[]; format: { duration: string } };
const W = info.streams[0].width;
const H = info.streams[0].height;
const duration = Number(info.format.duration);
const total = Math.max(1, Math.floor(duration * fps));
const times = Array.from({ length: total }, (_, i) => Math.min(duration - 0.04, i / fps + 0.02));

/** 3×2 overlapping tiles covering the frame (the ball can be anywhere, including in the air). */
function tiles(): { x: number; y: number; w: number; h: number }[] {
  const cols = 3;
  const rows = 2;
  const tw = Math.round((W / cols) * 1.3);
  const th = Math.round((H / rows) * 1.3);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = Math.min(W - tw, Math.max(0, Math.round((c * W) / cols - (tw - W / cols) / 2)));
      const y = Math.min(H - th, Math.max(0, Math.round((r * H) / rows - (th - H / rows) / 2)));
      out.push({ x, y, w: tw, h: th });
    }
  return out;
}

function crop(src: RgbaImage, t: { x: number; y: number; w: number; h: number }): RgbaImage {
  const data = new Uint8ClampedArray(t.w * t.h * 4);
  for (let y = 0; y < t.h; y++) data.set(src.data.subarray(((t.y + y) * src.width + t.x) * 4, ((t.y + y) * src.width + t.x + t.w) * 4), y * t.w * 4);
  return { data, width: t.w, height: t.h };
}

async function main() {
  const session = await ort.InferenceSession.create(modelPath, { graphOptimizationLevel: "all" });
  const tileList = tiles();
  const canvas = new Uint8ClampedArray(size * size * 4);
  let tensor: Float32Array | undefined;
  const balls: ({ t: number; x: number; y: number; score: number } | null)[] = [];

  const select = times.map((t) => `lt(prev_t\\,${t.toFixed(4)})*gte(t\\,${t.toFixed(4)})`).join("+");
  const ff = spawn("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=${select}`, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const frameBytes = W * H * 4;
  let pending = Buffer.alloc(0);
  let index = 0;
  const started = Date.now();

  const handle = async (buf: Buffer) => {
    const src: RgbaImage = { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, frameBytes), width: W, height: H };
    let best: { x: number; y: number; score: number } | null = null;
    for (const t of tileList) {
      const tile = crop(src, t);
      const lb = letterboxParams(t.w, t.h, size);
      const rw = Math.round(t.w * lb.scale);
      const rh = Math.round(t.h * lb.scale);
      const resized = resizeBilinear(tile, rw, rh);
      canvas.fill(114);
      for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255;
      for (let y = 0; y < rh; y++) canvas.set(resized.data.subarray(y * rw * 4, (y + 1) * rw * 4), ((y + lb.padY) * size + lb.padX) * 4);
      tensor = toTensorData(canvas, size, tensor);
      const res = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, size, size]) });
      const o = res[session.outputNames[0]];
      const dec = decodeYolo(o.data as Float32Array, o.dims, lb, { player: 0.99, ball: minScore }, 0.5);
      for (const b of dec.balls) {
        if (b.box.width * t.w > 40 || b.box.height * t.h > 40) continue; // too big to be the ball
        if (!best || b.score > best.score) {
          best = {
            x: (t.x + (b.box.x + b.box.width / 2) * t.w) / W,
            y: (t.y + (b.box.y + b.box.height / 2) * t.h) / H,
            score: b.score,
          };
        }
      }
    }
    balls.push(best ? { t: times[index], ...best } : null);
    index++;
    if (index % 25 === 0) process.stdout.write(`  ${index}/${total} frames\n`);
  };

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

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ meta: { video: basename(video), sampleFps: fps, model: basename(modelPath), minScore, tiles: tileList.length, frames: balls.length }, balls }, roundForJson)
  );
  const known = balls.filter(Boolean).length;
  console.log(`wrote ${out}: reference ball in ${known}/${balls.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
