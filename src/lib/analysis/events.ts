import type { BallObservation, FrameSummary, MatchEvent, PossessionSample, QualityLevel, TeamId, WorkerFrameRecord } from "../types";
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH, PITCH_WIDTH } from "./pitch";

export const EVENT_PARAMS = {
  maxGap: 0.45,
  calibratedShotSpeed: 14, // m/s
  calibratedMaxGoalDistance: 36, // m
  calibratedMaxAngle: (24 * Math.PI) / 180,
  imageShotSpeed: 0.92, // frame-widths per second (camera stabilized), when player size is unknown
  /** image mode: shot speed expressed in player heights per second (~14 m/s for a 1.8 m player) */
  imageShotHeightsPerSecond: 7.8,
  imageShotSpeedFloor: 0.25,
  /** image mode: mean detector confidence of the ball positions in the run */
  minImageBallConfidence: 0.2,
  minSegmentsCalibrated: 2,
  minSegmentsImage: 3,
  minTravelImage: 0.055,
  maxTurn: (28 * Math.PI) / 180,
  maxPlayerProximity: 0.038,
};

interface Seg {
  a: BallObservation;
  b: BallObservation;
  vx: number;
  vy: number;
  speed: number;
  calibrated: boolean;
}

function possessionTeamBefore(t: number, possession: PossessionSample[]): TeamId {
  for (let i = possession.length - 1; i >= 0; i--) {
    const p = possession[i];
    if (p.timestampSeconds > t) continue;
    if (t - p.timestampSeconds > 2.5) break;
    if (p.teamId !== "unknown") return p.teamId;
  }
  return "unknown";
}

function frameByIndex(frames: WorkerFrameRecord[]): Map<number, WorkerFrameRecord> {
  return new Map(frames.map((f) => [f.frameIndex, f]));
}

/** Median player box height in a frame (fraction of frame height), or null without players. */
function medianPlayerHeight(frame: WorkerFrameRecord | undefined): number | null {
  if (!frame || frame.players.length < 3) return null;
  const hs = frame.players.map((p) => p.box.height).sort((a, b) => a - b);
  return hs[hs.length >> 1];
}

/** True when the ball sits at a player's feet: where a shot (or pass) starts. */
function ballNearPlayer(obs: BallObservation, frame: WorkerFrameRecord | undefined): boolean {
  if (!frame) return false;
  for (const p of frame.players) {
    const px = p.box.x + p.box.width / 2;
    const py = p.box.y + p.box.height * 0.88;
    if (Math.hypot(obs.x - px, obs.y - py) < EVENT_PARAMS.maxPlayerProximity) return true;
  }
  return false;
}

export interface EventAnalysis {
  events: MatchEvent[];
  shots: QualityLevel;
  goals: QualityLevel;
  notes: string[];
}

/**
 * Best-effort shot and goal candidates from sampled ball observations.
 * Calibrated footage: fast ball travel toward a goal. Image-space: sustained, rapid,
 * straight ball travel away from players (low confidence). Goals require calibration.
 */
export function detectEvents(
  ball: BallObservation[],
  summaries: FrameSummary[],
  possession: PossessionSample[],
  calibrated: boolean,
  aspect: number,
  sampleFps: number,
  frames: WorkerFrameRecord[] = []
): EventAnalysis {
  // only detected positions: interpolated ones are straight lines by construction
  ball = ball.filter((b) => !b.interpolated);
  const notes: string[] = [];
  const indexOf = new Map(summaries.map((s, i) => [s.frameIndex, i]));
  const frameMap = frameByIndex(frames);
  const events: MatchEvent[] = [];
  if (ball.length < 8) {
    notes.push("Too few ball detections to estimate shots or goals.");
    return { events, shots: "unavailable", goals: "unavailable", notes };
  }
  if (sampleFps < 4) notes.push("Low frame sampling reduces the chance of catching fast shots.");

  const segs: Seg[] = [];
  for (let i = 1; i < ball.length; i++) {
    const a = ball[i - 1];
    const b = ball[i];
    const dt = b.timestampSeconds - a.timestampSeconds;
    if (dt <= 0 || dt > EVENT_PARAMS.maxGap) continue;
    const sa = summaries[indexOf.get(a.frameIndex)!];
    const sb = summaries[indexOf.get(b.frameIndex)!];
    if (sb.sceneCut) continue;
    if (calibrated && a.pitchX !== undefined && b.pitchX !== undefined) {
      const vx = (b.pitchX - a.pitchX) / dt;
      const vy = (b.pitchY! - a.pitchY!) / dt;
      segs.push({ a, b, vx, vy, speed: Math.hypot(vx, vy), calibrated: true });
    } else {
      const vx = (b.x + sb.cameraX - (a.x + sa.cameraX)) / dt;
      const vy = (b.y + sb.cameraY - (a.y + sa.cameraY)) / aspect / dt;
      segs.push({ a, b, vx, vy, speed: Math.hypot(vx, vy), calibrated: false });
    }
  }

  const isShotSeg = (s: Seg): boolean => {
    if (s.calibrated) {
      if (s.speed < EVENT_PARAMS.calibratedShotSpeed || s.speed > 45) return false;
      const px = s.a.pitchX!;
      const py = s.a.pitchY!;
      const goalX = s.vx > 0 ? PITCH_LENGTH : 0;
      const gx = goalX - px;
      const gy = PITCH_WIDTH / 2 - py;
      const dist = Math.hypot(gx, gy);
      if (dist > EVENT_PARAMS.calibratedMaxGoalDistance) return false;
      const ang = Math.acos(Math.max(-1, Math.min(1, (gx * s.vx + gy * s.vy) / (dist * s.speed + 1e-9))));
      return ang <= EVENT_PARAMS.calibratedMaxAngle;
    }
    // scale the threshold to the players' size on screen, so it means roughly the same real
    // speed in a wide shot and a close-up
    const h = medianPlayerHeight(frameMap.get(s.a.frameIndex));
    const threshold = h ? Math.max(EVENT_PARAMS.imageShotSpeedFloor, (EVENT_PARAMS.imageShotHeightsPerSecond * h) / aspect) : EVENT_PARAMS.imageShotSpeed;
    return s.speed >= threshold && s.speed < 3.5;
  };

  let i = 0;
  let id = 1;
  while (i < segs.length) {
    if (!isShotSeg(segs[i])) {
      i++;
      continue;
    }
    const group = [segs[i]];
    let j = i + 1;
    while (j < segs.length && segs[j].a === group[group.length - 1].b && isShotSeg(segs[j])) {
      const p = group[group.length - 1];
      const turn = Math.acos(Math.max(-1, Math.min(1, (p.vx * segs[j].vx + p.vy * segs[j].vy) / (p.speed * segs[j].speed + 1e-9))));
      if (turn > EVENT_PARAMS.maxTurn) break;
      group.push(segs[j]);
      j++;
    }
    const cal = group.every((g) => g.calibrated);
    const need = cal ? EVENT_PARAMS.minSegmentsCalibrated : EVENT_PARAMS.minSegmentsImage;
    const start = group[0].a;
    const end = group[group.length - 1].b;
    const startFrame = frameMap.get(start.frameIndex);
    const nearPlayer = ballNearPlayer(start, startFrame);

    const travelImage = Math.hypot(
      end.x + summaries[indexOf.get(end.frameIndex)!].cameraX - (start.x + summaries[indexOf.get(start.frameIndex)!].cameraX),
      (end.y + summaries[indexOf.get(end.frameIndex)!].cameraY - (start.y + summaries[indexOf.get(start.frameIndex)!].cameraY)) / aspect
    );

    // Without calibration only the strongest evidence counts: the run must start with a touch
    // (ball at a player's feet) and be built from confidently detected ball positions, because
    // a wrong ball pick on empty grass easily forms a fast "run".
    const avgBallConf = group.reduce((acc, g) => acc + Math.min(g.a.confidence, g.b.confidence), 0) / group.length;
    const imageEvidence = nearPlayer && avgBallConf >= EVENT_PARAMS.minImageBallConfidence && travelImage >= EVENT_PARAMS.minTravelImage;
    if (group.length >= need && (cal || imageEvidence)) {
      const traj: MatchEvent["trajectory"] = [];
      const startIdx = ball.indexOf(start);
      for (let k = startIdx; k < ball.length; k++) {
        const o = ball[k];
        if (o.timestampSeconds - start.timestampSeconds > 2.5) break;
        if (k > startIdx && o.timestampSeconds - ball[k - 1].timestampSeconds > EVENT_PARAMS.maxGap) break;
        traj.push({ t: o.timestampSeconds, x: o.x, y: o.y, pitchX: o.pitchX, pitchY: o.pitchY });
      }
      const team = possessionTeamBefore(start.timestampSeconds, possession);
      const avgConf = group.reduce((s, g) => s + Math.min(g.a.confidence, g.b.confidence), 0) / group.length;
      const topSpeed = Math.max(...group.map((g) => g.speed));
      const speedBonus = cal ? Math.min(0.15, (topSpeed - EVENT_PARAMS.calibratedShotSpeed) / 80) : Math.min(0.1, (topSpeed - EVENT_PARAMS.imageShotSpeed) / 8);
      const confidence = cal
        ? Math.min(0.85, 0.38 + 0.08 * group.length + 0.28 * avgConf + speedBonus)
        : Math.min(0.55, 0.18 + 0.07 * group.length + 0.22 * avgConf + speedBonus + (nearPlayer ? 0.05 : 0));
      if (confidence >= (cal ? 0.42 : 0.28)) {
        events.push({
          eventId: `shot-${id++}`,
          type: "shot",
          timestampSeconds: start.timestampSeconds,
          endTimestampSeconds: end.timestampSeconds,
          teamId: team,
          confidence,
          quality: cal ? (confidence >= 0.65 ? "medium" : "low") : "low",
          description: cal
            ? `Fast ball travel toward goal (~${topSpeed.toFixed(0)} m/s peak, calibrated).`
            : nearPlayer
              ? "Rapid ball travel after a touch (image-space; may be a shot or driven pass)."
              : "Sustained rapid ball travel (image-space; could also be a long pass or clearance).",
          trajectory: traj,
        });

        if (cal) {
          const goal = traj.find(
            (p) =>
              p.pitchX !== undefined &&
              (p.pitchX <= 0.3 || p.pitchX >= PITCH_LENGTH - 0.3) &&
              p.pitchY! >= GOAL_Y_MIN - 0.3 &&
              p.pitchY! <= GOAL_Y_MAX + 0.3
          );
          if (goal) {
            events.push({
              eventId: `goal-${id++}`,
              type: "goal",
              timestampSeconds: goal.t,
              teamId: team,
              confidence: Math.min(0.6, confidence * 0.8),
              quality: "low",
              description: "Ball position projected across the goal line between the posts. Ball height is not observed.",
              trajectory: traj,
            });
          }
        }
      }
    }
    i = j;
  }

  const shots: QualityLevel = calibrated ? "medium" : ball.length >= 12 ? "low" : "unavailable";
  const goals: QualityLevel = calibrated ? "low" : "unavailable";
  if (!calibrated) {
    notes.push("Shots are estimated from fast ball movement in the camera view; long passes can look similar.");
  }
  if (!calibrated) notes.push("Goals need pitch calibration: without it the goal mouth can't be located.");
  else notes.push("Goals are estimated when a fast ball crosses the goal line between the posts; check them on the video.");
  return { events, shots, goals, notes };
}
