import type { BoundingBox, LabColor } from "../types";
import { deltaE } from "./color";
import { iou } from "./yolo";

/**
 * Lightweight ByteTrack-style association tracker tuned for sparse frame sampling:
 * two-stage matching (high then low confidence), camera-motion compensated
 * constant-velocity prediction, distance + IoU + jersey-color cost.
 */

export interface TrackerInput {
  box: BoundingBox;
  confidence: number;
  color: LabColor | null;
}

interface InternalTrack {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: LabColor | null;
  hits: number;
  lastSeen: number;
  lastT: number;
}

export interface TrackerParams {
  highThreshold: number;
  lowThreshold: number;
  newTrackThreshold: number;
  maxLostSeconds: number;
  gate: number;
}

export const DEFAULT_TRACKER_PARAMS: TrackerParams = {
  highThreshold: 0.45,
  lowThreshold: 0.2,
  newTrackThreshold: 0.45,
  maxLostSeconds: 1.6,
  gate: 1.1,
};

export class AssociationTracker {
  private tracks: InternalTrack[] = [];
  private nextId = 1;
  constructor(private params: TrackerParams = DEFAULT_TRACKER_PARAMS) {}

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * @param cameraDx,cameraDy content displacement since previous frame (normalized)
   * @returns track id per input detection (0 = not tracked)
   */
  update(
    dets: TrackerInput[],
    t: number,
    cameraDx: number,
    cameraDy: number,
    sceneCut: boolean
  ): number[] {
    if (sceneCut) this.tracks = [];
    const ids = new Array<number>(dets.length).fill(0);

    const predicted = this.tracks.map((tr) => {
      const dt = Math.min(1, t - tr.lastT);
      return {
        tr,
        cx: tr.cx + tr.vx * dt + cameraDx,
        cy: tr.cy + tr.vy * dt + cameraDy,
      };
    });
    // camera compensation applies to stored positions too
    for (const tr of this.tracks) {
      tr.cx += cameraDx;
      tr.cy += cameraDy;
    }

    const unmatchedTracks = new Set(predicted.map((_, i) => i));
    const assign = (detIdx: number[], gate: number) => {
      const pairs: { d: number; p: number; cost: number }[] = [];
      for (const d of detIdx) {
        const det = dets[d];
        const dcx = det.box.x + det.box.width / 2;
        const dcy = det.box.y + det.box.height / 2;
        for (const p of unmatchedTracks) {
          const pr = predicted[p];
          const scale = Math.max(pr.tr.h, det.box.height, 0.02);
          const dist = Math.hypot(dcx - pr.cx, (dcy - pr.cy) * 0.8) / scale;
          if (dist > gate) continue;
          const predBox = { x: pr.cx - pr.tr.w / 2, y: pr.cy - pr.tr.h / 2, width: pr.tr.w, height: pr.tr.h };
          const ov = iou(predBox, det.box);
          const sizeRatio = Math.abs(Math.log(Math.max(1e-3, det.box.height) / Math.max(1e-3, pr.tr.h)));
          let colorCost = 0;
          if (det.color && pr.tr.color) colorCost = Math.min(1, deltaE(det.color, pr.tr.color) / 45);
          const cost = dist + 0.6 * (1 - ov) + 0.5 * sizeRatio + 0.8 * colorCost;
          pairs.push({ d, p, cost });
        }
      }
      pairs.sort((a, b) => a.cost - b.cost);
      const usedD = new Set<number>();
      for (const { d, p } of pairs) {
        if (usedD.has(d) || !unmatchedTracks.has(p)) continue;
        usedD.add(d);
        unmatchedTracks.delete(p);
        this.apply(predicted[p].tr, dets[d], t);
        ids[d] = predicted[p].tr.id;
      }
      return detIdx.filter((d) => !usedD.has(d));
    };

    const high = dets.map((_, i) => i).filter((i) => dets[i].confidence >= this.params.highThreshold);
    const low = dets
      .map((_, i) => i)
      .filter((i) => dets[i].confidence < this.params.highThreshold && dets[i].confidence >= this.params.lowThreshold);

    const unmatchedHigh = assign(high, this.params.gate);
    assign(low, this.params.gate * 0.6);

    for (const d of unmatchedHigh) {
      if (dets[d].confidence < this.params.newTrackThreshold) continue;
      const b = dets[d].box;
      const tr: InternalTrack = {
        id: this.nextId++,
        cx: b.x + b.width / 2,
        cy: b.y + b.height / 2,
        w: b.width,
        h: b.height,
        vx: 0,
        vy: 0,
        color: dets[d].color,
        hits: 1,
        lastSeen: t,
        lastT: t,
      };
      this.tracks.push(tr);
      ids[d] = tr.id;
    }

    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= this.params.maxLostSeconds);
    return ids;
  }

  private apply(tr: InternalTrack, det: TrackerInput, t: number) {
    const b = det.box;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dt = Math.max(1e-3, t - tr.lastT);
    const nvx = (cx - tr.cx) / dt;
    const nvy = (cy - tr.cy) / dt;
    const a = tr.hits > 1 ? 0.5 : 1;
    tr.vx = clampV(a * nvx + (1 - a) * tr.vx);
    tr.vy = clampV(a * nvy + (1 - a) * tr.vy);
    tr.cx = cx;
    tr.cy = cy;
    tr.w = 0.6 * b.width + 0.4 * tr.w;
    tr.h = 0.6 * b.height + 0.4 * tr.h;
    if (det.color) {
      tr.color = tr.color
        ? [
            0.8 * tr.color[0] + 0.2 * det.color[0],
            0.8 * tr.color[1] + 0.2 * det.color[1],
            0.8 * tr.color[2] + 0.2 * det.color[2],
          ]
        : det.color;
    }
    tr.hits++;
    tr.lastSeen = t;
    tr.lastT = t;
  }
}

function clampV(v: number): number {
  return Math.max(-0.5, Math.min(0.5, v));
}
