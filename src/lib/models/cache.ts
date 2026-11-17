import { ALL_MODEL_IDS, MODEL_CACHE_DAYS, MODELS, type ModelId, type ModelSpec } from "./registry";

export type ModelLoadState = "idle" | "loading" | "ready" | "error";

export interface ModelStatus {
  id: ModelId;
  name: string;
  state: ModelLoadState;
  /** 0–1 download progress when loading from network */
  progress: number;
  fromCache: boolean;
  bytes?: number;
  error?: string;
}

type Snapshot = Record<ModelId, ModelStatus>;

const CACHE_NAME = "stryde-models-v2";
const TTL_MS = MODEL_CACHE_DAYS * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
const memory = new Map<ModelId, ArrayBuffer>();
const inflight = new Map<ModelId, Promise<ArrayBuffer>>();

function emptyStatus(spec: ModelSpec): ModelStatus {
  return { id: spec.id, name: spec.name, state: "idle", progress: 0, fromCache: false };
}

let snapshot: Snapshot = {
  yolo11n: emptyStatus(MODELS.yolo11n),
  yolo11s: emptyStatus(MODELS.yolo11s),
  ball: emptyStatus(MODELS.ball),
};

function emit() {
  listeners.forEach((l) => l());
}

function patch(id: ModelId, p: Partial<ModelStatus>) {
  snapshot = { ...snapshot, [id]: { ...snapshot[id], ...p } };
  emit();
}

function validateBuffer(buf: ArrayBuffer, spec: ModelSpec): void {
  if (buf.byteLength < spec.minBytes) {
    throw new Error(`${spec.name} file too small (${buf.byteLength} bytes)`);
  }
  const head = new TextDecoder().decode(buf.slice(0, 64));
  if (head.startsWith("version https://git-lfs.github.com/spec/v1")) {
    throw new Error(`${spec.name} is a Git LFS pointer, not ONNX weights`);
  }
  if (head.startsWith("<!DOCTYPE") || head.startsWith("<html")) {
    throw new Error(`${spec.name} download returned HTML instead of ONNX weights`);
  }
}

/** Cache reads are best-effort: any CacheStorage failure falls back to the network. */
async function readCache(url: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(url);
    if (!res) return null;
    const cachedAt = Number(res.headers.get("X-Stryde-Cached-At") ?? 0);
    if (!cachedAt || Date.now() - cachedAt > TTL_MS) {
      await cache.delete(url);
      return null;
    }
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function deleteCache(url: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(url);
  } catch {
    /* best-effort */
  }
}

/** Cache writes are best-effort: quota or SecurityError must not fail a valid download. */
async function writeCache(url: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Stryde-Cached-At": String(Date.now()),
        },
      })
    );
  } catch {
    /* storage full or unavailable: keep the in-memory copy only */
  }
}

async function download(spec: ModelSpec): Promise<ArrayBuffer> {
  patch(spec.id, { state: "loading", progress: 0, error: undefined, fromCache: false });

  const cached = await readCache(spec.url);
  if (cached) {
    try {
      validateBuffer(cached, spec);
      patch(spec.id, { state: "ready", progress: 1, fromCache: true, bytes: cached.byteLength });
      return cached;
    } catch {
      // corrupt cache entry: evict it and fetch a fresh copy
      await deleteCache(spec.url);
    }
  }

  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    validateBuffer(buf, spec);
    await writeCache(spec.url, buf);
    patch(spec.id, { state: "ready", progress: 1, fromCache: false, bytes: buf.byteLength });
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (total > 0) patch(spec.id, { progress: Math.min(0.99, loaded / total) });
  }
  const buf = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const out = buf.buffer;
  validateBuffer(out, spec);
  await writeCache(spec.url, out);
  patch(spec.id, { state: "ready", progress: 1, fromCache: false, bytes: out.byteLength });
  return out;
}

async function load(id: ModelId): Promise<ArrayBuffer> {
  const existing = memory.get(id);
  if (existing) return existing;

  const spec = MODELS[id];
  try {
    const buf = await download(spec);
    memory.set(id, buf);
    return buf;
  } catch (e) {
    const message = String((e as Error).message ?? e);
    patch(id, { state: "error", error: message, progress: 0 });
    throw e;
  }
}

function preload(id: ModelId): void {
  if (snapshot[id].state === "ready" || inflight.has(id)) return;
  void ensureModel(id).catch(() => undefined);
}

async function hasWebGpuAdapter(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/**
 * Warm the model cache when the app opens. The small model is always needed; the larger
 * one is only used with WebGPU, so CPU-only devices never download it up front.
 */
export function preloadAllModels(): void {
  preload("yolo11n");
  preload("ball");
  void hasWebGpuAdapter().then((gpu) => {
    if (gpu) preload("yolo11s");
  });
}

/** Wait until a model is ready and return its bytes for inference. */
export async function ensureModel(id: ModelId): Promise<ArrayBuffer> {
  if (memory.has(id)) return memory.get(id)!;
  if (inflight.has(id)) return inflight.get(id)!;
  const p = load(id);
  inflight.set(id, p);
  try {
    return await p;
  } finally {
    inflight.delete(id);
  }
}

export function retryModel(id: ModelId): void {
  memory.delete(id);
  patch(id, emptyStatus(MODELS[id]));
  void deleteCache(MODELS[id].url).then(() => preload(id));
}

export function subscribeModelCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getModelCacheSnapshot(): Snapshot {
  return snapshot;
}

export function anyModelLoading(): boolean {
  return ALL_MODEL_IDS.some((id) => snapshot[id].state === "loading");
}

/** The football ball model improves results but analysis works without it. */
const OPTIONAL: ModelId[] = ["ball"];

/** Models that have been requested at least once this session (an optional one that failed is left out). */
function requestedModels(): ModelId[] {
  return ALL_MODEL_IDS.filter((id) => snapshot[id].state !== "idle" && !(OPTIONAL.includes(id) && snapshot[id].state === "error"));
}

export function allModelsReady(): boolean {
  const req = requestedModels();
  return req.length > 0 && req.every((id) => snapshot[id].state === "ready");
}

export function modelCacheSummary(): { state: ModelLoadState; label: string; progress: number } {
  const req = requestedModels();
  if (req.some((id) => snapshot[id].state === "error")) {
    return { state: "error", label: "Couldn’t load the analysis engine", progress: 0 };
  }
  const loading = req.filter((id) => snapshot[id].state === "loading");
  if (loading.length) {
    const avg = loading.reduce((s, id) => s + snapshot[id].progress, 0) / loading.length;
    return { state: "loading", label: "Loading the detection model", progress: avg };
  }
  if (allModelsReady()) {
    return { state: "ready", label: "Ready", progress: 1 };
  }
  return { state: "idle", label: "Preparing analysis engine", progress: 0 };
}
