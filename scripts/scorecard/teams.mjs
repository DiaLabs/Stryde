// Draw each tracked player in its assigned team colour (and the chosen ball) on chosen frames,
// to check team assignment by eye.
//
//   node scripts/scorecard/teams.mjs --clip d1 --times 2,10,18 [--name latest] [--out <dir>]
//
// Box colours: cyan = team A, magenta = team B, yellow = unknown (e.g. referee); lime = ball.
// Which shirt is "team A" differs per clip: compare boxes within a frame, not across clips.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LABELS, parseArgs, ROOT, RUNS, runPath } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const clip = args.clip ?? "d1";
const name = args.name ?? "latest";
const outDir = args.out ?? join(RUNS, "frames");
const run = JSON.parse(readFileSync(runPath(name, clip), "utf8"));
const video = join(ROOT, LABELS.clips[clip].video);
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", video]).toString());
const W = probe.streams[0].width;
const H = probe.streams[0].height;
const color = { team_a: "cyan", team_b: "magenta", unknown: "yellow" };
mkdirSync(outDir, { recursive: true });
console.log(`team A ${run.colors.a}, team B ${run.colors.b}`);
for (const t of (args.times ?? "2,10,18").split(",").map(Number)) {
  const fr = run.frames.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), run.frames[0]);
  const draw = [];
  for (const tr of run.tracks) {
    if (tr.type !== "player") continue;
    const o = tr.obs.find((ob) => ob[0] === fr.f);
    if (o) draw.push(`drawbox=x=${Math.round(o[1] * W)}:y=${Math.round(o[2] * H)}:w=${Math.max(2, Math.round(o[3] * W))}:h=${Math.max(2, Math.round(o[4] * H))}:color=${color[tr.team] ?? "white"}@0.95:t=2`);
  }
  const ball = run.ball.find((b) => b.f === fr.f);
  if (ball) draw.push(`drawbox=x=${Math.round(ball.x * W) - 9}:y=${Math.round(ball.y * H) - 9}:w=18:h=18:color=lime@1:t=3`);
  const out = join(outDir, `${name}-${clip}-${fr.t.toFixed(1)}s.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(fr.t), "-i", video, "-frames:v", "1", "-vf", draw.length ? draw.join(",") : "null", out]);
  console.log(out);
}
