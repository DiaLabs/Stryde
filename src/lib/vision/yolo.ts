import type { BoundingBox } from "../types";

export const COCO_PERSON = 0;
export const COCO_SPORTS_BALL = 32;

export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  size: number;
  srcW: number;
  srcH: number;
}

export function letterboxParams(srcW: number, srcH: number, size: number): Letterbox {
  const scale = Math.min(size / srcW, size / srcH);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  return { scale, padX: Math.floor((size - w) / 2), padY: Math.floor((size - h) / 2), size, srcW, srcH };
}

/** RGBA (size×size, letterboxed) → CHW float32 normalized to 0..1 */
export function toTensorData(rgba: Uint8ClampedArray, size: number): Float32Array {
  const area = size * size;
  const out = new Float32Array(3 * area);
  for (let i = 0, p = 0; i < area; i++, p += 4) {
    out[i] = rgba[p] / 255;
    out[i + area] = rgba[p + 1] / 255;
    out[i + 2 * area] = rgba[p + 2] / 255;
  }
  return out;
}

export interface RawDetection {
  cls: number;
  score: number;
  box: BoundingBox;
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(dets: RawDetection[], iouThreshold: number, maxOut = 300): RawDetection[] {
  const sorted = dets.slice().sort((a, b) => b.score - a.score);
  const keep: RawDetection[] = [];
  for (const d of sorted) {
    if (keep.length >= maxOut) break;
    if (keep.every((k) => iou(k.box, d.box) < iouThreshold)) keep.push(d);
  }
  return keep;
}

/**
 * Decode Ultralytics YOLO (v8/11/26 one-to-many head) output [1, 4 + C, N].
 * Returns normalized boxes relative to the source frame.
 */
export function decodeYolo(
  output: Float32Array,
  dims: readonly number[],
  lb: Letterbox,
  thresholds: { player: number; ball: number },
  iouThreshold: number
): { players: RawDetection[]; balls: RawDetection[] } {
  const channels = dims[1];
  const n = dims[2];
  const players: RawDetection[] = [];
  const balls: RawDetection[] = [];
  const toBox = (i: number): BoundingBox => {
    const cx = output[i];
    const cy = output[n + i];
    const w = output[2 * n + i];
    const h = output[3 * n + i];
    const x1 = Math.max(0, (cx - w / 2 - lb.padX) / lb.scale);
    const y1 = Math.max(0, (cy - h / 2 - lb.padY) / lb.scale);
    const x2 = Math.min(lb.srcW, (cx + w / 2 - lb.padX) / lb.scale);
    const y2 = Math.min(lb.srcH, (cy + h / 2 - lb.padY) / lb.scale);
    return {
      x: x1 / lb.srcW,
      y: y1 / lb.srcH,
      width: Math.max(0, x2 - x1) / lb.srcW,
      height: Math.max(0, y2 - y1) / lb.srcH,
    };
  };
  if (channels < 4 + COCO_SPORTS_BALL + 1) throw new Error(`Unexpected detector output shape [${dims.join(",")}]`);
  const personOff = (4 + COCO_PERSON) * n;
  const ballOff = (4 + COCO_SPORTS_BALL) * n;
  for (let i = 0; i < n; i++) {
    const ps = output[personOff + i];
    if (ps >= thresholds.player) players.push({ cls: COCO_PERSON, score: ps, box: toBox(i) });
    const bs = output[ballOff + i];
    if (bs >= thresholds.ball) balls.push({ cls: COCO_SPORTS_BALL, score: bs, box: toBox(i) });
  }
  return { players: nms(players, iouThreshold), balls: nms(balls, 0.3, 10) };
}

export { iou };
