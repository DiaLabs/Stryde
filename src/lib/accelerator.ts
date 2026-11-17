"use client";

import { useSyncExternalStore } from "react";
import type { DevicePreference, ExecutionProvider } from "./types";

/**
 * Which processor analysis will run on: the GPU when the browser offers WebGPU, else the CPU
 * (WebAssembly). The analysis worker follows the same rule. Detected once per page and shared.
 */
export interface Accelerator {
  kind: "checking" | "gpu" | "cpu";
  api?: "WebGPU" | "WebAssembly";
  /** human-readable device name when the browser reveals it, e.g. "NVIDIA GeForce GTX 1650" */
  device?: string;
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
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { description?: string; vendor?: string } } | null> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return { kind: "gpu", api: "WebGPU", device: adapter.info?.description || webglDevice() || adapter.info?.vendor || undefined };
    } catch {
      /* no WebGPU */
    }
  }
  return { kind: "cpu", api: "WebAssembly" };
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
  if (a.kind === "gpu") return { short: "GPU", long: `Runs on your GPU${a.device ? ` (${a.device})` : ""} through WebGPU` };
  return { short: "CPU", long: "Runs on your CPU (WebAssembly); this browser offers no WebGPU" };
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
  // the upload page forces the CPU when no usable GPU was found: explain that, not a "choice"
  if (chosen === "cpu" && accel.kind === "gpu") {
    return {
      kind: "cpu",
      short: "CPU",
      sentence: "Running on the CPU of this device, as chosen on the upload page.",
      note: accel.kind === "gpu" ? `This device has a GPU${accel.device ? ` (${accel.device})` : ""}: choose GPU on the upload page for a much faster analysis.` : undefined,
    };
  }
  if (accel.kind === "gpu") {
    // WebGPU was there when the page checked, but the GPU failed during this analysis
    return { kind: "cpu", short: "CPU", sentence: "Running on the CPU of this device: the GPU stopped working during this analysis." };
  }
  return { kind: "cpu", short: "CPU", sentence: "Running on the CPU of this device: the browser offers no WebGPU." };
}
