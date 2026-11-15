"use client";

import { useSyncExternalStore } from "react";

/**
 * Which processor analysis will run on, in order of preference:
 *   1. GPU through WebGPU (fastest)
 *   2. GPU through WebGL (when the browser keeps WebGPU off, common in Chrome on Linux)
 *   3. CPU through WebAssembly (no usable graphics card)
 * The analysis worker follows the same order. Detected once per page and shared.
 */
export interface Accelerator {
  kind: "checking" | "gpu" | "cpu";
  api?: "WebGPU" | "WebGL" | "WebAssembly";
  /** human-readable device name when the browser reveals it, e.g. "NVIDIA GeForce GTX 1650" */
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
  const gl = webglDevice();
  if (gl) return { kind: "gpu", api: "WebGL", device: gl, webgpuBlocked: !!gpu };
  return { kind: "cpu", api: "WebAssembly", webgpuBlocked: !!gpu };
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
    return a.api === "WebGPU"
      ? { short: "GPU", long: `Runs on your GPU${on} through WebGPU` }
      : {
          short: "GPU",
          long: `Runs on your GPU${on} through WebGL`,
          hint: "For more speed, turn on WebGPU in chrome://flags (Unsafe WebGPU Support, and Vulkan on Linux), then restart Chrome.",
        };
  }
  return {
    short: "CPU",
    long: "Runs on your CPU (WebAssembly); this browser gives no access to a graphics card",
    hint: a.webgpuBlocked ? "Turn on hardware acceleration in the browser settings, or WebGPU in chrome://flags, to use the GPU." : undefined,
  };
}
