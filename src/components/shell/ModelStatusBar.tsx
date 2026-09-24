"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getModelCacheSnapshot,
  modelCacheSummary,
  preloadAllModels,
  retryModel,
  subscribeModelCache,
} from "@/lib/models/cache";
import { ALL_MODEL_IDS, type ModelId } from "@/lib/models/registry";

export function ModelStatusBar() {
  const snapshot = useSyncExternalStore(subscribeModelCache, getModelCacheSnapshot, getModelCacheSnapshot);
  const summary = modelCacheSummary();

  if (summary.state === "idle") {
    return (
      <div className="sticky top-14 z-30 border-b border-line bg-page px-4 py-2 text-sm lg:top-0" role="status" aria-live="polite">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <p className="font-medium">Preparing analysis engine…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "sticky top-14 z-30 border-b px-4 py-2 text-sm lg:top-0",
        summary.state === "ready" && "border-brand/30 bg-brand-soft/50 text-[#11704a]",
        summary.state === "loading" && "border-line bg-page text-ink",
        summary.state === "error" && "border-red-200 bg-red-50 text-red-900"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {summary.state === "loading" && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
        {summary.state === "ready" && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
        {summary.state === "error" && <AlertCircle className="size-4 shrink-0" aria-hidden />}

        <div className="min-w-0 flex-1">
          <p className="font-medium">{summary.label}</p>
          {summary.state === "loading" && (
            <p className="text-xs text-ink-2">One-time setup for this browser — saved locally for 30 days.</p>
          )}
          {summary.state === "ready" && (
            <p className="text-xs text-ink-2">Everything is loaded — upload a match clip whenever you’re ready.</p>
          )}
          {summary.state === "error" && (
            <p className="text-xs">Check your connection and try again, or reload the page.</p>
          )}
        </div>

        {summary.state === "loading" && (
          <span className="shrink-0 tabular-nums text-xs font-semibold">{Math.round(summary.progress * 100)}%</span>
        )}

        {summary.state === "error" && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-red-100"
            onClick={() => {
              for (const id of ALL_MODEL_IDS) {
                if (snapshot[id].state === "error") retryModel(id as ModelId);
              }
              preloadAllModels();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
