"use client";

import { Cpu, Gauge, ShieldCheck, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { detectWebGpu } from "@/lib/analysis/coordinator";
import { describeAccelerator, useAccelerator } from "@/lib/accelerator";

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

function Row({ icon: Icon, term, children }: { icon: LucideIcon; term: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0 sm:py-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-ok">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-[13px] font-semibold text-ink">{term}</dt>
        <dd className="mt-0.5 text-xs leading-relaxed text-ink-2">{children}</dd>
      </div>
    </div>
  );
}

/**
 * What this browser can do, in a coach's words: where the analysis runs, what that means for
 * waiting time and which mode to pick, and where the video goes.
 */
export function CapabilityCard() {
  const caps = useCapabilities();
  const accel = useAccelerator();
  const desc = describeAccelerator(accel);
  const cores = caps.isolated ? Math.min(4, Math.max(1, caps.threads - 1)) : 1;
  return (
    <Card>
      <CardHeader
        title="This device"
        action={
          accel.kind === "checking" ? (
            <Badge tone="neutral">Checking…</Badge>
          ) : accel.kind === "gpu" ? (
            <Badge tone="ok">GPU, {accel.api}</Badge>
          ) : (
            <Badge tone="warn">CPU only</Badge>
          )
        }
      />
      <dl className="grid divide-y divide-line-soft px-5 pb-5 sm:grid-cols-3 sm:gap-6 sm:divide-y-0" aria-busy={accel.kind === "checking" || undefined}>
        <Row icon={Gauge} term="Speed">
          {!desc
            ? "Checking this browser…"
            : accel.kind === "gpu"
              ? `${desc.long}. ${accel.api === "WebGPU" ? "Both modes work well here, including More detailed." : "Faster mode is quick here; More detailed is best with WebGPU."}${desc.hint ? ` ${desc.hint}` : ""}`
              : `${desc.long}. Use Faster mode and expect a one-minute clip to take several minutes.${desc.hint ? ` ${desc.hint}` : ""}`}
        </Row>
        <Row icon={Cpu} term="Processor">
          {cores > 1 ? (
            <>
              Work is shared across <span className="font-semibold text-ink tabular">{cores}</span> processor cores.
            </>
          ) : (
            "Work runs on one processor core in this browser."
          )}
        </Row>
        <Row icon={ShieldCheck} term="Your video">
          Read from this device and analyzed in this tab. It is never uploaded.
        </Row>
      </dl>
    </Card>
  );
}
