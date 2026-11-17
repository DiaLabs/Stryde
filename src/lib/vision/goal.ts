import type { BoundingBox } from "../types";
import { isGrass } from "./color";
import type { RgbaImage } from "./features";

/*
 * Goal-frame detector for broadcast footage, without calibration: a goal is two white posts
 * standing on the grass, joined at the top by a white crossbar. People are masked out first
 * (white kits are the main confounder), then:
 *   1. vertical white runs that reach down to the grass are post candidates,
 *   2. pairs of posts with a mostly white line between their tops are goal candidates,
 *   3. the best-scoring candidate with a plausible goal shape wins.
 * Returns the goal mouth (normalised box from crossbar to goal line) or null.
 */

export interface GoalFrame {
  box: BoundingBox;
  /** 0..1 */
  score: number;
}

const isWhite = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min > 165 && max - min < 50;
};

interface Post {
  x: number;
  top: number;
  bottom: number;
}

export function detectGoalFrame(img: RgbaImage, people: BoundingBox[]): GoalFrame | null {
  // work on a ≤ 640 px wide grid for speed
  const step = Math.max(1, Math.round(img.width / 640));
  const W = Math.floor(img.width / step);
  const H = Math.floor(img.height / step);
  const white = new Uint8Array(W * H);
  const grass = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * step * img.width + x * step) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (isWhite(r, g, b)) white[y * W + x] = 1;
      else if (isGrass(r, g, b)) grass[y * W + x] = 1;
    }
  }
  // people (white kits, the keeper) are not goal frames
  for (const p of people) {
    const x0 = Math.max(0, Math.floor((p.x - p.width * 0.15) * W));
    const x1 = Math.min(W - 1, Math.ceil((p.x + p.width * 1.15) * W));
    const y0 = Math.max(0, Math.floor((p.y - p.height * 0.1) * H));
    const y1 = Math.min(H - 1, Math.ceil((p.y + p.height * 1.05) * H));
    for (let y = y0; y <= y1; y++) white.fill(0, y * W + x0, y * W + x1 + 1);
  }

  // 1. post candidates: the longest vertical white run per column (1-pixel gaps allowed)
  //    whose bottom touches grass
  const minLen = Math.max(8, Math.round(H * 0.06));
  const cols: (Post & { len: number })[] = [];
  for (let x = 0; x < W; x++) {
    let best: { top: number; bottom: number } | null = null;
    let runStart = -1;
    let gap = 0;
    for (let y = 0; y <= H; y++) {
      const on = y < H && (white[y * W + x] || (x > 0 && white[y * W + x - 1]) || (x < W - 1 && white[y * W + x + 1]));
      if (on) {
        if (runStart < 0) runStart = y;
        gap = 0;
      } else if (runStart >= 0) {
        gap++;
        if (gap > 1 || y === H) {
          const bottom = y - gap;
          if (!best || bottom - runStart > best.bottom - best.top) best = { top: runStart, bottom };
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (!best || best.bottom - best.top < minLen) continue;
    // the post must stand on (or just behind) the pitch: grass a little below its foot, allowing
    // for the painted carpet that often sits behind the goal line
    let foot = false;
    const reach = Math.max(6, Math.round(H * 0.06));
    for (let y = best.bottom + 1; y <= Math.min(H - 1, best.bottom + reach); y++) if (grass[y * W + x]) foot = true;
    if (!foot) continue;
    cols.push({ x, top: best.top, bottom: best.bottom, len: best.bottom - best.top });
  }
  // merge neighbouring columns into posts (a post is a few pixels wide)
  const posts: Post[] = [];
  for (const c of cols) {
    const last = posts[posts.length - 1];
    if (last && c.x - last.x <= 2) {
      last.x = c.x;
      last.top = Math.min(last.top, c.top);
      last.bottom = Math.max(last.bottom, c.bottom);
    } else posts.push({ x: c.x, top: c.top, bottom: c.bottom });
  }
  if (!posts.length) return null;

  /** share of white pixels along a straight line (searched ±2 px across it) */
  const lineWhite = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.abs(x1 - x0));
    let hits = 0;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const yc = Math.round(y0 + ((y1 - y0) * k) / n);
      let on = false;
      for (let dy = -2; dy <= 2 && !on; dy++) {
        const y = yc + dy;
        if (x >= 0 && x < W && y >= 0 && y < H && white[y * W + x]) on = true;
      }
      if (on) hits++;
    }
    return hits / (n + 1);
  };

  let best: { score: number; box: BoundingBox } | null = null;
  const consider = (score: number, x0: number, x1: number, top: number, bottom: number) => {
    if (!best || score > best.score) best = { score, box: { x: x0 / W, y: top / H, width: Math.max(1, x1 - x0) / W, height: Math.max(1, bottom - top) / H } };
  };

  // 2–3. pairs of posts joined by a white crossbar, with a goal-like shape; wider pairs win
  //      (a net strand next to a post must not stand in for the far post)
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i];
      const b = posts[j];
      const span = b.x - a.x;
      const ha = a.bottom - a.top;
      const hb = b.bottom - b.top;
      const h = Math.max(ha, hb);
      if (span < h * 1.2 || span > h * 6) continue; // a goal is ~3x wider than tall
      if (Math.min(ha, hb) < h * 0.45) continue;
      if (Math.abs(a.top - b.top) > h * 0.6) continue; // tops roughly level (perspective allowed)
      const bar = lineWhite(a.x, a.top, b.x, b.top);
      if (bar < 0.55) continue;
      const score = bar * Math.min(1, h / (H * 0.12)) * Math.min(1, (ha + hb) / (2 * h)) * (0.7 + 0.3 * Math.min(1, span / (2.4 * h)));
      consider(score, a.x, b.x, Math.min(a.top, b.top), Math.max(a.bottom, b.bottom));
    }
  }

  // 4. goals cut by the frame edge: one post whose crossbar runs off the side of the picture
  //    (often steeply, when the goal is seen from the side). Only when no full goal was found.
  const pairFound = best !== null;
  for (const p of pairFound ? [] : posts) {
    const h = p.bottom - p.top;
    if (h < H * 0.1) continue;
    for (const edge of [0, W - 1]) {
      const run = Math.abs(edge - p.x);
      if (run < h * 0.6) continue;
      // the crossbar meets the post near its top (net mesh can make the run look taller)
      for (let y0 = p.top; y0 <= p.top + h * 0.2; y0 += 2) {
        for (let slope = -0.9; slope <= 0.9; slope += 0.15) {
          const yEdge = Math.round(y0 - slope * run);
          const bar = lineWhite(p.x, y0, edge, yEdge);
          if (bar < 0.7) continue;
          const score = 0.75 * bar * Math.min(1, h / (H * 0.15));
          consider(score, Math.min(p.x, edge), Math.max(p.x, edge), Math.max(0, Math.min(y0, yEdge)), p.bottom);
        }
      }
    }
  }
  const found = best as { score: number; box: BoundingBox } | null;
  return found && found.score >= 0.4 ? { box: found.box, score: Math.min(1, found.score) } : null;
}
