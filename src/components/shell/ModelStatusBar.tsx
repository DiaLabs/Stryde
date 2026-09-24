"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getModelCacheSnapshot,
  modelCacheSummary,
  preloadAllModels,
  retryModel,
  subscribeModelCache,
} from "@/lib/models/cache";
import { ALL_MODEL_IDS, type ModelId } from "@/lib/models/registry";

const READY_DISMISS_KEY = "stryde-model-ready-dismissed";

export function ModelStatusBar() {
  const snapshot = useSyncExternalStore(subscribeModelCache, getModelCacheSnapshot, getModelCacheSnapshot);
  const summary = modelCacheSummary();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (summary.state === "ready") {
      if (sessionStorage.getItem(READY_DISMISS_KEY) === "1") setDismissed(true);
      else {
        const t = setTimeout(() => setDismissed(true), 4500);
        return () => clearTimeout(t);
      }
    } else {
      setDismissed(false);
    }
  }, [summary.state]);

  if (summary.state === "ready" && dismissed) return null;
  if (summary.state === "idle") return null;

  const dismissReady = () => {
    sessionStorage.setItem(READY_DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={clsx(
        "pointer-events-auto fixed top-3 right-3 z-50 max-w-sm rounded-lg border px-3.5 py-2.5 text-sm shadow-lg sm:top-4 sm:right-4",
        summary.state === "ready" && "border-brand/40 bg-card text-ink",
        summary.state === "loading" && "border-line bg-card text-ink",
        summary.state === "error" && "border-red-200 bg-red-50 text-red-900"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        {summary.state === "loading" && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand" aria-hidden />}
        {summary.state === "ready" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />}
        {summary.state === "error" && <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}

        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{summary.label}</p>
          {summary.state === "loading" && (
            <p className="mt-0.5 text-xs text-ink-2">One-time setup · saved for 30 days in this browser.</p>
          )}
          {summary.state === "ready" && <p className="mt-0.5 text-xs text-ink-2">Upload a match clip to get started.</p>}
          {summary.state === "error" && <p className="mt-0.5 text-xs">Check your connection and try again.</p>}
        </div>

        {summary.state === "loading" && (
          <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums">{Math.round(summary.progress * 100)}%</span>
        )}

        {summary.state === "ready" && (
          <button type="button" onClick={dismissReady} className="shrink-0 rounded p-0.5 text-ink-2 hover:bg-page hover:text-ink" aria-label="Dismiss">
            <X className="size-4" />
          </button>
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
