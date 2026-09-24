import type { AnalysisMode } from "../types";

export const ASSET_VERSION = "2";
export const MODEL_CACHE_DAYS = 30;

export type ModelId = "yolo11n" | "yolo11s";

export interface ModelSpec {
  id: ModelId;
  name: string;
  url: string;
  minBytes: number;
}

export const MODELS: Record<ModelId, ModelSpec> = {
  yolo11n: {
    id: "yolo11n",
    name: "YOLO11n",
    url: `/models/yolo11n-960.onnx?v=${ASSET_VERSION}`,
    minBytes: 1_000_000,
  },
  yolo11s: {
    id: "yolo11s",
    name: "YOLO11s",
    url: `/models/yolo11s-960.onnx?v=${ASSET_VERSION}`,
    minBytes: 5_000_000,
  },
};

export const ALL_MODEL_IDS: ModelId[] = ["yolo11n", "yolo11s"];

export function modelIdForMode(mode: AnalysisMode, hasWebGpu: boolean): ModelId {
  return mode === "detailed" && hasWebGpu ? "yolo11s" : "yolo11n";
}
