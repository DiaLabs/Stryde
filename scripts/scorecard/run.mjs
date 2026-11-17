// Run the demo clips through the real app (headless Chrome) and score the ball against the labels.
//
//   pnpm scorecard [--name base] [--url http://localhost:3000] [--clips d1,d2,d3]
//                  [--mode faster|detailed] [--gpu]
//
// Needs the dev server running (`pnpm dev`): results are read from the store, which the app
// exposes as window.__stryde in development only. Each clip's result and the worker's raw
// detections are saved to eval/scorecard/runs/<name>-<clip>(.raw).json, so `pnpm scorecard:replay`
// can re-score pipeline changes offline in seconds.
//
// --gpu starts Chrome with WebGPU on Vulkan (fast; needs a GPU that supports it). Without it the
// analysis runs on the CPU, like most users' browsers.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addScores, CLIPS, formatScore, LABELS, launchChrome, parseArgs, ROOT, RUNS, runPath, scoreBall } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const name = args.name ?? "latest";
const url = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
const clips = (args.clips ?? CLIPS.join(",")).split(",");
const mode = args.mode ?? "faster";
const gpu = args.gpu === "true";
const GPU_FLAGS = ["--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--enable-gpu", "--ignore-gpu-blocklist"];
mkdirSync(RUNS, { recursive: true });

async function runClip(clip) {
  const video = join(ROOT, LABELS.clips[clip].video);
  const base = LABELS.clips[clip].video;
  const { send, ev, close, sleep } = await launchChrome({ flags: gpu ? GPU_FLAGS : [] });
  try {
    await send("Page.enable");
    await send("DOM.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("stryde-device", ${JSON.stringify(gpu ? "gpu" : "cpu")}); } catch {}` });
    await send("Page.navigate", { url: `${url}/app/analyze` });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(500);
      ready = await ev(`!!window.__stryde && !!document.querySelector('input[type=file]')`);
    }
    if (!ready) throw new Error(`the app at ${url} did not load (is \`pnpm dev\` running? results are only exposed in development)`);
    await sleep(1500);
    // hand the clip to the file input (retried: a hot reload can swallow the first attempt)
    let started = false;
    for (let attempt = 0; attempt < 5 && !started; attempt++) {
      const doc = await send("DOM.getDocument", { depth: -1 });
      const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
      await send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [video] });
      for (let i = 0; i < 40 && !started; i++) {
        await sleep(500);
        started = await ev(`(() => {
          if (${JSON.stringify(mode)} === "detailed" && !window.__modeSet) {
            const d = [...document.querySelectorAll("button,[role=radio],label")].find((e) => /more detailed/i.test(e.textContent) && e.textContent.length < 200);
            if (d) { d.click(); window.__modeSet = 1; return false; }
          }
          if (!document.body.innerText.includes(${JSON.stringify(base)}) || !/Ready to analyze/i.test(document.body.innerText)) return false;
          const b = [...document.querySelectorAll("button")].find((b) => /^\\s*analy[sz]e/i.test(b.textContent.trim()) && !b.disabled);
          if (!b) return false;
          b.click();
          return true;
        })()`);
      }
    }
    if (!started) throw new Error("could not start the analysis");
    const t0 = Date.now();
    let status = null;
    for (let i = 0; i < 900; i++) {
      await sleep(2000);
      status = JSON.parse(
        (await ev(`(() => { const s = window.__stryde.getState(); const m = s.matches[s.order[0]]; return JSON.stringify(m ? { status: m.session.status, provider: m.session.provider, done: !!m.result } : {}); })()`)) ?? "{}"
      );
      if (status.done || status.status === "failed" || status.status === "cancelled") break;
    }
    if (!status?.done) throw new Error(`analysis ended as ${status?.status ?? "unknown"}`);
    const result = await ev(`(() => { const s = window.__stryde.getState(); const m = s.matches[s.order[0]]; const r = m.result; return JSON.stringify({
      clip: ${JSON.stringify(clip)}, mode: ${JSON.stringify(mode)}, provider: m.session.provider, seconds: 0,
      frames: r.frames.map((f) => ({ f: f.frameIndex, t: f.timestampSeconds, cut: f.sceneCut })),
      ball: r.ball.map((b) => ({ f: b.frameIndex, t: b.timestampSeconds, x: b.x, y: b.y, c: b.confidence })),
      tracks: r.tracks.map((t) => ({ id: t.trackId, type: t.objectType, team: t.teamId, obs: t.observations.map((o) => [o.frameIndex, +o.box.x.toFixed(4), +o.box.y.toFixed(4), +o.box.width.toFixed(4), +o.box.height.toFixed(4)]) })),
      possession: r.possessionTimeline.map((p) => ({ t: p.timestampSeconds, team: p.teamId })),
      colors: { a: r.teams.teamAColor, b: r.teams.teamBColor },
      analytics: r.analytics.map((a) => ({ team: a.teamId, possession: a.possessionPercent.value })) }); })()`);
    const parsed = JSON.parse(result);
    parsed.seconds = Math.round((Date.now() - t0) / 1000);
    writeFileSync(runPath(name, clip), JSON.stringify(parsed));
    writeFileSync(runPath(name, clip, "raw"), await ev(`(() => { const s = window.__stryde.getState(); return JSON.stringify(s.matches[s.order[0]].raw); })()`));
    return parsed;
  } finally {
    await close();
  }
}

const total = {};
for (const clip of clips) {
  let r = null;
  for (let attempt = 1; attempt <= 2 && !r; attempt++) {
    try {
      r = await runClip(clip);
    } catch (e) {
      console.error(`${clip}: ${e.message}${attempt < 2 ? " (retrying)" : ""}`);
    }
  }
  if (!r) continue;
  const s = scoreBall(clip, r.frames, r.ball);
  addScores(total, s);
  const poss = r.analytics.map((a) => (a.possession == null ? "–" : a.possession.toFixed(0))).join("/");
  console.log(`${clip}  ${formatScore(s)}   (${r.provider}, ${r.seconds}s, possession ${poss})`);
}
if (Object.keys(total).length) console.log(`all ${formatScore(total)}`);
