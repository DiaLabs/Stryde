"use client";

import { useSyncExternalStore } from "react";
import type { DevicePreference, ExecutionProvider } from "./types";

/**
 * Which processor analysis will run on:
 *   1. GPU through WebGPU
 *   2. CPU through WebAssembly otherwise. The detection model can't run on ONNX Runtime's WebGL
 *      backend (it lacks operators YOLO11 needs, e.g. Split), so a GPU the browser only exposes
 *      through WebGL can't be used; the UI says how to switch WebGPU on.
 * The analysis worker follows the same order. Detected once per page and shared.
 */
export interface Accelerator {
  kind: "checking" | "gpu" | "cpu";
  api?: "WebGPU" | "WebAssembly";
  /** human-readable GPU name when the browser reveals it, e.g. "NVIDIA GeForce GTX 1650" */
  device?: string;
  /** WebGPU exists in this browser but returned no adapter (switched off or blocklisted) */
  webgpuBlocked?: boolean;
}

const CHECKING: Accelerator = { kind: "checking" };
let state: Accelerator = CHECKING;
let started = false;
const listeners = new Set<() => void>();

/** "ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650/PCIe/SSE2, OpenGL 4.5.0)" → "NVIDIA GeForce GTX 1650" */
function cleanRenderer(r: string): string {
  const angle = r.match(/^ANGLE \((.*)\)$/);
  const parts = angle ? angle[1].split(",").map((p) => p.trim()) : [r];
  const name = (parts.length > 1 ? parts[1] : parts[0]).replace(/\/PCIe.*$/i, "").replace(/\s*\(0x[0-9a-f]+\)/gi, "").replace(/Direct3D.*$/i, "").trim();
  return name || r;
}

function webglDevice(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer)) return null;
    return cleanRenderer(renderer);
  } catch {
    return null;
  }
}

async function detect(): Promise<Accelerator> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(o?: object): Promise<{ info?: { description?: string; vendor?: string } } | null> } }).gpu;
  if (gpu) {
    for (const opts of [{ powerPreference: "high-performance" }, {}]) {
      try {
        const adapter = await gpu.requestAdapter(opts);
        if (adapter) {
          const device = adapter.info?.description || webglDevice() || adapter.info?.vendor || undefined;
          return { kind: "gpu", api: "WebGPU", device };
        }
      } catch {
        /* try the next option */
      }
    }
  }
  // a graphics card is there, but only WebGL reaches it: name it so the UI can say what to turn on
  return { kind: "cpu", api: "WebAssembly", device: webglDevice() ?? undefined, webgpuBlocked: !!gpu };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  detect()
    .then((a) => (state = a))
    .catch(() => (state = { kind: "cpu", api: "WebAssembly" }))
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export function useAccelerator(): Accelerator {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CHECKING
  );
}

/** Short and long descriptions for the status UI. */
export function describeAccelerator(a: Accelerator): { short: string; long: string; hint?: string } | null {
  if (a.kind === "checking") return null;
  if (a.kind === "gpu") {
    const on = a.device ? ` (${a.device})` : "";
    return { short: "GPU", long: `Runs on your GPU${on} through WebGPU` };
  }
  if (a.device) {
    return {
      short: "CPU",
      long: `Runs on your CPU: this device has a GPU (${a.device}), but WebGPU is off in this browser`,
      hint: "To use the GPU, turn on WebGPU: in Chrome open chrome://flags, enable Unsafe WebGPU Support (and Vulkan on Linux), then restart Chrome.",
    };
  }
  return {
    short: "CPU",
    long: "Runs on your CPU (WebAssembly); this browser gives no access to a graphics card",
    hint: a.webgpuBlocked ? "Turn on hardware acceleration in the browser settings, or WebGPU in chrome://flags, to use the GPU." : undefined,
  };
}

// ---------------------------------------------------------------- user's device choice

const PREF_KEY = "stryde-device";
const prefListeners = new Set<() => void>();

function readPref(): DevicePreference {
  try {
    return localStorage.getItem(PREF_KEY) === "cpu" ? "cpu" : "gpu";
  } catch {
    return "gpu";
  }
}

/** The GPU/CPU choice on the upload page, remembered in this browser (default: GPU). */
export function useDevicePreference(): [DevicePreference, (v: DevicePreference) => void] {
  const pref = useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    readPref,
    () => "gpu" as DevicePreference
  );
  const set = (v: DevicePreference) => {
    try {
      localStorage.setItem(PREF_KEY, v);
    } catch {
      /* private mode: the choice still applies to this analysis */
    }
    prefListeners.forEach((l) => l());
  };
  return [pref, set];
}

/**
 * Plain wording for where an analysis is running: "the GPU of this device" or "the CPU of this
 * device", naming the GPU when the browser reveals it and saying why when it is the CPU.
 */
export function runningOn(
  provider: ExecutionProvider | undefined,
  chosen: DevicePreference | undefined,
  accel: Accelerator
): { kind: "gpu" | "cpu"; short: string; sentence: string; note?: string } | null {
  if (!provider) return null;
  if (provider === "webgpu") {
    const name = accel.device ? `${accel.device}, ` : "";
    return { kind: "gpu", short: "GPU", sentence: `Running on the GPU of this device (${name}WebGPU).` };
  }
  if (chosen === "cpu") {
    return {
      kind: "cpu",
      short: "CPU",
      sentence: "Running on the CPU of this device, as chosen on the upload page.",
      note: accel.kind === "gpu" ? `This device has a GPU${accel.device ? ` (${accel.device})` : ""}: choose GPU on the upload page for a much faster analysis.` : undefined,
    };
  }
  return {
    kind: "cpu",
    short: "CPU",
    sentence: accel.device
      ? "Running on the CPU of this device: WebGPU is off in this browser, so the GPU can't be used."
      : "Running on the CPU of this device: the browser gave no access to the GPU.",
    note: accel.device ? "Turn on WebGPU (chrome://flags, Unsafe WebGPU Support, and Vulkan on Linux), restart Chrome, and analysis will use the GPU." : undefined,
  };
}
