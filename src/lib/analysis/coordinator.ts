import type {
  AnalysisError,
  AnalysisSession,
  DetectorSettings,
  ExecutionProvider,
  MatchConfig,
  VideoMetadata,
  WorkerFrameRecord,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import { seekTo, waitForEvent } from "../video";
import type { RawAnalysis } from "./pipeline";
import { ensureModel } from "../models/cache";
import { MODELS } from "../models/registry";

export const STAGES = [
  "Preparing video and model",
  "Detecting players and ball",
  "Tracking objects and assigning teams",
  "Calculating team analytics",
  "Preparing annotated playback",
] as const;

interface ModeProfile {
  model: string;
  modelUrl: string;
  inputSize: number;
  sampleFps: number;
}

export const MODE_PROFILES: Record<"faster" | "detailed" | "detailed_cpu", ModeProfile> = {
  faster: { model: MODELS.yolo11n.name, modelUrl: MODELS.yolo11n.url, inputSize: 960, sampleFps: 5 },
  detailed: { model: MODELS.yolo11s.name, modelUrl: MODELS.yolo11s.url, inputSize: 960, sampleFps: 10 },
  detailed_cpu: { model: MODELS.yolo11n.name, modelUrl: MODELS.yolo11n.url, inputSize: 960, sampleFps: 8 },
};

export async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function toError(code: string, message: string): AnalysisError {
  const map: Record<string, Partial<AnalysisError>> = {
    runtime_load: { suggestedAction: "Reload the page. If it persists, use a recent Chrome, Edge or Firefox.", recoverable: true },
    model_load: { suggestedAction: "Check your connection and retry; the model is downloaded once per session.", recoverable: true },
    backend_unavailable: {
      suggestedAction: "Use a recent Chromium-based browser (WebGPU) or enable WebAssembly.",
      recoverable: false,
    },
    out_of_memory: { suggestedAction: "Retry with Faster mode or a shorter / lower-resolution clip.", recoverable: true },
    inference_failed: { suggestedAction: "Retry with Faster mode. Closing other GPU-heavy tabs can help.", recoverable: true },
    decode_failed: { suggestedAction: "Convert the clip to MP4 (H.264) and try again.", recoverable: true },
    worker_failed: { suggestedAction: "Reload the page and retry.", recoverable: true },
    timeout: { suggestedAction: "Retry with Faster mode or a shorter clip.", recoverable: true },
  };
  return { code, message, recoverable: true, ...map[code] };
}

export interface CoordinatorCallbacks {
  onProgress: (s: AnalysisSession, preview?: { record: WorkerFrameRecord }) => void;
  onComplete: (raw: RawAnalysis) => void;
  onError: (e: AnalysisError, partial?: RawAnalysis) => void;
  /** Canvas that should receive a live preview of the frame being analyzed, if any. */
  getPreviewCanvas?: () => HTMLCanvasElement | null;
}

/** Give up on a clip after this many frames in a row fail to seek or decode. */
const MAX_CONSECUTIVE_DECODE_FAILURES = 8;

/**
 * Main-thread analysis coordinator: seeks a hidden <video> to sampled timestamps,
 * transfers frames to the inference worker with bounded in-flight work, and
 * collects per-frame records. The source video never leaves the device.
 */
export class AnalysisCoordinator {
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private url: string | null = null;
  private cancelled = false;
  private stopRequested = false;
  private session: AnalysisSession;
  private pending = new Map<number, { resolve: (r: WorkerFrameRecord) => void; reject: (e: AnalysisError) => void }>();
  private readyWaiter: { resolve: (p: { provider: ExecutionProvider; warnings: string[] }) => void; reject: (e: AnalysisError) => void } | null =
    null;

  constructor(
    private sessionId: string,
    private file: File,
    private meta: VideoMetadata,
    private config: MatchConfig,
    private cb: CoordinatorCallbacks
  ) {
    this.session = {
      sessionId,
      status: "idle",
      mode: config.mode,
      progress: 0,
      warnings: [],
    };
  }

  getSession() {
    return this.session;
  }

  private update(patch: Partial<AnalysisSession>, preview?: { record: WorkerFrameRecord }) {
    // once cancelled, only the cancellation itself may be reported
    if (this.cancelled && patch.status !== "cancelled") return;
    this.session = { ...this.session, ...patch };
    this.cb.onProgress(this.session, preview);
  }

  private spawnWorker(): Worker {
    const w = new Worker("/workers/analysis.worker.js");
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === "ready") {
        this.readyWaiter?.resolve({ provider: msg.provider, warnings: msg.warnings });
        this.readyWaiter = null;
      } else if (msg.type === "frame") {
        const p = this.pending.get(msg.record.frameIndex);
        this.pending.delete(msg.record.frameIndex);
        p?.resolve(msg.record);
      } else if (msg.type === "error") {
        const err = toError(msg.code, msg.message);
        if (msg.frameIndex !== undefined) {
          const p = this.pending.get(msg.frameIndex);
          this.pending.delete(msg.frameIndex);
          p?.reject(err);
        } else if (this.readyWaiter) {
          this.readyWaiter.reject(err);
          this.readyWaiter = null;
        }
      }
    };
    w.onerror = (ev) => {
      const err = toError("worker_failed", `Analysis worker crashed: ${ev.message || "unknown error"}`);
      this.readyWaiter?.reject(err);
      this.readyWaiter = null;
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    return w;
  }

  /** optional football ball detector, sent to every worker this run starts */
  private ballModelBuffer: ArrayBuffer | undefined;

  private async initWorker(profile: ModeProfile, preferred: ExecutionProvider, modelBuffer: ArrayBuffer) {
    if (this.cancelled) throw toError("cancelled", "Cancelled");
    this.worker?.terminate();
    this.worker = this.spawnWorker();
    const settings: DetectorSettings = {
      modelUrl: profile.modelUrl,
      inputSize: profile.inputSize,
      playerThreshold: 0.2,
      ballThreshold: profile.sampleFps >= 8 ? 0.06 : 0.075,
      iouThreshold: 0.5,
      preferredProvider: preferred,
    };
    const ready = new Promise<{ provider: ExecutionProvider; warnings: string[] }>((resolve, reject) => {
      this.readyWaiter = { resolve, reject };
    });
    // copies: a buffer posted to a worker is detached, and a GPU-to-CPU restart needs it again
    this.post({ type: "init", settings, ortBase: "/ort/", modelBuffer, ballModelBuffer: this.ballModelBuffer?.slice(0) });
    return ready;
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }

  private sendFrame(frameIndex: number, t: number, bitmap: ImageBitmap): Promise<WorkerFrameRecord> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(frameIndex)) {
          this.pending.delete(frameIndex);
          reject(toError("timeout", "A frame took more than 90 seconds to analyze."));
        }
      }, 90000);
      this.pending.set(frameIndex, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.post({ type: "frame", frameIndex, timestampSeconds: t, bitmap }, [bitmap]);
    });
  }

  /** Stop frame extraction and finish with the frames processed so far. */
  stopEarly() {
    this.stopRequested = true;
  }

  async start(modelBuffer: ArrayBuffer, ballModelBuffer?: ArrayBuffer): Promise<void> {
    this.ballModelBuffer = ballModelBuffer;
    const ballModelMissing = !ballModelBuffer;
    const started = performance.now();
    this.update({ status: "loading", stage: "Preparing video…", stageIndex: 0, progress: 0.02, startedAt: Date.now() });
    const warnings: string[] = [];
    const adaptations: string[] = [];
    if (ballModelMissing) warnings.push("The football ball detector failed to download; using the general detector for the ball.");

    // --- video element
    this.url = URL.createObjectURL(this.file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = this.url;
    this.video = video;
    try {
      await waitForEvent(video, "loadeddata", 20000);
    } catch (e) {
      return this.fail(toError("decode_failed", `The video could not be decoded: ${String((e as Error).message)}`));
    }

    if (this.cancelled) return;

    // --- model / backend
    const cpuOnly = this.config.device === "cpu";
    const gpu = cpuOnly ? false : await detectWebGpu();
    if (this.cancelled) return;
    let profile = this.config.mode === "detailed" ? MODE_PROFILES.detailed : MODE_PROFILES.faster;
    if (this.config.mode === "detailed" && !gpu) {
      profile = MODE_PROFILES.detailed_cpu;
      adaptations.push(
        cpuOnly
          ? "Running on the CPU as chosen: More detailed uses the smaller model at 8 samples/s."
          : "WebGPU unavailable: More detailed uses the smaller model at 8 samples/s."
      );
    }
    let provider: ExecutionProvider;
    try {
      // the GPU through WebGPU when the browser offers it (unless the CPU was chosen), else the CPU
      const r = await this.initWorker(profile, gpu ? "webgpu" : "wasm", modelBuffer);
      provider = r.provider;
      warnings.push(...r.warnings);
      if (provider === "wasm" && profile === MODE_PROFILES.detailed) {
        profile = MODE_PROFILES.detailed_cpu;
        adaptations.push("GPU backend failed: switched to the smaller model at 8 samples/s on the CPU backend.");
        const nBuf = await ensureModel("yolo11n");
        if (this.cancelled) return;
        const r2 = await this.initWorker(profile, "wasm", nBuf);
        provider = r2.provider;
      }
    } catch (e) {
      return this.fail(e as AnalysisError);
    }
    if (this.cancelled) return;
    if (provider === "wasm" && !cpuOnly) warnings.push("Running on the CPU (WebAssembly) backend; analysis will be slower than with WebGPU.");
    this.update({ provider, warnings: [...warnings, ...adaptations], progress: 0.05 });

    // --- frame loop
    const duration = this.meta.durationSeconds;
    const fps = profile.sampleFps;
    const total = Math.max(1, Math.floor(duration * fps));
    const times = Array.from({ length: total }, (_, i) => Math.min(duration - 0.04, i / fps + 0.02));
    const records: WorkerFrameRecord[] = [];
    const inflight: { index: number; promise: Promise<WorkerFrameRecord> }[] = [];
    const MAX_INFLIGHT = 2;
    let gpuFallbackUsed = false;
    const frameTimes: number[] = [];
    let lastTick = performance.now();
    // after a mid-run worker restart the new tracker numbers tracks from 1 again;
    // offset them so they never merge with tracks from before the restart
    let trackIdOffset = 0;
    let markNextAsCut = false;
    let skippedFrames = 0;
    let consecutiveFailures = 0;

    const handleRecord = (rec: WorkerFrameRecord) => {
      if (trackIdOffset > 0) {
        rec = { ...rec, players: rec.players.map((p) => ({ ...p, trackId: p.trackId + trackIdOffset })) };
      }
      if (markNextAsCut) {
        rec = { ...rec, sceneCut: true };
        markNextAsCut = false;
      }
      records.push(rec);
      const now = performance.now();
      frameTimes.push(now - lastTick);
      lastTick = now;
      if (frameTimes.length > 20) frameTimes.shift();
      const avg = frameTimes.reduce((s, v) => s + v, 0) / frameTimes.length;
      const remaining = ((total - records.length) * avg) / 1000;
      const stageIndex = records.length < total * 0.1 ? 1 : 2;
      this.update(
        {
          status: "processing",
          stage: `${STAGES[stageIndex]} · ~${formatEta(remaining)} left`,
          stageIndex,
          processedFrames: records.length,
          totalFrames: total,
          progress: 0.05 + 0.9 * (records.length / total),
        },
        { record: rec }
      );
    };

    this.update({ status: "processing", stage: STAGES[1], stageIndex: 1, totalFrames: total, processedFrames: 0 });
    let fatal: AnalysisError | null = null;
    const skip = () => {
      skippedFrames++;
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_DECODE_FAILURES) {
        fatal = toError("decode_failed", `${consecutiveFailures} frames in a row could not be decoded; the rest of the file looks unreadable.`);
      }
    };
    for (let i = 0; i < total; i++) {
      if (this.cancelled) return;
      if (this.stopRequested) break;
      try {
        await seekTo(video, times[i]);
      } catch {
        skip();
        if (fatal) break;
        continue;
      }
      if (this.cancelled) return;
      this.drawPreview(video);
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(video);
      } catch {
        skip();
        if (fatal) break;
        continue;
      }
      consecutiveFailures = 0;
      const promise = this.sendFrame(i, times[i], bitmap);
      // cancellation rejects in-flight frames that may never be awaited
      promise.catch(() => undefined);
      inflight.push({ index: i, promise });
      if (inflight.length >= MAX_INFLIGHT) {
        const head = inflight.shift()!;
        try {
          handleRecord(await head.promise);
        } catch (e) {
          const err = e as AnalysisError;
          if (this.cancelled) return;
          if (provider === "webgpu" && !gpuFallbackUsed) {
            // GPU failure mid-run: restart on CPU with the smaller model and re-run the frames
            // that were in flight, so none are silently dropped.
            gpuFallbackUsed = true;
            inflight.length = 0;
            this.pending.clear();
            profile = MODE_PROFILES.faster;
            try {
              const nBuf = await ensureModel("yolo11n");
              const r = await this.initWorker(profile, "wasm", nBuf);
              provider = r.provider;
            } catch (e2) {
              if (this.cancelled) return;
              fatal = e2 as AnalysisError;
              break;
            }
            let maxId = 0;
            for (const rec of records) for (const p of rec.players) maxId = Math.max(maxId, p.trackId);
            trackIdOffset = maxId + 1;
            markNextAsCut = true;
            adaptations.push(
              `GPU inference failed at ${times[head.index].toFixed(1)} s (${err.message}); continued on the processor with the smaller model. Tracks restart at that point.`
            );
            this.update({ provider, warnings: [...warnings, ...adaptations] });
            i = head.index - 1;
            continue;
          }
          fatal = err;
          break;
        }
      }
    }
    while (inflight.length && !fatal) {
      try {
        handleRecord(await inflight.shift()!.promise);
      } catch (e) {
        if (this.cancelled) return;
        fatal = e as AnalysisError;
      }
    }
    if (this.cancelled) return;
    if (skippedFrames > 0) {
      warnings.push(`${skippedFrames} sampled frame${skippedFrames === 1 ? "" : "s"} could not be decoded and ${skippedFrames === 1 ? "was" : "were"} skipped.`);
    }

    const stoppedEarly = this.stopRequested || (fatal !== null && records.length > 0);
    const raw: RawAnalysis = {
      sessionId: this.sessionId,
      video: this.meta,
      config: this.config,
      frames: records,
      sampleFps: fps,
      expectedFrameCount: total,
      provider,
      model: profile.model,
      inputSize: profile.inputSize,
      mode: this.config.mode,
      durationMs: performance.now() - started,
      adaptations,
      warnings,
      cancelledEarly: stoppedEarly && records.length < total,
    };
    if (fatal) {
      this.teardown();
      if (records.length >= Math.max(10, total * 0.15)) {
        raw.warnings.push(`Processing stopped: ${fatal.message}`);
        this.update({ status: "rendering", stage: STAGES[3], stageIndex: 3, progress: 0.96 });
        this.cb.onComplete(raw);
        return;
      }
      return this.fail(fatal);
    }
    if (records.length === 0) {
      return this.fail(toError("decode_failed", "No frames could be analyzed from this video."));
    }
    this.update({ status: "rendering", stage: STAGES[3], stageIndex: 3, progress: 0.96 });
    this.teardown();
    this.cb.onComplete(raw);
  }

  private drawPreview(video: HTMLVideoElement) {
    const c = this.cb.getPreviewCanvas?.() ?? null;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (c.width !== 480) {
      c.width = 480;
      c.height = Math.round((480 * video.videoHeight) / video.videoWidth);
    }
    ctx.drawImage(video, 0, 0, c.width, c.height);
  }

  private fail(err: AnalysisError) {
    this.teardown();
    // a cancelled run must never report failure (it could clobber a newer run)
    if (this.cancelled) return;
    this.update({ status: "failed", stage: undefined });
    this.cb.onError(err);
  }

  async cancel() {
    this.cancelled = true;
    this.teardown();
    this.update({ status: "cancelled", stage: undefined });
  }

  private teardown() {
    for (const p of this.pending.values()) p.reject(toError("cancelled", "Cancelled"));
    this.pending.clear();
    this.readyWaiter?.reject(toError("cancelled", "Cancelled"));
    this.readyWaiter = null;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "dispose" } satisfies WorkerRequest);
      } catch {
        /* worker already gone */
      }
      const w = this.worker;
      setTimeout(() => w.terminate(), 500);
      this.worker = null;
    }
    if (this.video) {
      this.video.removeAttribute("src");
      this.video.load();
      this.video = null;
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }

  async dispose() {
    this.cancelled = true;
    this.teardown();
  }
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "…";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}
