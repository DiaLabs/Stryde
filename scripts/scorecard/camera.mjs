// Camera-tracking accuracy: compares the app's camera-motion estimator (src/lib/vision/motion.ts)
// with ffmpeg's vidstab, which tracks image features at full resolution and every frame.
// Camera tracking is what places players on the top-down pitch view as the camera pans.
//
//   pnpm scorecard:camera [--name latest]
//
// Frames are sampled 5 per second, like Faster mode. Player boxes from a saved
// `pnpm scorecard --name <name>` run are used for masking when available.
// Reports, per clip: mean error per 0.2 s step and the worst drift that builds up between cuts
// (both in % of frame width), and how many slow pans were read as no motion.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CLIPS, LABELS, parseArgs, ROOT, runPath } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const name = args.name ?? "latest";
const SAMPLE_FPS = 5;
const work = mkdtempSync(join(tmpdir(), "stryde-camera-"));

try {
  const entry = join(work, "entry.ts");
  writeFileSync(entry, `export { makeThumb, estimateMotion } from ${JSON.stringify(join(ROOT, "src/lib/vision/motion"))};\n`);
  execFileSync(join(ROOT, "node_modules/.bin/esbuild"), ["--bundle", "--format=esm", "--platform=node", "--log-level=error", `--outfile=${join(work, "motion.mjs")}`, entry]);
  const { makeThumb, estimateMotion } = await import(pathToFileURL(join(work, "motion.mjs")).href);

  for (const clip of CLIPS) {
    const video = join(ROOT, LABELS.clips[clip].video);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", video]).toString());
    const { width: W, height: H } = probe.streams[0];
    const [num, den] = probe.streams[0].r_frame_rate.split("/").map(Number);
    const fps = Math.round(num / den);
    // reference: vidstab's per-frame global translation
    const trf = join(work, `${clip}.trf`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `vidstabdetect=shakiness=10:accuracy=15:stepsize=6:result=${trf}`, "-f", "null", "-"]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `vidstabtransform=input=${trf}:debug=1:relative=1:smoothing=0`, "-f", "null", "-"], { cwd: work });
    const ref = readFileSync(join(work, "global_motions.trf"), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.trim().split(/\s+/).map(Number));
    const raw = existsSync(runPath(name, clip, "raw")) ? JSON.parse(readFileSync(runPath(name, clip, "raw"), "utf8")) : null;

    const step = fps / SAMPLE_FPS;
    const count = Math.floor(ref.length / step);
    let prev = null, absErr = 0, n = 0, cum = 0, worst = 0, zero = 0, pans = 0;
    const cuts = [];
    for (let i = 0; i < count; i++) {
      const t = i / SAMPLE_FPS + 0.02; // the app's sampling
      const rgba = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { maxBuffer: 1 << 27 });
      const boxes = raw?.frames.find((f) => Math.abs(f.timestampSeconds - t) < 0.05)?.players.map((p) => p.box) ?? [];
      const th = makeThumb({ data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, W * H * 4), width: W, height: H }, boxes);
      if (prev) {
        const e = estimateMotion(prev, th);
        let r = 0;
        for (let k = (i - 1) * step + 1; k <= i * step && k < ref.length; k++) r -= ref[k][1] / W;
        if (e.sceneCut) {
          cuts.push(t.toFixed(1));
          cum = 0;
        } else if (Math.abs(r) <= 0.15) {
          absErr += Math.abs(e.dx - r);
          n++;
          cum += e.dx - r;
          worst = Math.max(worst, Math.abs(cum));
          if (Math.abs(r) > 0.002) {
            pans++;
            if (Math.abs(e.dx) < 1e-6) zero++;
          }
        }
      }
      prev = th;
    }
    console.log(
      `${clip}  error per step ${((100 * absErr) / Math.max(1, n)).toFixed(2)}% of width  worst drift ${(100 * worst).toFixed(0)}%  slow pans read as zero ${zero}/${pans}  cuts ${cuts.join(" ") || "none"}`
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
