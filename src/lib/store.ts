"use client";

import { create } from "zustand";
import { AnalysisCoordinator, detectWebGpu } from "./analysis/coordinator";
import { buildResult, type AnalysisOverrides, type RawAnalysis } from "./analysis/pipeline";
import { ensureModel } from "./models/cache";
import { modelIdForMode } from "./models/registry";
import type { AnalysisError, AnalysisResult, AnalysisSession, MatchConfig, VideoMetadata, WorkerFrameRecord } from "./types";

export interface MatchEntry {
  id: string;
  createdAt: number;
  file: File;
  /** object URL for playback; revoked when the entry is removed */
  url: string;
  meta: VideoMetadata;
  thumbnail?: string;
  config: MatchConfig;
  session: AnalysisSession;
  lastRecord?: WorkerFrameRecord;
  raw?: RawAnalysis;
  result?: AnalysisResult;
  overrides: AnalysisOverrides;
  error?: AnalysisError;
  inputWarnings: string[];
}

interface StoreState {
  matches: Record<string, MatchEntry>;
  order: string[];
  createMatch: (file: File, meta: VideoMetadata, config: MatchConfig, thumbnail: string | undefined, inputWarnings: string[]) => string;
  startAnalysis: (id: string) => void;
  retryAnalysis: (id: string, configPatch?: Partial<MatchConfig>) => void;
  cancelAnalysis: (id: string) => void;
  stopEarly: (id: string) => void;
  applyOverrides: (id: string, patch: Partial<AnalysisOverrides>) => void;
  renameTeams: (id: string, teamAName: string, teamBName: string) => void;
  removeMatch: (id: string) => void;
}

/**
 * One entry per running analysis. A run is registered synchronously when it starts (before the
 * model download), so cancel works at every stage; every async continuation checks that its run
 * is still the current one before touching the store.
 */
interface Run {
  aborted: boolean;
  coordinator?: AnalysisCoordinator;
}
const runs = new Map<string, Run>();
const previewCanvases = new Map<string, HTMLCanvasElement>();

export function getCoordinator(id: string) {
  return runs.get(id)?.coordinator;
}

export function isAnalysisRunning(id: string) {
  return runs.has(id);
}

/** Attach a canvas that receives live frames while `id` is being analyzed. Returns a detach fn. */
export function attachPreviewCanvas(id: string, canvas: HTMLCanvasElement): () => void {
  previewCanvases.set(id, canvas);
  return () => {
    if (previewCanvases.get(id) === canvas) previewCanvases.delete(id);
  };
}

function isAnalysisError(e: unknown): e is AnalysisError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

function randomId(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const useStryde = create<StoreState>((set, get) => {
  const patch = (id: string, p: Partial<MatchEntry> | ((m: MatchEntry) => Partial<MatchEntry>)) =>
    set((s) => {
      const m = s.matches[id];
      if (!m) return s;
      const next = typeof p === "function" ? p(m) : p;
      return { matches: { ...s.matches, [id]: { ...m, ...next } } };
    });

  return {
    matches: {},
    order: [],

    createMatch(file, meta, config, thumbnail, inputWarnings) {
      const id = randomId();
      const entry: MatchEntry = {
        id,
        createdAt: Date.now(),
        file,
        url: URL.createObjectURL(file),
        meta,
        thumbnail,
        config,
        session: { sessionId: id, status: "idle", mode: config.mode, progress: 0, warnings: [] },
        overrides: {},
        inputWarnings,
      };
      set((s) => ({ matches: { ...s.matches, [id]: entry }, order: [id, ...s.order] }));
      return id;
    },

    startAnalysis(id) {
      const m = get().matches[id];
      if (!m || runs.has(id)) return;
      const run: Run = { aborted: false };
      runs.set(id, run);
      const live = () => !run.aborted && runs.get(id) === run;
      const finish = () => {
        if (runs.get(id) === run) runs.delete(id);
      };

      patch(id, {
        error: undefined,
        raw: undefined,
        result: undefined,
        session: {
          ...m.session,
          status: "loading",
          stage: "Loading analysis engine",
          stageIndex: 0,
          progress: 0.01,
          startedAt: Date.now(),
          warnings: [],
        },
      });

      void (async () => {
        try {
          const gpu = await detectWebGpu();
          if (!live()) return;
          const modelBuffer = await ensureModel(modelIdForMode(m.config.mode, gpu && m.config.device !== "cpu"));
          if (!live()) return;
          const current = get().matches[id];
          if (!current) return finish();

          const coord = new AnalysisCoordinator(id, current.file, current.meta, current.config, {
            getPreviewCanvas: () => previewCanvases.get(id) ?? null,
            onProgress: (session, preview) => {
              if (!live()) return;
              patch(id, preview ? { session, lastRecord: preview.record } : { session });
            },
            onComplete: (raw) => {
              // yield a frame so the "rendering" stage paints before the synchronous build
              setTimeout(() => {
                if (!live()) return;
                try {
                  const result = buildResult(raw, get().matches[id]?.overrides ?? {});
                  patch(id, (mm) => ({
                    raw,
                    result,
                    session: { ...mm.session, status: "complete", progress: 1, stage: "Complete", stageIndex: 5, completedAt: Date.now() },
                  }));
                } catch (e) {
                  patch(id, (mm) => ({
                    error: {
                      code: "analytics_failed",
                      message: `Analytics could not be computed: ${e instanceof Error ? e.message : String(e)}`,
                      recoverable: true,
                      suggestedAction: "Retry the analysis; if it fails again try Faster mode.",
                    },
                    session: { ...mm.session, status: "failed" },
                  }));
                }
                finish();
              }, 50);
            },
            onError: (error) => {
              if (!live()) return;
              patch(id, (mm) => ({ error, session: { ...mm.session, status: "failed" } }));
              finish();
            },
          });
          run.coordinator = coord;
          await coord.start(modelBuffer);
        } catch (e) {
          if (!live()) return;
          const error: AnalysisError = isAnalysisError(e)
            ? e
            : {
                code: "model_load",
                message: `The analysis engine could not be loaded${e instanceof Error ? `: ${e.message}` : "."}`,
                recoverable: true,
                suggestedAction: "Check your connection, wait for the engine status to finish loading, then retry.",
              };
          patch(id, (mm) => ({ error, session: { ...mm.session, status: "failed" } }));
          finish();
        }
      })();
    },

    retryAnalysis(id, configPatch) {
      const m = get().matches[id];
      if (!m || runs.has(id)) return;
      const config = { ...m.config, ...configPatch };
      patch(id, {
        config,
        error: undefined,
        raw: undefined,
        result: undefined,
        lastRecord: undefined,
        session: { sessionId: id, status: "idle", mode: config.mode, progress: 0, warnings: [] },
      });
      get().startAnalysis(id);
    },

    cancelAnalysis(id) {
      const run = runs.get(id);
      if (!run) return;
      run.aborted = true;
      runs.delete(id);
      void run.coordinator?.cancel();
      patch(id, (mm) => ({ session: { ...mm.session, status: "cancelled", stage: undefined } }));
    },

    stopEarly(id) {
      runs.get(id)?.coordinator?.stopEarly();
    },

    applyOverrides(id, p) {
      const m = get().matches[id];
      if (!m) return;
      const overrides = { ...m.overrides, ...p };
      const result = m.raw ? buildResult(m.raw, overrides) : undefined;
      patch(id, { overrides, result });
    },

    renameTeams(id, teamAName, teamBName) {
      const m = get().matches[id];
      if (!m) return;
      const config = { ...m.config, teamAName, teamBName };
      const raw = m.raw ? { ...m.raw, config: { ...m.raw.config, teamAName, teamBName } } : undefined;
      const result = raw ? buildResult(raw, m.overrides) : undefined;
      patch(id, { config, raw, result });
    },

    removeMatch(id) {
      const m = get().matches[id];
      if (!m) return;
      get().cancelAnalysis(id);
      URL.revokeObjectURL(m.url);
      set((s) => {
        const matches = { ...s.matches };
        delete matches[id];
        return { matches, order: s.order.filter((x) => x !== id) };
      });
    },
  };
});

export function hasActiveResults(): boolean {
  const s = useStryde.getState();
  return s.order.length > 0;
}

// Development only: the accuracy scorecard (scripts/scorecard) reads results from here. Never in
// production builds.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __stryde?: typeof useStryde }).__stryde = useStryde;
}
