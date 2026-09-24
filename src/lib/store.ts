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

const coordinators = new Map<string, AnalysisCoordinator>();

export function getCoordinator(id: string) {
  return coordinators.get(id);
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
      if (!m || coordinators.has(id)) return;

      patch(id, {
        error: undefined,
        raw: undefined,
        result: undefined,
        session: {
          ...m.session,
          status: "loading",
          stage: "Loading detection model…",
          stageIndex: 0,
          progress: 0.01,
          startedAt: Date.now(),
          warnings: [],
        },
      });

      void (async () => {
        try {
          const gpu = await detectWebGpu();
          const modelId = modelIdForMode(m.config.mode, gpu);
          const modelBuffer = await ensureModel(modelId);

          if (coordinators.has(id)) return;
          const current = get().matches[id];
          if (!current) return;

          const coord = new AnalysisCoordinator(id, current.file, current.meta, current.config, {
            onProgress: (session, preview) => patch(id, preview ? { session, lastRecord: preview.record } : { session }),
            onComplete: (raw) => {
              setTimeout(() => {
                try {
                  const live = get().matches[id];
                  const result = buildResult(raw, live?.overrides ?? {});
                  patch(id, (mm) => ({
                    raw,
                    result,
                    session: {
                      ...mm.session,
                      status: "complete",
                      progress: 1,
                      stage: "Complete",
                      stageIndex: 5,
                      completedAt: Date.now(),
                    },
                  }));
                } catch (e) {
                  patch(id, (mm) => ({
                    error: {
                      code: "analytics_failed",
                      message: `Analytics could not be computed: ${String((e as Error).message ?? e)}`,
                      recoverable: true,
                      suggestedAction: "Retry the analysis; if it fails again try Faster mode.",
                    },
                    session: { ...mm.session, status: "failed" },
                  }));
                }
                coordinators.delete(id);
              }, 50);
            },
            onError: (error) => {
              patch(id, { error, session: { ...get().matches[id]!.session, status: "failed" } });
              coordinators.delete(id);
            },
          });
          coordinators.set(id, coord);
          await coord.start(modelBuffer);
        } catch (e) {
          patch(id, {
            error: {
              code: "model_load",
              message: `The detection model could not be loaded: ${String((e as Error).message ?? e)}`,
              recoverable: true,
              suggestedAction: "Check your connection, wait for the model bar at the top to finish, then retry.",
            },
            session: { ...get().matches[id]!.session, status: "failed" },
          });
        }
      })();
    },

    retryAnalysis(id, configPatch) {
      const m = get().matches[id];
      if (!m || coordinators.has(id)) return;
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
      const c = coordinators.get(id);
      if (c) {
        void c.cancel();
        coordinators.delete(id);
      }
    },

    stopEarly(id) {
      coordinators.get(id)?.stopEarly();
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
