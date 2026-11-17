import type { BoundingBox } from "../types";
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
  /** 1 = ignore this pixel (inside a player box) */
  mask: Uint8Array;
  /** coarse layout: mean brightness and edge density on a 4x4 grid (for cut detection) */
  layout: number[];
}

/** Layout change above which consecutive frames are a camera cut, whatever the alignment says. */
// With box-averaged thumbnails the demo3 close-up-to-wide cut scores 0.085 and the largest
// pan between real frames 0.047 (demo1), the soft dissolve in demo3 0.057.
export const LAYOUT_CUT = 0.07;

function layoutOf(gray: Float32Array, grad: Float32Array, W: number, H: number): number[] {
  const G = 4;
  const out: number[] = [];
  for (const arr of [gray, grad]) {
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        let s = 0;
        let n = 0;
        for (let y = Math.floor((gy * H) / G); y < Math.floor(((gy + 1) * H) / G); y++) {
          for (let x = Math.floor((gx * W) / G); x < Math.floor(((gx + 1) * W) / G); x++) {
            s += arr[y * W + x];
            n++;
          }
        }
        out.push(n ? s / n : 0);
      }
    }
  }
  return out;
}

/**
 * Thumbnail of a frame for camera-motion estimation. Pixels are box-averaged (point sampling
 * aliases fine pitch texture), and pixels inside `people` boxes are masked out: players move on
 * their own and pulled the estimate (measured against ffmpeg vidstab on the demo clips, masking
 * them halved the worst drift on two clips).
 */
export function makeThumb(img: RgbaImage, people: BoundingBox[] = []): Thumb {
  const W = THUMB_W;
  const H = THUMB_H;
  const gray = new Float32Array(W * H);
  const sx = img.width / W;
  const sy = img.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
          n++;
        }
      }
      gray[y * W + x] = sum / n / 255;
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
  const mask = new Uint8Array(W * H);
  // only players at normal on-pitch size: in a close-up the boxes cover most of the picture
  for (const b of people.filter((p) => p.height <= 0.3)) {
    const bx0 = Math.max(0, Math.floor((b.x - b.width * 0.2) * W));
    const bx1 = Math.min(W - 1, Math.ceil((b.x + b.width * 1.2) * W));
    const by0 = Math.max(0, Math.floor((b.y - b.height * 0.1) * H));
    const by1 = Math.min(H - 1, Math.ceil((b.y + b.height * 1.1) * H));
    for (let y = by0; y <= by1; y++) mask.fill(1, y * W + bx0, y * W + bx1 + 1);
  }
  // a crowded frame would leave too little to match: fall back to the whole picture
  let masked = 0;
  for (let i = 0; i < mask.length; i++) masked += mask[i];
  if (masked > mask.length * 0.45) mask.fill(0);
  return { gray, grad, mask, width: W, height: H, layout: layoutOf(gray, grad, W, H) };
}

/** Mean absolute difference of curr(x, y) and prev(x - dx, y - dy), skipping masked pixels. */
function sad(curr: Thumb, prev: Thumb, a: Float32Array, b: Float32Array, dx: number, dy: number, step: number, margin: number): number {
  const W = curr.width;
  const H = curr.height;
  let sum = 0;
  let n = 0;
  for (let y = margin; y < H - margin; y += step) {
    const py = y - dy;
    if (py < 0 || py >= H) continue;
    for (let x = margin; x < W - margin; x += step) {
      const px = x - dx;
      if (px < 0 || px >= W) continue;
      if (curr.mask[y * W + x] || prev.mask[py * W + px]) continue;
      sum += Math.abs(a[y * W + x] - b[py * W + px]);
      n++;
    }
  }
  // too little unmasked overlap to compare (e.g. a crowded close-up)
  return n > 20 ? sum / n : Infinity;
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
      const c = sad(curr, prev, curr.grad, prev.grad, dx, dy, 3, margin);
      if (c < best.cost) best = { dx, dy, cost: c };
    }
  }
  // refine at full resolution around the coarse winner (all costs at one sampling step: the
  // coarse cost was sampled more sparsely and is not comparable)
  const coarse = best;
  best = { dx: coarse.dx, dy: coarse.dy, cost: sad(curr, prev, curr.grad, prev.grad, coarse.dx, coarse.dy, 1, margin) };
  for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy++) {
    for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx++) {
      const c = sad(curr, prev, curr.grad, prev.grad, dx, dy, 1, margin);
      if (c < best.cost) best = { dx, dy, cost: c };
    }
  }
  // Sub-pixel: a parabola through the cost at ±1 px on each axis. Without it a slow pan (under
  // half a thumbnail pixel per sample) reads as no motion and players drift across the pitch view.
  const subpixel = (cm: number, c0: number, cp: number) => {
    const d = cm - 2 * c0 + cp;
    if (!Number.isFinite(d) || d <= 1e-9) return 0;
    return Math.max(-0.5, Math.min(0.5, (cm - cp) / (2 * d)));
  };
  const fx = subpixel(sad(curr, prev, curr.grad, prev.grad, best.dx - 1, best.dy, 1, margin), best.cost, sad(curr, prev, curr.grad, prev.grad, best.dx + 1, best.dy, 1, margin));
  const fy = subpixel(sad(curr, prev, curr.grad, prev.grad, best.dx, best.dy - 1, 1, margin), best.cost, sad(curr, prev, curr.grad, prev.grad, best.dx, best.dy + 1, 1, margin));
  const grayResidual = sad(curr, prev, curr.gray, prev.gray, best.dx, best.dy, 2, margin);
  // A cut from a close-up to a wide shot can align well enough (both mostly grass) to pass the
  // residual test; the picture's layout (crowd band, grass, players) still changes completely.
  let layoutChange = 0;
  for (let i = 0; i < curr.layout.length; i++) layoutChange += Math.abs(curr.layout[i] - prev.layout[i]);
  layoutChange /= Math.max(1, curr.layout.length);
  const sceneCut = grayResidual > 0.16 || Math.abs(best.dx) >= R - 1 || layoutChange > LAYOUT_CUT;
  return {
    dx: sceneCut ? 0 : (best.dx + fx) / W,
    dy: sceneCut ? 0 : (best.dy + fy) / H,
    sceneCut,
    residual: grayResidual,
  };
}
