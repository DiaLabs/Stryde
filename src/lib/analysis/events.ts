import type { BallObservation, FrameSummary, MatchEvent, PossessionSample, QualityLevel, TeamId } from "../types";
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH, PITCH_WIDTH } from "./pitch";

export const EVENT_PARAMS = {
  maxGap: 0.5,
  calibratedShotSpeed: 13, // m/s
  calibratedMaxGoalDistance: 38, // m
  calibratedMaxAngle: (28 * Math.PI) / 180,
  imageShotSpeed: 0.6, // frame-widths per second (camera stabilized)
  minSegments: 2,
  maxTurn: (35 * Math.PI) / 180,
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

export interface EventAnalysis {
  events: MatchEvent[];
  shots: QualityLevel;
  goals: QualityLevel;
  notes: string[];
}

/**
 * Best-effort shot and goal candidates from sampled ball observations.
 * Calibrated footage: fast ball travel toward a goal. Image-space: sustained, rapid,
 * straight ball travel (low confidence). Goals require calibration.
 */
export function detectEvents(
  ball: BallObservation[],
  summaries: FrameSummary[],
  possession: PossessionSample[],
  calibrated: boolean,
  aspect: number,
  sampleFps: number
): EventAnalysis {
  const notes: string[] = [];
  const indexOf = new Map(summaries.map((s, i) => [s.frameIndex, i]));
  const events: MatchEvent[] = [];
  if (ball.length < 6) {
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
      const ang = Math.acos((gx * s.vx + gy * s.vy) / (dist * s.speed + 1e-9));
      return ang <= EVENT_PARAMS.calibratedMaxAngle;
    }
    return s.speed >= EVENT_PARAMS.imageShotSpeed && s.speed < 4;
  };

  // group consecutive qualifying, direction-consistent segments
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
    const need = cal ? 1 : EVENT_PARAMS.minSegments;
    if (group.length >= need) {
      const start = group[0].a;
      const end = group[group.length - 1].b;
      // trajectory: observed ball samples from shot start until a gap or 2.5 s
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
      const confidence = cal
        ? Math.min(0.8, 0.35 + 0.1 * group.length + 0.3 * avgConf)
        : Math.min(0.4, 0.12 + 0.06 * group.length + 0.2 * avgConf);
      const topSpeed = Math.max(...group.map((g) => g.speed));
      events.push({
        eventId: `shot-${id++}`,
        type: "shot",
        timestampSeconds: start.timestampSeconds,
        endTimestampSeconds: end.timestampSeconds,
        teamId: team,
        confidence,
        quality: cal ? (confidence >= 0.6 ? "medium" : "low") : "low",
        description: cal
          ? `Fast ball travel toward goal (~${topSpeed.toFixed(0)} m/s peak, calibrated).`
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
    i = j;
  }

  const shots: QualityLevel = calibrated ? "medium" : "low";
  const goals: QualityLevel = calibrated ? "low" : "unavailable";
  if (!calibrated) {
    notes.push("Shots are image-space estimates without pitch calibration; add calibration for goal-directed shot and goal estimates.");
    notes.push("Goal detection requires pitch calibration and is unavailable for this analysis.");
  } else {
    notes.push("Goals are estimated from the projected ground position of the ball; ball height and the net are not observed.");
  }
  return { events, shots, goals, notes };
}
