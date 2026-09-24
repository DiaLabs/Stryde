import type { RgbaImage } from "./features";

/**
 * Global camera-motion estimator (pan/tilt approximated as image translation).
 * Works on small gradient-magnitude thumbnails so pitch lines and boards dominate.
 */
export const THUMB_W = 192;
export const THUMB_H = 108;

export interface Thumb {
  gray: Float32Array;
  grad: Float32Array;
  width: number;
  height: number;
}

export function makeThumb(img: RgbaImage): Thumb {
  const W = THUMB_W;
  const H = THUMB_H;
  const gray = new Float32Array(W * H);
  const sx = img.width / W;
  const sy = img.height / H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = Math.min(img.width - 1, Math.floor((x + 0.5) * sx));
      const py = Math.min(img.height - 1, Math.floor((y + 0.5) * sy));
      const i = (py * img.width + px) * 4;
      gray[y * W + x] = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
    }
  }
  const grad = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx = gray[y * W + x + 1] - gray[y * W + x - 1];
      const gy = gray[(y + 1) * W + x] - gray[(y - 1) * W + x];
      grad[y * W + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 2);
    }
  }
  return { gray, grad, width: W, height: H };
}

function sad(
  a: Float32Array,
  b: Float32Array,
  W: number,
  H: number,
  dx: number,
  dy: number,
  step: number,
  margin: number
): number {
  // compare curr(x, y) against prev(x - dx, y - dy)
  let sum = 0;
  let n = 0;
  for (let y = margin; y < H - margin; y += step) {
    const py = y - dy;
    if (py < 0 || py >= H) continue;
    for (let x = margin; x < W - margin; x += step) {
      const px = x - dx;
      if (px < 0 || px >= W) continue;
      sum += Math.abs(a[y * W + x] - b[py * W + px]);
      n++;
    }
  }
  return n ? sum / n : Infinity;
}

export interface MotionEstimate {
  /** content displacement from prev to curr, normalized image units */
  dx: number;
  dy: number;
  sceneCut: boolean;
  residual: number;
}

export function estimateMotion(prev: Thumb, curr: Thumb): MotionEstimate {
  const W = curr.width;
  const H = curr.height;
  const R = 24;
  const RY = 10;
  const margin = 12;
  let best = { dx: 0, dy: 0, cost: Infinity };
  // coarse search
  for (let dy = -RY; dy <= RY; dy += 2) {
    for (let dx = -R; dx <= R; dx += 2) {
      const c = sad(curr.grad, prev.grad, W, H, dx, dy, 3, margin);
      if (c < best.cost) best = { dx, dy, cost: c };
    }
  }
  // refine
  const coarse = best;
  for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy++) {
    for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx++) {
      const c = sad(curr.grad, prev.grad, W, H, dx, dy, 1, margin);
      if (c < best.cost || (dx === coarse.dx && dy === coarse.dy)) {
        if (c <= best.cost) best = { dx, dy, cost: c };
      }
    }
  }
  const grayResidual = sad(curr.gray, prev.gray, W, H, best.dx, best.dy, 2, margin);
  const sceneCut = grayResidual > 0.16 || Math.abs(best.dx) >= R - 1;
  return {
    dx: sceneCut ? 0 : best.dx / W,
    dy: sceneCut ? 0 : best.dy / H,
    sceneCut,
    residual: grayResidual,
  };
}
