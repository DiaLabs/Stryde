// Make labelling sheets for a clip: the top ball candidates of each sampled frame, enlarged.
//
//   node scripts/scorecard/candidates.mjs --video trimmed-demo1.mp4 --clip d4 --fps 1
//
// Runs YOLO11n (same model and 960 input as the app) on frames sampled at --fps, keeps the 6
// best ball candidates (score >= 0.03) and writes, under eval/scorecard/runs/sheets/:
//   candidates-<clip>.json    frames [{ t, balls: [{ x, y, w, h, score }] }] (normalised centres)
//   <clip>-sheetNN.png        8 frames per sheet (rows), candidates by score (columns), 3x zoom,
//                             red ticks mark each candidate's centre
// Label each row with the index of the real ball (or -1 / "none" / "?"), then move the JSON
// into eval/scorecard/ and add the clip to labels.json.
//
// Needs onnxruntime-node, which is not a project dependency:  pnpm add -D onnxruntime-node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs, ROOT, RUNS } from "./lib.mjs";

let ort;
try {
  ort = await import("onnxruntime-node");
} catch {
  console.error("This script needs onnxruntime-node:  pnpm add -D onnxruntime-node");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const video = join(ROOT, args.video ?? "trimmed-demo1.mp4");
const clip = args.clip ?? basename(video).replace(/\.[^.]+$/, "");
const fps = Number(args.fps ?? 1);
const outDir = join(RUNS, "sheets");
mkdirSync(outDir, { recursive: true });

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video]).toString());
const W = probe.streams[0].width;
const H = probe.streams[0].height;
const duration = Number(probe.format.duration);
const S = 960;
const scale = Math.min(S / W, S / H);
const rw = Math.round(W * scale);
const rh = Math.round(H * scale);
const padX = Math.floor((S - rw) / 2);
const padY = Math.floor((S - rh) / 2);
const times = [];
for (let t = 0.02; t < duration - 0.05; t += 1 / fps) times.push(+t.toFixed(3));

const session = await ort.InferenceSession.create(join(ROOT, "public/models/yolo11n-960.onnx"));
const C = 40; // crop size in source pixels
const Z = 3; // zoom
const frames = [];
const crops = [];
for (const t of times) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 1 << 28 });
  const input = new Float32Array(3 * S * S).fill(114 / 255);
  for (let y = 0; y < rh; y++) {
    const sy = Math.min(H - 1, Math.floor(y / scale));
    for (let x = 0; x < rw; x++) {
      const sx = Math.min(W - 1, Math.floor(x / scale));
      const si = (sy * W + sx) * 3;
      const di = (y + padY) * S + (x + padX);
      input[di] = raw[si] / 255;
      input[di + S * S] = raw[si + 1] / 255;
      input[di + 2 * S * S] = raw[si + 2] / 255;
    }
  }
  const out = (await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, S, S]) }))[session.outputNames[0]];
  const n = out.dims[2];
  const d = out.data;
  const cands = [];
  for (let i = 0; i < n; i++) {
    const score = d[(4 + 32) * n + i]; // COCO class 32 = sports ball
    if (score < 0.03) continue;
    cands.push({ x: (d[i] - padX) / scale / W, y: (d[n + i] - padY) / scale / H, w: d[2 * n + i] / scale / W, h: d[3 * n + i] / scale / H, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of cands) {
    if (kept.some((k) => Math.hypot((k.x - c.x) * W, (k.y - c.y) * H) < 8)) continue;
    kept.push(c);
    if (kept.length >= 6) break;
  }
  frames.push({ t, balls: kept.map((c) => ({ x: +c.x.toFixed(4), y: +c.y.toFixed(4), w: +c.w.toFixed(4), h: +c.h.toFixed(4), score: +c.score.toFixed(3) })) });
  crops.push(
    kept.map((c) => {
      const rgb = new Uint8Array(C * C * 3);
      const x0 = Math.round(c.x * W - C / 2);
      const y0 = Math.round(c.y * H - C / 2);
      for (let y = 0; y < C; y++)
        for (let x = 0; x < C; x++) {
          const si = (Math.min(H - 1, Math.max(0, y0 + y)) * W + Math.min(W - 1, Math.max(0, x0 + x))) * 3;
          rgb.set(raw.subarray(si, si + 3), (y * C + x) * 3);
        }
      return rgb;
    })
  );
}
writeFileSync(join(outDir, `candidates-${clip}.json`), JSON.stringify({ video: basename(video), W, H, fps, frames }));

const ROWS = 8;
const COLS = 6;
const cell = C * Z;
const gut = 6;
const SW = COLS * (cell + gut) + gut;
const SH = ROWS * (cell + gut) + gut;
for (let sheet = 0; sheet * ROWS < frames.length; sheet++) {
  const img = new Uint8Array(SW * SH * 3);
  for (let r = 0; r < ROWS; r++) {
    const bg = r % 2 ? [40, 40, 60] : [70, 40, 40];
    for (let y = r * (cell + gut); y < Math.min(SH, (r + 1) * (cell + gut) + gut); y++) for (let x = 0; x < SW; x++) img.set(bg, (y * SW + x) * 3);
    const fi = sheet * ROWS + r;
    if (fi >= frames.length) continue;
    crops[fi].forEach((rgb, ci) => {
      const ox = gut + ci * (cell + gut);
      const oy = gut + r * (cell + gut);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) img.set(rgb.subarray((Math.floor(y / Z) * C + Math.floor(x / Z)) * 3, (Math.floor(y / Z) * C + Math.floor(x / Z)) * 3 + 3), ((oy + y) * SW + ox + x) * 3);
      for (const [dx, dy] of [[-9, 0], [-8, 0], [-7, 0], [7, 0], [8, 0], [9, 0], [0, -9], [0, -8], [0, -7], [0, 7], [0, 8], [0, 9]]) img.set([255, 0, 0], ((oy + cell / 2 + dy) * SW + ox + cell / 2 + dx) * 3);
    });
  }
  const file = join(outDir, `${clip}-sheet${String(sheet + 1).padStart(2, "0")}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${SW}x${SH}`, "-i", "pipe:0", file], { input: Buffer.from(img) });
}
console.log(`${clip}: ${frames.length} frames, ${Math.ceil(frames.length / ROWS)} sheets in ${outDir}`);
