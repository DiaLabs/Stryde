/*
 * Replay a detection fixture through the analysis pipeline and report quality metrics.
 *
 *   pnpm eval [--fixture eval/fixtures/sample-match-5fps.json] [--save]
 *
 * --save stores the numbers as eval/baseline.json; later runs print the change against it.
 * There is no hand-labelled ground truth yet, so these are proxies: each one says which
 * direction is better and why.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildResult, type RawAnalysis } from "../../src/lib/analysis/pipeline";
import type { AnalysisResult, WorkerFrameRecord } from "../../src/lib/types";
import { parseArgs } from "./util";

interface Fixture {
  meta: { video: string; width: number; height: number; frameRate?: number; durationSeconds: number; sampleFps: number; model: string; inputSize: number; expectedFrames: number };
  frames: WorkerFrameRecord[];
}

type Better = "up" | "down" | "info";
interface Metric {
  key: string;
  label: string;
  value: number;
  better: Better;
  digits?: number;
}

export function fixtureToRaw(fx: Fixture): RawAnalysis {
  return {
    sessionId: "eval",
    video: {
      fileName: fx.meta.video,
      mimeType: "video/mp4",
      durationSeconds: fx.meta.durationSeconds,
      width: fx.meta.width,
      height: fx.meta.height,
      frameRate: fx.meta.frameRate,
      fileSizeBytes: 0,
    },
    config: { teamAName: "Team A", teamBName: "Team B", mode: "faster" },
    frames: fx.frames,
    sampleFps: fx.meta.sampleFps,
    expectedFrameCount: fx.meta.expectedFrames,
    provider: "wasm",
    model: fx.meta.model,
    inputSize: fx.meta.inputSize,
    mode: "faster",
    durationMs: 0,
    adaptations: [],
    warnings: [],
    cancelledEarly: false,
  };
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface BallReference {
  balls: ({ t: number; x: number; y: number; score: number } | null)[];
}

/** Ball precision/recall against a tiled-reference file (see reference.ts). */
function ballVsReference(result: AnalysisResult, ref: BallReference): Metric[] {
  const tol = 0.025; // frame widths
  const aspect = result.video.width / Math.max(1, result.video.height);
  const byFrame = new Map(result.ball.map((b) => [b.frameIndex, b]));
  let refFrames = 0;
  let found = 0;
  let chosenOnRef = 0;
  let correct = 0;
  let detectedChosen = 0;
  let detectedCorrect = 0;
  ref.balls.forEach((r, fi) => {
    const c = byFrame.get(fi);
    if (!r) return;
    refFrames++;
    const ok = !!c && Math.hypot(c.x - r.x, (c.y - r.y) / aspect) <= tol;
    if (ok) found++;
    if (c) {
      chosenOnRef++;
      if (ok) correct++;
      if (!c.interpolated) {
        detectedChosen++;
        if (ok) detectedCorrect++;
      }
    }
  });
  return [
    { key: "refFrames", label: "Frames with a reference ball", value: refFrames, better: "info", digits: 0 },
    { key: "ballRecall", label: "Ball recall vs reference", value: refFrames ? found / refFrames : 0, better: "up" },
    { key: "ballPrecision", label: "Ball precision vs reference", value: chosenOnRef ? correct / chosenOnRef : 0, better: "up" },
    { key: "ballPrecisionDetected", label: "  precision, detected only", value: detectedChosen ? detectedCorrect / detectedChosen : 0, better: "up" },
  ];
}

export function metrics(result: AnalysisResult, sampleFps: number): Metric[] {
  const n = Math.max(1, result.frames.length);
  const frameByIndex = new Map(result.frames.map((f) => [f.frameIndex, f]));
  const aspect = result.video.width / Math.max(1, result.video.height);

  // ---- ball
  const ball = [...result.ball].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  let pairs = 0;
  let jumps = 0;
  for (let i = 1; i < ball.length; i++) {
    const a = ball[i - 1];
    const b = ball[i];
    const dt = b.timestampSeconds - a.timestampSeconds;
    if (dt <= 0 || dt > 2.5 / sampleFps) continue;
    const fa = frameByIndex.get(a.frameIndex);
    const fb = frameByIndex.get(b.frameIndex);
    if (!fa || !fb || fb.sceneCut) continue;
    // camera-stabilised displacement in frame widths per second
    const dx = b.x + fb.cameraX - (a.x + fa.cameraX);
    const dy = (b.y + fb.cameraY - (a.y + fa.cameraY)) / aspect;
    pairs++;
    if (Math.hypot(dx, dy) / dt > 1.6) jumps++;
  }
  const interpolated = ball.filter((b) => (b as { interpolated?: boolean }).interpolated).length;

  // ---- players / tracks
  const players = result.tracks.filter((t) => t.objectType === "player");
  const spans = players.map((t) => {
    const o = t.observations;
    return o.length ? o[o.length - 1].timestampSeconds - o[0].timestampSeconds : 0;
  });
  const obsTotal = players.reduce((s, t) => s + t.observations.length, 0);
  const visible = obsTotal / n;
  const unknownObs = players.reduce((s, t) => s + (t.teamId === "unknown" || !t.teamId ? t.observations.length : 0), 0);

  // ---- possession
  const pos = result.possessionTimeline;
  const known = pos.filter((p) => p.teamId !== "unknown");
  let switches = 0;
  let last: string | null = null;
  for (const p of known) {
    if (last && p.teamId !== last) switches++;
    last = p.teamId;
  }
  const a = result.analytics.find((x) => x.teamId === "team_a");

  return [
    { key: "ballSeen", label: "Ball found (share of frames)", value: ball.length / n, better: "up" },
    { key: "ballInterpolated", label: "  of which filled in", value: interpolated / n, better: "info" },
    { key: "ballJumpRate", label: "Implausible ball jumps (share of steps)", value: pairs ? jumps / pairs : 0, better: "down" },
    { key: "playersPerFrame", label: "Players kept per frame", value: visible, better: "info", digits: 1 },
    { key: "tracks", label: "Player tracks", value: players.length, better: "down", digits: 0 },
    { key: "tracksPerVisible", label: "Tracks per visible player (fragmentation)", value: players.length / Math.max(1, visible), better: "down", digits: 2 },
    { key: "medianTrackSeconds", label: "Median track length (s)", value: median(spans), better: "up", digits: 1 },
    { key: "shortTracks", label: "Tracks shorter than 1 s (share)", value: spans.filter((s) => s < 1).length / Math.max(1, spans.length), better: "down" },
    { key: "teamUnknown", label: "Player observations with unknown team", value: obsTotal ? unknownObs / obsTotal : 0, better: "down" },
    { key: "teamColorConfidence", label: "Team colour confidence", value: result.teams.colorConfidence, better: "up" },
    { key: "possessionKnown", label: "Possession known (share of samples)", value: pos.length ? known.length / pos.length : 0, better: "up" },
    { key: "possessionSwitches", label: "Possession switches per minute", value: switches / Math.max(1e-6, result.coverage.analyzedDurationSeconds / 60), better: "down", digits: 1 },
    { key: "possessionA", label: "Team A possession (%)", value: a?.possessionPercent.value ?? NaN, better: "info", digits: 0 },
    { key: "shots", label: "Shots", value: result.events.filter((e) => e.type === "shot").length, better: "info", digits: 0 },
  ];
}

function fmt(m: Metric, v: number | undefined) {
  if (v === undefined || Number.isNaN(v)) return "–";
  const d = m.digits ?? 2;
  if (m.digits === undefined && Math.abs(v) <= 1) return `${(v * 100).toFixed(1)}%`;
  return v.toFixed(d);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = args.fixture ?? "eval/fixtures/sample-match-5fps.json";
  const fx = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  const t0 = performance.now();
  const result = buildResult(fixtureToRaw(fx));
  const ms = performance.now() - t0;
  const ms_ = metrics(result, fx.meta.sampleFps);
  const refPath = path.replace(/\.json$/, ".ball-reference.json");
  if (existsSync(refPath)) ms_.splice(3, 0, ...ballVsReference(result, JSON.parse(readFileSync(refPath, "utf8")) as BallReference));

  const baselinePath = "eval/baseline.json";
  const baseline: Record<string, number> = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
  const rows = ms_.map((m) => {
    const b = baseline[m.key];
    let verdict = "";
    if (b !== undefined && !Number.isNaN(b) && !Number.isNaN(m.value) && m.better !== "info") {
      const diff = m.value - b;
      if (Math.abs(diff) > 1e-9) verdict = (diff > 0) === (m.better === "up") ? "better" : "worse";
    }
    return [m.label, fmt(m, b), fmt(m, m.value), verdict];
  });
  const w = [Math.max(...rows.map((r) => r[0].length)), 9, 9, 6];
  console.log(`\n${fx.meta.video}  ${fx.meta.sampleFps} fps  ${fx.frames.length} frames  pipeline ${ms.toFixed(0)} ms\n`);
  console.log(["Metric".padEnd(w[0]), "Baseline".padStart(w[1]), "Now".padStart(w[2]), ""].join("  "));
  for (const r of rows) console.log([r[0].padEnd(w[0]), r[1].padStart(w[1]), r[2].padStart(w[2]), r[3]].join("  "));
  if (result.warnings.length) console.log(`\nWarnings:\n- ${result.warnings.join("\n- ")}`);

  if (args.save) {
    writeFileSync(baselinePath, JSON.stringify(Object.fromEntries(ms_.map((m) => [m.key, m.value])), null, 2) + "\n");
    console.log(`\nsaved ${baselinePath}`);
  }
}

if (process.argv[1]?.endsWith("run.ts")) main();
