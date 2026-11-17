/// <reference lib="webworker" />
import type * as OrtTypes from "onnxruntime-web";
import type {
  DetectorSettings,
  ExecutionProvider,
  WorkerFrameRecord,
  WorkerRequest,
  WorkerResponse,
} from "../lib/types";
import { DEFAULT_POLICY, selectBallCandidates, selectPeople } from "../lib/analysis/detections";
import type { RgbaImage } from "../lib/vision/features";
import { frameFeatures } from "../lib/vision/frame";
import { BALL_CROP, cropCenter, cropRect, cropToFrame, mergeBallCandidates, needsCropPass, updateCropState, type BallCropState } from "../lib/vision/ballcrop";
import { ballGrass } from "../lib/vision/frame";
import { estimateMotion, makeThumb, thumbSignature, type Thumb } from "../lib/vision/motion";
import { AssociationTracker } from "../lib/vision/tracker";
import { decodeYolo, letterboxParams, toTensorData } from "../lib/vision/yolo";

declare const self: DedicatedWorkerGlobalScope & { ort?: typeof OrtTypes };

let ort: typeof OrtTypes | null = null;
let session: OrtTypes.InferenceSession | null = null;
let settings: DetectorSettings | null = null;
let provider: ExecutionProvider = "wasm";
const tracker = new AssociationTracker();
let prevThumb: Thumb | null = null;
let cropState: BallCropState | null = null;

let inputCanvas: OffscreenCanvas | null = null;
let inputCtx: OffscreenCanvasRenderingContext2D | null = null;
let frameCanvas: OffscreenCanvas | null = null;
let frameCtx: OffscreenCanvasRenderingContext2D | null = null;
// Reused across frames; safe because frames are processed strictly one at a time.
let tensorBuf: Float32Array | null = null;

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
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(o?: object): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  // prefer the discrete GPU on laptops with two
  for (const opts of [{ powerPreference: "high-performance" }, {}]) {
    try {
      if (await gpu.requestAdapter(opts)) return true;
    } catch {
      /* try the next option */
    }
  }
  return false;
}

async function init(s: DetectorSettings, ortBase: string, modelBuffer?: ArrayBuffer) {
  settings = s;
  const warnings: string[] = [];
  if (!ort) {
    try {
      // WebGPU and WebAssembly backends (the WebGL backend can't run YOLO11: no Split operator)
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

  let buf = modelBuffer;
  if (!buf) {
    try {
      const res = await fetch(s.modelUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = await res.arrayBuffer();
    } catch (e) {
      throw Object.assign(new Error(`Model download failed (${String(e)}).`), { code: "model_load" });
    }
  }
  validateModelBuffer(buf, s.modelUrl);

  const tryCreate = async (ep: ExecutionProvider) => {
    const sess = await ort!.InferenceSession.create(new Uint8Array(buf!), {
      executionProviders: [ep],
      graphOptimizationLevel: "all",
    });
    // warm-up run validates operator support on this provider
    try {
      const size = s.inputSize;
      const dummy = new ort!.Tensor("float32", new Float32Array(3 * size * size), [1, 3, size, size]);
      const out = await sess.run({ [sess.inputNames[0]]: dummy });
      // a GPU backend without the precision it needs returns NaNs instead of failing
      const first = out[sess.outputNames[0]];
      const data = (await first.getData()) as Float32Array;
      for (let i = 0; i < data.length; i += 997) if (!Number.isFinite(data[i])) throw new Error("the backend returned invalid numbers");
      for (const k of Object.keys(out)) out[k].dispose?.();
    } catch (e) {
      // release GPU memory held by the failed session before falling back
      await sess.release().catch(() => undefined);
      throw e;
    }
    return sess;
  };

  await session?.release().catch(() => undefined);
  session = null;
  tensorBuf = null;
  const webgpu = s.preferredProvider === "webgpu" && (await hasWebGpu());
  if (webgpu) {
    try {
      session = await tryCreate("webgpu");
      provider = "webgpu";
    } catch (e) {
      if (s.allowWasmFallback === false) {
        throw Object.assign(new Error(`WebGPU initialization failed (${String((e as Error).message ?? e).slice(0, 120)})`), {
          code: "webgpu_failed",
        });
      }
      warnings.push(`WebGPU initialization failed (${String((e as Error).message ?? e).slice(0, 120)}); using WebAssembly (CPU), which is slower.`);
    }
  }
  if (!session && s.preferredProvider !== "wasm" && !webgpu) {
    warnings.push("WebGPU isn't available in this browser, so the GPU can't be used; using the processor (WebAssembly), which is slower.");
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
  cropState = null;
  post({ type: "ready", provider, warnings });
}

/**
 * Canvas resampling for a scale factor. "high" matters only for big downscales (4K → 960), where
 * the default aliases and can erase the ball; for upscales and mild downscales it costs tens of
 * milliseconds a frame on the CPU for no visible gain.
 */
function smoothingFor(scale: number): ImageSmoothingQuality {
  return scale < 0.5 ? "high" : "low";
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
    if (frameCtx) frameCtx.imageSmoothingQuality = smoothingFor(fw / W);
  }
  frameCtx!.drawImage(bitmap, 0, 0, fw, fh);
  const frameData = frameCtx!.getImageData(0, 0, fw, fh);
  const img: RgbaImage = { data: frameData.data, width: fw, height: fh };

  // Letterboxed detector input.
  const size = settings.inputSize;
  const lb = letterboxParams(W, H, size);
  inputCtx.fillStyle = "rgb(114,114,114)";
  inputCtx.fillRect(0, 0, size, size);
  inputCtx.imageSmoothingQuality = smoothingFor(lb.scale);
  inputCtx.drawImage(bitmap, lb.padX, lb.padY, Math.round(W * lb.scale), Math.round(H * lb.scale));
  const rgba = inputCtx.getImageData(0, 0, size, size).data;
  tensorBuf = toTensorData(rgba, size, tensorBuf ?? undefined);
  const tensor = new ort.Tensor("float32", tensorBuf, [1, 3, size, size]);

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
  let motionResidual = 0;
  if (prevThumb) {
    const m = estimateMotion(prevThumb, thumb);
    motionX = m.dx;
    motionY = m.dy;
    sceneCut = m.sceneCut;
    motionResidual = m.residual;
  }
  prevThumb = thumb;

  // Features for every detection; the pipeline decides offline which are players and which
  // candidate is the ball. The online tracker here only drives the live processing preview.
  const feats = frameFeatures(decoded, img);

  // Zoomed ball pass: a second detector run on a crop around where the ball probably is, so
  // a few-pixel broadcast ball is seen ~2.5x bigger (skipped when the full frame already has a
  // confident ball).
  let ballCandidates = feats.balls;
  if (settings.ballCropPass !== false && needsCropPass(decoded.balls)) {
    const center = cropCenter(cropState, t, feats.people);
    if (center) {
      const r = cropRect(center, W, H);
      const clb = letterboxParams(r.side, r.side, size);
      const cw = Math.round(r.side * clb.scale);
      inputCtx.fillStyle = "rgb(114,114,114)";
      inputCtx.fillRect(0, 0, size, size);
      inputCtx.imageSmoothingQuality = smoothingFor(cw / r.side);
      inputCtx.drawImage(bitmap, r.x, r.y, r.side, r.side, clb.padX, clb.padY, cw, cw);
      tensorBuf = toTensorData(inputCtx.getImageData(0, 0, size, size).data, size, tensorBuf);
      const cropTensor = new ort.Tensor("float32", tensorBuf, [1, 3, size, size]);
      const cropOut = await session.run({ [session.inputNames[0]]: cropTensor });
      const co = cropOut[session.outputNames[0]];
      const found = decodeYolo((await co.getData()) as Float32Array, co.dims, clb, { player: 1.01, ball: BALL_CROP.threshold }, 0.5).balls;
      cropTensor.dispose();
      for (const k of Object.keys(cropOut)) cropOut[k].dispose?.();
      const cands = found
        .filter((d) => d.box.width * r.side <= 40 && d.box.height * r.side <= 40)
        .map((d) => {
          const box = cropToFrame(d.box, r, W, H);
          return { box, confidence: d.score, grass: ballGrass(img, box), source: "crop" as const };
        });
      ballCandidates = mergeBallCandidates(feats.balls, cands);
    }
  }
  bitmap.close();
  cropState = updateCropState(cropState, ballCandidates, t);
  const players = selectPeople(feats.people);
  const previewBall = selectBallCandidates(ballCandidates, { ...DEFAULT_POLICY, ball: { ...DEFAULT_POLICY.ball, keep: 1 } });
  const balls = previewBall.map((b) => ({ box: b.box, confidence: b.confidence }));

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
    people: feats.people,
    ballCandidates,
    motionResidual,
    signature: thumbSignature(thumb),
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
        await init(msg.settings, msg.ortBase, msg.modelBuffer);
        break;
      case "frame":
        await processFrame(msg.frameIndex, msg.timestampSeconds, msg.bitmap);
        break;
      case "reset":
        tracker.reset();
        prevThumb = null;
        cropState = null;
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
