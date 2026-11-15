"use client";

import { useSyncExternalStore } from "react";
import { detectWebGpu } from "./analysis/coordinator";

/**
 * Which processor analysis will run on. Precedence is GPU (WebGPU) over CPU (WebAssembly):
 * the coordinator tries WebGPU first and only falls back to the CPU when no adapter is available
 * or the GPU backend fails. Detected once per page and shared by every component.
 */
export type Accelerator = "checking" | "gpu" | "cpu";

let state: Accelerator = "checking";
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  detectWebGpu()
    .then((gpu) => (state = gpu ? "gpu" : "cpu"))
    .catch(() => (state = "cpu"))
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
    () => "checking"
  );
}

export const acceleratorLabel: Record<Exclude<Accelerator, "checking">, { short: string; long: string }> = {
  gpu: { short: "GPU", long: "Runs on your GPU (WebGPU)" },
  cpu: { short: "CPU", long: "Runs on your CPU (WebAssembly); no WebGPU in this browser, so it is slower" },
};
