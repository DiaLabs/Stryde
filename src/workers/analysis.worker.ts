/// <reference lib="webworker" />
import type * as OrtTypes from "onnxruntime-web";
import type {
  DetectorSettings,
  ExecutionProvider,
  WorkerFrameRecord,
  WorkerRequest,
  WorkerResponse,
} from "../lib/types";
import { grassFraction, jerseyColor, type RgbaImage } from "../lib/vision/features";
import { estimateMotion, makeThumb, type Thumb } from "../lib/vision/motion";
import { AssociationTracker } from "../lib/vision/tracker";
import { decodeYolo, letterboxParams, toTensorData } from "../lib/vision/yolo";

declare const self: DedicatedWorkerGlobalScope & { ort?: typeof OrtTypes };

let ort: typeof OrtTypes | null = null;
let session: OrtTypes.InferenceSession | null = null;
let settings: DetectorSettings | null = null;
let provider: ExecutionProvider = "wasm";
const tracker = new AssociationTracker();
let prevThumb: Thumb | null = null;

let inputCanvas: OffscreenCanvas | null = null;
let inputCtx: OffscreenCanvasRenderingContext2D | null = null;
let frameCanvas: OffscreenCanvas | null = null;
let frameCtx: OffscreenCanvasRenderingContext2D | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

function validateModelBuffer(buf: ArrayBuffer, modelUrl: string): void {
  if (buf.byteLength < 100_000) {
    throw new Error(`Model file too small (${buf.byteLength} bytes) at ${modelUrl}`);
  }
  const head = new TextDecoder().decode(buf.slice(0, 64));
  if (head.startsWith("version https://git-lfs.github.com/spec/v1")) {
    throw new Error("Model file is a Git LFS pointer, not ONNX weights. Hard-refresh or clear site data and retry.");
  }
  if (head.startsWith("<!DOCTYPE") || head.startsWith("<html")) {
    throw new Error("Model download returned HTML instead of ONNX weights.");
  }
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function init(s: DetectorSettings, ortBase: string) {
  settings = s;
  const warnings: string[] = [];
  if (!ort) {
    try {
      self.importScripts(ortBase + "ort.webgpu.min.js");
      ort = self.ort ?? null;
    } catch (e) {
      throw Object.assign(new Error("Could not load the inference runtime. " + String(e)), { code: "runtime_load" });
    }
    if (!ort) throw Object.assign(new Error("Inference runtime unavailable."), { code: "runtime_load" });
    ort.env.wasm.wasmPaths = ortBase;
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.max(1, Math.min(4, (self.navigator.hardwareConcurrency || 2) - 1))
      : 1;
    ort.env.logLevel = "error";
  }

  let modelBuffer: ArrayBuffer;
  try {
    const res = await fetch(s.modelUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    modelBuffer = await res.arrayBuffer();
    validateModelBuffer(modelBuffer, s.modelUrl);
  } catch (e) {
    throw Object.assign(new Error(`Model download failed (${String(e)}).`), { code: "model_load" });
  }

  const tryCreate = async (ep: ExecutionProvider) => {
    const sess = await ort!.InferenceSession.create(new Uint8Array(modelBuffer), {
      executionProviders: [ep],
      graphOptimizationLevel: "all",
    });
    // warm-up run validates operator support on this provider
    const size = s.inputSize;
    const dummy = new ort!.Tensor("float32", new Float32Array(3 * size * size), [1, 3, size, size]);
    const out = await sess.run({ [sess.inputNames[0]]: dummy });
    for (const k of Object.keys(out)) out[k].dispose?.();
    return sess;
  };

  session = null;
  if (s.preferredProvider === "webgpu" && (await hasWebGpu())) {
    try {
      session = await tryCreate("webgpu");
      provider = "webgpu";
    } catch (e) {
      warnings.push(`WebGPU initialization failed (${String((e as Error).message ?? e).slice(0, 120)}); using WebAssembly (CPU), which is slower.`);
    }
  } else if (s.preferredProvider === "webgpu") {
    warnings.push("WebGPU is not available in this browser; using WebAssembly (CPU), which is slower.");
  }
  if (!session) {
    try {
      session = await tryCreate("wasm");
      provider = "wasm";
    } catch (e) {
      throw Object.assign(new Error(`No supported inference backend could run the model (${String((e as Error).message ?? e)}).`), {
        code: "backend_unavailable",
      });
    }
  }

  inputCanvas = new OffscreenCanvas(s.inputSize, s.inputSize);
  inputCtx = inputCanvas.getContext("2d", { willReadFrequently: true });
  tracker.reset();
  prevThumb = null;
  post({ type: "ready", provider, warnings });
}

async function processFrame(frameIndex: number, t: number, bitmap: ImageBitmap) {
  if (!session || !settings || !ort || !inputCtx || !inputCanvas) throw new Error("Detector not initialized");
  const W = bitmap.width;
  const H = bitmap.height;

  // Full frame pixels for color/grass/motion analysis (capped at 1280 px wide).
  const fscale = Math.min(1, 1280 / W);
  const fw = Math.round(W * fscale);
  const fh = Math.round(H * fscale);
  if (!frameCanvas || frameCanvas.width !== fw || frameCanvas.height !== fh) {
    frameCanvas = new OffscreenCanvas(fw, fh);
    frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  }
  frameCtx!.drawImage(bitmap, 0, 0, fw, fh);
  const frameData = frameCtx!.getImageData(0, 0, fw, fh);
  const img: RgbaImage = { data: frameData.data, width: fw, height: fh };

  // Letterboxed detector input.
  const size = settings.inputSize;
  const lb = letterboxParams(W, H, size);
  inputCtx.fillStyle = "rgb(114,114,114)";
  inputCtx.fillRect(0, 0, size, size);
  inputCtx.drawImage(bitmap, lb.padX, lb.padY, Math.round(W * lb.scale), Math.round(H * lb.scale));
  bitmap.close();
  const rgba = inputCtx.getImageData(0, 0, size, size).data;
  const tensor = new ort.Tensor("float32", toTensorData(rgba, size), [1, 3, size, size]);

  const t0 = performance.now();
  const outputs = await session.run({ [session.inputNames[0]]: tensor });
  const inferenceMs = performance.now() - t0;
  const out = outputs[session.outputNames[0]];
  const data = (await out.getData()) as Float32Array;
  const decoded = decodeYolo(
    data,
    out.dims,
    lb,
    { player: settings.playerThreshold, ball: settings.ballThreshold },
    settings.iouThreshold
  );
  tensor.dispose();
  for (const k of Object.keys(outputs)) outputs[k].dispose?.();

  // Camera motion.
  const thumb = makeThumb(img);
  let motionX = 0;
  let motionY = 0;
  let sceneCut = false;
  if (prevThumb) {
    const m = estimateMotion(prevThumb, thumb);
    motionX = m.dx;
    motionY = m.dy;
    sceneCut = m.sceneCut;
  }
  prevThumb = thumb;

  // Keep on-pitch people: plausible size/shape and grass around the feet.
  const players = decoded.players
    .filter((d) => {
      const b = d.box;
      if (b.height < 0.025 || b.width < 0.004) return false;
      const aspect = b.height / Math.max(1e-4, b.width);
      if (aspect < 0.9 || aspect > 5.5) return false;
      if (b.height > 0.6) return false;
      const g = grassFraction(img, b.x + b.width / 2, b.y + b.height, Math.max(b.width, 0.01), Math.max(b.height * 0.15, 0.008));
      return g >= 0.2;
    })
    .map((d) => ({ box: d.box, confidence: d.score, color: jerseyColor(img, d.box) }));

  const balls = decoded.balls
    .filter((d) => {
      const b = d.box;
      if (b.width > 0.05 || b.height > 0.08) return false;
      const g = grassFraction(img, b.x + b.width / 2, b.y + b.height / 2, Math.max(b.width * 2.5, 0.01), Math.max(b.height * 2.5, 0.015));
      return g >= 0.15;
    })
    .map((d) => ({ box: d.box, confidence: d.score }));

  const ids = tracker.update(players, t, motionX, motionY, sceneCut);
  const record: WorkerFrameRecord = {
    frameIndex,
    timestampSeconds: t,
    players: players
      .map((p, i) => ({ trackId: ids[i], box: p.box, confidence: p.confidence, color: p.color }))
      .filter((p) => p.trackId > 0),
    balls,
    motionX,
    motionY,
    sceneCut,
    inferenceMs,
  };
  post({ type: "frame", record });
}

// Messages are handled strictly in order: tracking depends on frame order and
// a single inference session must not run concurrently.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => handle(ev.data));
};

async function handle(msg: WorkerRequest) {
  try {
    switch (msg.type) {
      case "init":
        await init(msg.settings, msg.ortBase);
        break;
      case "frame":
        await processFrame(msg.frameIndex, msg.timestampSeconds, msg.bitmap);
        break;
      case "reset":
        tracker.reset();
        prevThumb = null;
        break;
      case "dispose":
        await session?.release();
        session = null;
        self.close();
        break;
    }
  } catch (e) {
    const err = e as Error & { code?: string };
    const message = String(err?.message ?? e);
    const code =
      err.code ??
      (/memory|OOM|allocation/i.test(message) ? "out_of_memory" : msg.type === "frame" ? "inference_failed" : "init_failed");
    if (msg.type === "frame") msg.bitmap.close?.();
    post({ type: "error", code, message, frameIndex: msg.type === "frame" ? msg.frameIndex : undefined });
  }
}
