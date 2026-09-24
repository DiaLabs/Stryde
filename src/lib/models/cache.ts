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

async function readCache(url: string): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(url);
  if (!res) return null;
  const cachedAt = Number(res.headers.get("X-Stryde-Cached-At") ?? 0);
  if (!cachedAt || Date.now() - cachedAt > TTL_MS) {
    await cache.delete(url);
    return null;
  }
  return res.arrayBuffer();
}

async function writeCache(url: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof caches === "undefined") return;
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
}

async function download(spec: ModelSpec): Promise<ArrayBuffer> {
  patch(spec.id, { state: "loading", progress: 0, error: undefined, fromCache: false });

  const cached = await readCache(spec.url);
  if (cached) {
    validateBuffer(cached, spec);
    patch(spec.id, { state: "ready", progress: 1, fromCache: true, bytes: cached.byteLength });
    return cached;
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

/** Download and cache all detection models (call once when the app opens). */
export function preloadAllModels(): void {
  for (const id of ALL_MODEL_IDS) {
    if (snapshot[id].state === "ready" || inflight.has(id)) continue;
    void ensureModel(id).catch(() => undefined);
  }
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
  preloadAllModels();
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

export function allModelsReady(): boolean {
  return ALL_MODEL_IDS.every((id) => snapshot[id].state === "ready");
}

export function modelCacheSummary(): { state: ModelLoadState; label: string; progress: number } {
  if (ALL_MODEL_IDS.some((id) => snapshot[id].state === "error")) {
    return { state: "error", label: "Model download failed", progress: 0 };
  }
  const loading = ALL_MODEL_IDS.filter((id) => snapshot[id].state === "loading");
  if (loading.length) {
    const avg = loading.reduce((s, id) => s + snapshot[id].progress, 0) / loading.length;
    const names = loading.map((id) => snapshot[id].name).join(" · ");
    return { state: "loading", label: `Downloading ${names}`, progress: avg };
  }
  if (allModelsReady()) {
    return { state: "ready", label: "Detection models ready", progress: 1 };
  }
  return { state: "idle", label: "Preparing detection models", progress: 0 };
}
