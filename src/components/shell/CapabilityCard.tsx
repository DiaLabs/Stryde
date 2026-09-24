"use client";

import { Cpu, Gauge, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { detectWebGpu } from "@/lib/analysis/coordinator";
import { Badge } from "@/components/ui/primitives";

export function useCapabilities() {
  const [caps, setCaps] = useState<{ webgpu: boolean | null; isolated: boolean; threads: number }>({
    webgpu: null,
    isolated: false,
    threads: 1,
  });
  useEffect(() => {
    let alive = true;
    detectWebGpu().then((webgpu) => {
      if (alive)
        setCaps({
          webgpu,
          isolated: self.crossOriginIsolated,
          threads: navigator.hardwareConcurrency || 1,
        });
    });
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}

export function CapabilityCard() {
  const caps = useCapabilities();
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ink">
          <Gauge className="size-4 text-ink-2" aria-hidden /> GPU acceleration (WebGPU)
        </span>
        {caps.webgpu === null ? (
          <Badge>Checking…</Badge>
        ) : caps.webgpu ? (
          <Badge tone="ok">Available</Badge>
        ) : (
          <Badge tone="warn">Not available</Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ink">
          <Cpu className="size-4 text-ink-2" aria-hidden /> CPU fallback (WebAssembly)
        </span>
        <Badge tone="ok">{caps.isolated ? `Multi-threaded · ${Math.min(4, Math.max(1, caps.threads - 1))} threads` : "Single-threaded"}</Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ink">
          <ShieldCheck className="size-4 text-ink-2" aria-hidden /> Video upload
        </span>
        <Badge tone="ok">Never — stays on device</Badge>
      </div>
      {caps.webgpu === false && (
        <p className="text-xs text-ink-2">
          Without WebGPU, analysis runs on the CPU and takes longer. Faster mode is recommended; a recent Chrome or Edge enables WebGPU on most desktops.
        </p>
      )}
    </div>
  );
}
