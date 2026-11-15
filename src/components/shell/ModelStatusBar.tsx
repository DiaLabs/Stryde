"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Cpu, Loader2, RefreshCw, Zap } from "lucide-react";
import { useSyncExternalStore } from "react";
import { describeAccelerator, useAccelerator } from "@/lib/accelerator";
import { getModelCacheSnapshot, modelCacheSummary, preloadAllModels, retryModel, subscribeModelCache } from "@/lib/models/cache";
import { ALL_MODEL_IDS } from "@/lib/models/registry";

/**
 * Detection-engine status, shown inside the shell (sidebar on desktop, header on phones).
 * It used to be a floating toast that covered the header on small screens.
 */
export function ModelStatusBar({ dark, compact, className }: { dark?: boolean; compact?: boolean; className?: string }) {
  const snapshot = useSyncExternalStore(subscribeModelCache, getModelCacheSnapshot, getModelCacheSnapshot);
  const summary = modelCacheSummary();
  const accel = useAccelerator();
  if (summary.state === "idle") return null;
  const AccelIcon = accel.kind === "gpu" ? Zap : Cpu;
  const desc = describeAccelerator(accel);

  const retry = () => {
    for (const id of ALL_MODEL_IDS) if (snapshot[id].state === "error") retryModel(id);
    preloadAllModels();
  };
  const pct = Math.round(summary.progress * 100);

  if (compact) {
    return (
      <p role="status" aria-live="polite" className={clsx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", summary.state === "error" ? "bg-danger-bg text-danger" : "bg-page text-ink-2", className)}>
        {summary.state === "loading" && <Loader2 className="size-3.5 animate-spin text-brand" aria-hidden />}
        {summary.state === "ready" && <CheckCircle2 className="size-3.5 text-brand" aria-hidden />}
        {summary.state === "error" && <AlertCircle className="size-3.5" aria-hidden />}
        {summary.state === "loading" ? (
          <span className="tabular">Engine {pct}%</span>
        ) : summary.state === "ready" ? (
          desc ? `Ready, ${desc.short}` : "Ready"
        ) : (
          <button type="button" onClick={retry} className="font-semibold underline">
            Retry engine
          </button>
        )}
      </p>
    );
  }

  return (
    <div role="status" aria-live="polite" className={clsx("rounded-lg px-3 py-2.5 text-xs", dark ? "bg-white/[0.05] text-white/80" : "border border-line bg-card text-ink", className)}>
      <div className="flex items-center gap-2">
        {summary.state === "loading" && <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden />}
        {summary.state === "ready" && <span className="size-2 shrink-0 rounded-full bg-brand shadow-[0_0_0_3px_rgba(32,199,133,0.2)]" aria-hidden />}
        {summary.state === "error" && <AlertCircle className="size-3.5 shrink-0 text-danger" aria-hidden />}
        <span className="flex-1 font-medium">
          {summary.state === "loading" ? "Loading detection model" : summary.state === "ready" ? "Detection engine ready" : "Engine didn’t load"}
        </span>
        {summary.state === "loading" && <span className="font-semibold tabular">{pct}%</span>}
        {summary.state === "error" && (
          <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
            <RefreshCw className="size-3" aria-hidden /> Retry
          </button>
        )}
      </div>
      {desc && summary.state !== "error" && (
        <div className={clsx("mt-1.5 pl-[18px] text-[11px] leading-snug", dark ? "text-white/55" : "text-ink-2")}>
          <p className="flex items-start gap-1.5">
            <AccelIcon className={clsx("mt-px size-3 shrink-0", accel.kind === "gpu" ? "text-brand" : "")} aria-hidden />
            <span>{desc.long}</span>
          </p>
          {desc.hint && <p className={clsx("mt-1", dark ? "text-white/40" : "text-ink-2/80")}>{desc.hint}</p>}
        </div>
      )}
      {summary.state === "loading" && (
        <div className={clsx("mt-2 h-1 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-line-soft")}>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
