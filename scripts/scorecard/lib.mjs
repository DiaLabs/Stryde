// Shared helpers for the accuracy scorecard (see eval/scorecard/README.md).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SCORECARD = join(ROOT, "eval", "scorecard");
export const RUNS = join(SCORECARD, "runs");
export const LABELS = JSON.parse(readFileSync(join(SCORECARD, "labels.json"), "utf8"));
export const CLIPS = Object.keys(LABELS.clips);

/** A ball within this many pixels of the labelled position counts as found. */
export const TOLERANCE_PX = 28;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) out._.push(a);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = "true";
  }
  return out;
}

export function candidatesFor(clip) {
  return JSON.parse(readFileSync(join(SCORECARD, LABELS.clips[clip].candidates), "utf8"));
}

/**
 * Score one clip. `frames`: [{ f, t }] sampled by the app; `ball`: [{ f, x, y }] chosen ball per
 * frame (normalised centre); `rawBalls` (optional): Map frameIndex -> [{ x, y }] candidates the
 * worker produced, to report how often the real ball was available at all.
 */
export function scoreBall(clip, frames, ball, rawBalls) {
  const cands = candidatesFor(clip);
  const { W, H } = cands;
  const s = { truth: 0, found: 0, wrong: 0, missed: 0, empty: 0, falseOnEmpty: 0, inCands: 0 };
  LABELS.clips[clip].labels.forEach((lab, k) => {
    if (lab === "?" || lab === "none") return;
    const t = cands.frames[k].t;
    let fr = null;
    for (const x of frames) if (Math.abs(x.t - t) <= 0.05 && (!fr || Math.abs(x.t - t) < Math.abs(fr.t - t))) fr = x;
    if (!fr) return; // the app did not sample this moment
    const b = ball.find((o) => o.f === fr.f);
    if (lab === -1) {
      s.empty++;
      if (b) s.falseOnEmpty++;
      return;
    }
    s.truth++;
    const tr = cands.frames[k].balls[lab];
    const near = (p) => Math.hypot((p.x - tr.x) * W, (p.y - tr.y) * H) <= TOLERANCE_PX;
    if (rawBalls?.get(fr.f)?.some(near)) s.inCands++;
    if (!b) s.missed++;
    else if (near(b)) s.found++;
    else s.wrong++;
  });
  return s;
}

export function formatScore(s, withCands) {
  const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
  const reported = s.found + s.wrong + s.falseOnEmpty;
  return (
    `found ${s.found}/${s.truth} (${pct(s.found, s.truth)})` +
    (withCands ? `  [real ball among candidates ${s.inCands}]` : "") +
    `  wrong ${s.wrong}  missed ${s.missed}  ball-when-none ${s.falseOnEmpty}/${s.empty}  right ${pct(s.found, reported)}`
  );
}

export function addScores(into, s) {
  for (const k in s) into[k] = (into[k] ?? 0) + s[k];
  return into;
}

// ------------------------------------------------------------------ headless Chrome over CDP

const CHROME = process.env.CHROME ?? "google-chrome";

/** Start a throwaway headless Chrome and return a tiny CDP client for its first page. */
export async function launchChrome({ flags = [], port = 9333 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "stryde-scorecard-"));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--window-size=1400,900", "--headless=new", ...flags, "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let targets = [];
  for (let i = 0; i < 75 && !targets.some((t) => t.type === "page"); i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error(`Chrome did not start (is "${CHROME}" installed? set CHROME=...)`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiters = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiters.has(d.id)) {
      waiters.get(d.id)(d);
      waiters.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiters.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const close = async () => {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    chrome.kill("SIGTERM");
    await sleep(1500);
    rmSync(dir, { recursive: true, force: true });
  };
  return { send, ev, close, sleep };
}

export function runPath(name, clip, kind = "") {
  return join(RUNS, `${name}-${clip}${kind ? "." + kind : ""}.json`);
}

export function haveRun(name, clip) {
  return existsSync(runPath(name, clip, "raw"));
}
