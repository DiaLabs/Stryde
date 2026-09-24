import type { BoundingBox, LabColor } from "../types";
import { isGrass, rgbToLab } from "./color";

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

/**
 * Robust jersey color for a player box: torso region, grass pixels removed,
 * channel-wise median in Lab. Returns null when too few usable pixels.
 */
export function jerseyColor(img: RgbaImage, box: BoundingBox): LabColor | null {
  const x0 = Math.floor((box.x + box.width * 0.22) * img.width);
  const x1 = Math.ceil((box.x + box.width * 0.78) * img.width);
  const y0 = Math.floor((box.y + box.height * 0.16) * img.height);
  const y1 = Math.ceil((box.y + box.height * 0.5) * img.height);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return null;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400)));
  const Ls: number[] = [];
  const As: number[] = [];
  const Bs: number[] = [];
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y += step) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x += step) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (isGrass(r, g, b)) continue;
      const lab = rgbToLab(r, g, b);
      Ls.push(lab[0]);
      As.push(lab[1]);
      Bs.push(lab[2]);
    }
  }
  if (Ls.length < 6) return null;
  return [median(Ls), median(As), median(Bs)];
}

/** Fraction of grass pixels in a region (normalized coordinates). */
export function grassFraction(
  img: RgbaImage,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): number {
  const x0 = Math.max(0, Math.floor((cx - halfW) * img.width));
  const x1 = Math.min(img.width - 1, Math.ceil((cx + halfW) * img.width));
  const y0 = Math.max(0, Math.floor((cy - halfH) * img.height));
  const y1 = Math.min(img.height - 1, Math.ceil((cy + halfH) * img.height));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 200)));
  let grass = 0;
  let total = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const i = (y * img.width + x) * 4;
      if (isGrass(img.data[i], img.data[i + 1], img.data[i + 2])) grass++;
      total++;
    }
  }
  return total ? grass / total : 0;
}
