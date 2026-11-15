import type { BoundingBox, LabColor } from "../types";
import { grassFraction, jerseyColor, type RgbaImage } from "./features";
import type { RawDetection } from "./yolo";

/**
 * Per-frame detection features, computed where the pixels are (the worker, or the Node eval
 * harness) and shipped to the analysis pipeline. Filtering and tracking decisions are made
 * later, offline, so they can use every frame and be evaluated against recorded fixtures.
 */

export interface PersonDetection {
  box: BoundingBox;
  confidence: number;
  /** torso colour in CIE Lab, or null when the crop had too few non-grass pixels */
  color: LabColor | null;
  /** share of grass pixels in a band under the feet (0..1) */
  grass: number;
}

export interface BallCandidate {
  box: BoundingBox;
  confidence: number;
  /** share of grass pixels around the candidate (0..1) */
  grass: number;
}

export const MAX_PEOPLE = 60;
export const MAX_BALL_CANDIDATES = 8;

export function frameFeatures(decoded: { players: RawDetection[]; balls: RawDetection[] }, img: RgbaImage): { people: PersonDetection[]; balls: BallCandidate[] } {
  const people = decoded.players
    .filter((d) => d.box.height >= 0.012 && d.box.width >= 0.002)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PEOPLE)
    .map((d) => {
      const b = d.box;
      const grass = grassFraction(img, b.x + b.width / 2, b.y + b.height, Math.max(b.width, 0.01), Math.max(b.height * 0.15, 0.008));
      return { box: b, confidence: d.score, color: jerseyColor(img, b), grass };
    });

  const balls = decoded.balls
    .filter((d) => {
      const b = d.box;
      if (b.width > 0.06 || b.height > 0.08) return false;
      const ar = b.width / Math.max(1e-4, b.height);
      return ar >= 0.35 && ar <= 2.8;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_BALL_CANDIDATES)
    .map((d) => {
      const b = d.box;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const grass = grassFraction(img, cx, cy, Math.max(b.width * 2.5, 0.01), Math.max(b.height * 2.5, 0.015));
      return { box: b, confidence: d.score, grass };
    });

  return { people, balls };
}
