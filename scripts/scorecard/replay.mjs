// Re-run the analysis pipeline from src/ on detections saved by `pnpm scorecard`, and score it.
//
//   pnpm scorecard:replay [--name base] [--compare <git ref>]
//
// The browser worker (detection, tracking, camera motion) is not re-run, so this measures
// changes to src/lib/analysis (ball choice, teams, possession, events) in a few seconds.
// --compare also replays the pipeline as it is at a git ref (e.g. HEAD) on the same detections.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { addScores, CLIPS, formatScore, haveRun, parseArgs, ROOT, runPath, scoreBall } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const name = args.name ?? "latest";
const work = mkdtempSync(join(tmpdir(), "stryde-replay-"));

/** Bundle buildResult from a source tree into an importable module. */
async function loadPipeline(srcRoot, tag) {
  const entry = join(work, `entry-${tag}.ts`);
  const out = join(work, `pipeline-${tag}.mjs`);
  writeFileSync(entry, `export { buildResult } from ${JSON.stringify(join(srcRoot, "src/lib/analysis/pipeline"))};\n`);
  execFileSync(join(ROOT, "node_modules/.bin/esbuild"), ["--bundle", "--format=esm", "--platform=node", "--log-level=error", `--outfile=${out}`, `--alias:@=${join(srcRoot, "src")}`, entry]);
  return (await import(pathToFileURL(out).href)).buildResult;
}

function report(label, buildResult) {
  const total = {};
  console.log(label);
  for (const clip of CLIPS) {
    if (!haveRun(name, clip)) continue;
    const raw = JSON.parse(readFileSync(runPath(name, clip, "raw"), "utf8"));
    const r = buildResult(raw);
    const frames = r.frames.map((f) => ({ f: f.frameIndex, t: f.timestampSeconds }));
    const ball = r.ball.map((b) => ({ f: b.frameIndex, x: b.x, y: b.y }));
    const rawBalls = new Map(raw.frames.map((f) => [f.frameIndex, f.balls.map((b) => ({ x: b.box.x + b.box.width / 2, y: b.box.y + b.box.height / 2 }))]));
    const s = scoreBall(clip, frames, ball, rawBalls);
    addScores(total, s);
    const players = r.tracks.filter((t) => t.objectType === "player");
    const teams = ["team_a", "team_b", "unknown"].map((k) => players.filter((t) => t.teamId === k).length).join("/");
    const poss = r.analytics.map((a) => (a.possessionPercent.value == null ? "–" : a.possessionPercent.value.toFixed(0))).join("/");
    console.log(`  ${clip}  ${formatScore(s, true)}   tracks A/B/unknown ${teams}, possession ${poss}`);
  }
  if (Object.keys(total).length) console.log(`  all ${formatScore(total, true)}`);
}

try {
  if (!CLIPS.some((c) => haveRun(name, c))) {
    console.error(`No saved detections for "${name}". Run \`pnpm scorecard --name ${name}\` first.`);
    process.exit(1);
  }
  if (args.compare) {
    const tree = join(work, "ref");
    execFileSync("mkdir", ["-p", tree]);
    execFileSync("sh", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(args.compare)} src | tar -x -C ${JSON.stringify(tree)}`]);
    if (!existsSync(join(tree, "src/lib/analysis/pipeline.ts"))) throw new Error(`no pipeline at ${args.compare}`);
    report(`pipeline at ${args.compare}:`, await loadPipeline(tree, "ref"));
  }
  report("pipeline in the working tree:", await loadPipeline(ROOT, "work"));
} finally {
  rmSync(work, { recursive: true, force: true });
}
