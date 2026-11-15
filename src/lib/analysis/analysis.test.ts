import { describe, expect, it } from "vitest";
import type { FrameSummary, ObjectTrack, PossessionSample, WorkerFrameRecord } from "../types";
import { selectBall } from "./ball";
import { stitchTracks } from "./detections";
import { estimatePossession } from "./possession";
import { classifyTracks } from "./teams";
import type { PitchMapper } from "./tracks";

const imageMapper: PitchMapper = { method: "image_space", map: () => null };

function frame(i: number, fps: number, extra: Partial<WorkerFrameRecord> = {}): WorkerFrameRecord {
  return { frameIndex: i, timestampSeconds: i / fps, players: [], balls: [], motionX: 0, motionY: 0, sceneCut: false, inferenceMs: 0, ...extra };
}
const summaries = (frames: WorkerFrameRecord[]): FrameSummary[] =>
  frames.map((f) => ({ frameIndex: f.frameIndex, timestampSeconds: f.timestampSeconds, cameraX: 0, cameraY: 0, sceneCut: f.sceneCut, calibrated: false }));
const ballBox = (x: number, y: number) => ({ x: x - 0.004, y: y - 0.007, width: 0.008, height: 0.014 });

describe("ball path", () => {
  it("keeps a weak but consistent ball over isolated stronger false positives", () => {
    const fps = 5;
    const frames = Array.from({ length: 20 }, (_, i) => {
      const truth = { box: ballBox(0.3 + i * 0.01, 0.6), confidence: 0.15, grass: 1 };
      // an occasional, somewhat stronger false positive elsewhere (a head, a sock)
      const noise = i % 5 === 2 ? [{ box: ballBox(0.75, 0.35), confidence: 0.25, grass: 1 }] : [];
      return frame(i, fps, { balls: [truth, ...noise] });
    });
    const out = selectBall(frames, summaries(frames), imageMapper, 16 / 9);
    const onTruth = out.filter((b, i) => Math.abs(b.x - (0.3 + b.frameIndex * 0.01)) < 0.005 && i >= 0);
    expect(onTruth.length).toBeGreaterThanOrEqual(18);
  });

  it("interpolates a short gap and flags it", () => {
    const fps = 5;
    const frames = Array.from({ length: 10 }, (_, i) => frame(i, fps, { balls: i === 4 || i === 5 ? [] : [{ box: ballBox(0.2 + i * 0.02, 0.5), confidence: 0.3, grass: 1 }] }));
    const out = selectBall(frames, summaries(frames), imageMapper, 16 / 9);
    const filled = out.filter((b) => b.interpolated);
    expect(filled.map((b) => b.frameIndex)).toEqual([4, 5]);
    expect(filled[0].x).toBeCloseTo(0.28, 3);
  });

  it("penalises a candidate with no grass around it (boards, stands)", () => {
    const fps = 5;
    const frames = Array.from({ length: 6 }, (_, i) => frame(i, fps, { balls: [{ box: ballBox(0.5, 0.1), confidence: 0.3, grass: 0 }] }));
    expect(selectBall(frames, summaries(frames), imageMapper, 16 / 9)).toHaveLength(0);
  });
});

describe("possession", () => {
  const track = (id: string, team: "team_a" | "team_b", x: number, frames: number): ObjectTrack => ({
    trackId: id,
    objectType: "player",
    teamId: team,
    teamConfidence: 0.9,
    status: "ended",
    observations: Array.from({ length: frames }, (_, i) => ({
      frameIndex: i,
      timestampSeconds: i / 5,
      box: { x: x - 0.01, y: 0.4, width: 0.02, height: 0.1 },
      imageCenterX: x,
      imageCenterY: 0.45,
      confidence: 0.9,
    })),
  });

  it("ignores a one-frame flicker to the other team", () => {
    const n = 30;
    const tracks = [track("A", "team_a", 0.3, n), track("B", "team_b", 0.7, n)];
    // ball at A's feet, except one frame at B's feet
    const ball = Array.from({ length: n }, (_, i) => ({
      frameIndex: i,
      timestampSeconds: i / 5,
      x: i === 15 ? 0.7 : 0.3,
      y: 0.5,
      box: ballBox(i === 15 ? 0.7 : 0.3, 0.5),
      confidence: 0.4,
    }));
    const times = Array.from({ length: n }, (_, i) => ({ frameIndex: i, t: i / 5 }));
    const out: PossessionSample[] = estimatePossession(times, tracks, ball, false, 16 / 9);
    expect(out.filter((p) => p.teamId === "team_b")).toHaveLength(0);
    expect(out.filter((p) => p.teamId === "team_a").length).toBeGreaterThan(25);
  });

  it("measures horizontal reach in the same units as vertical (16:9)", () => {
    // ball 1.5 player-heights to the side of A's feet in pixels: out of reach (max 1.1)
    const tracks = [track("A", "team_a", 0.3, 10)];
    const dx = (1.5 * 0.1) / (16 / 9);
    const ball = Array.from({ length: 10 }, (_, i) => ({ frameIndex: i, timestampSeconds: i / 5, x: 0.3 + dx, y: 0.5, box: ballBox(0.3 + dx, 0.5), confidence: 0.4 }));
    const out = estimatePossession(Array.from({ length: 10 }, (_, i) => ({ frameIndex: i, t: i / 5 })), tracks, ball, false, 16 / 9);
    expect(out.every((p) => p.teamId === "unknown")).toBe(true);
  });
});

describe("track stitching", () => {
  it("joins a player who disappears for a second and reappears nearby", () => {
    const fps = 5;
    const frames = Array.from({ length: 20 }, (_, i) => {
      const players = [];
      const box = { x: 0.4 + i * 0.002, y: 0.4, width: 0.03, height: 0.1 };
      if (i < 8) players.push({ trackId: 1, box, confidence: 0.9, color: [50, 40, 30] as [number, number, number] });
      if (i >= 13) players.push({ trackId: 2, box, confidence: 0.9, color: [52, 41, 31] as [number, number, number] });
      return frame(i, fps, { players });
    });
    const ids = new Set(stitchTracks(frames).flatMap((f) => f.players.map((p) => p.trackId)));
    expect([...ids]).toEqual([1]);
  });

  it("does not join players in different shirts", () => {
    const fps = 5;
    const frames = Array.from({ length: 20 }, (_, i) => {
      const box = { x: 0.4, y: 0.4, width: 0.03, height: 0.1 };
      const players = [];
      if (i < 8) players.push({ trackId: 1, box, confidence: 0.9, color: [90, 0, 0] as [number, number, number] });
      if (i >= 13) players.push({ trackId: 2, box, confidence: 0.9, color: [30, 40, -50] as [number, number, number] });
      return frame(i, fps, { players });
    });
    const ids = new Set(stitchTracks(frames).flatMap((f) => f.players.map((p) => p.trackId)));
    expect(ids.size).toBe(2);
  });
});

describe("team vote", () => {
  it("assigns a track by the majority of its frames even when its median colour is ambiguous", () => {
    const red: [number, number, number] = [45, 60, 40];
    const blue: [number, number, number] = [35, 10, -50];
    const colors = [...Array(7).fill(red), ...Array(3).fill(blue)];
    const t: ObjectTrack = {
      trackId: "T1",
      objectType: "player",
      status: "ended",
      jerseyColor: [41, 35, -5], // between the kits
      observationColors: colors,
      observations: colors.map((_, i) => ({ frameIndex: i, timestampSeconds: i / 5, box: { x: 0, y: 0, width: 0.02, height: 0.1 }, imageCenterX: 0, imageCenterY: 0, confidence: 0.9 })),
    };
    classifyTracks([t], { teamA: red, teamB: blue, source: "estimated", confidence: 1, spreadA: 8, spreadB: 8 });
    expect(t.teamId).toBe("team_a");
  });
});
