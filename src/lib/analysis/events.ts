import type { BallObservation, FrameSummary, MatchEvent, ObjectTrack, PossessionSample, QualityLevel, TeamId, WorkerFrameRecord } from "../types";
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH, PITCH_WIDTH } from "./pitch";

export const EVENT_PARAMS = {
  maxGap: 0.45,
  calibratedShotSpeed: 14, // m/s
  calibratedMaxGoalDistance: 36, // m
  calibratedMaxAngle: (24 * Math.PI) / 180,
  imageShotSpeed: 0.92, // frame-widths per second (camera stabilized)
  minSegmentsCalibrated: 2,
  minSegmentsImage: 3,
  minTravelImage: 0.055,
  maxTurn: (28 * Math.PI) / 180,
  maxPlayerProximity: 0.038,
  /** goal-mouth shots (goal visible in the picture): distances to the goal box in goal heights */
  mouthMinApproach: 0.8,
  mouthMinSpeed: 3, // goal heights per second
  mouthEndDistance: 1.5, // the run ends within this distance of the goal box (or inside it)
  mouthEnterApproach: 0.3, // ...or enters the goal mouth, from at least this far
  mouthEnterSpeed: 1.5,
  mouthMaxGap: 0.65, // seconds between the two ball positions of a run
  goalConfirmSeconds: 1.5,
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

/** True when the ball sits at a player's feet — usually a pass or touch, not a shot. */
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
  frames: WorkerFrameRecord[] = [],
  tracks: ObjectTrack[] = []
): EventAnalysis {
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
    return s.speed >= EVENT_PARAMS.imageShotSpeed && s.speed < 3.5;
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

    if (group.length >= need && !(nearPlayer && !cal) && (cal || travelImage >= EVENT_PARAMS.minTravelImage)) {
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
        : Math.min(0.55, 0.18 + 0.07 * group.length + 0.22 * avgConf + speedBonus - (nearPlayer ? 0.12 : 0));
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

  const goalSeen = frames.some((f) => f.goal);
  if (!calibrated && goalSeen) id = goalMouthEvents(ball, summaries, frames, possession, aspect, events, id, tracks);
  events.sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  const shots: QualityLevel = calibrated ? "medium" : ball.length >= 12 || goalSeen || events.length > 0 ? "low" : "unavailable";
  const goals: QualityLevel = calibrated || goalSeen ? "low" : "unavailable";
  if (!calibrated) {
    notes.push(
      goalSeen
        ? "Shots are estimated from the ball moving into the goal mouth seen in the picture, or from fast ball movement; possible goals from the ball staying in the goal. Check them on the video."
        : "Shots are estimated from fast ball movement in the camera view; long passes can look similar. No goal was seen in the picture, so goals can't be estimated."
    );
  }
  return { events, shots, goals, notes };
}

type Goal = NonNullable<WorkerFrameRecord["goal"]>;

/**
 * Shots and possible goals when a goal is in the picture (no calibration needed). Positions are
 * measured relative to the detected goal mouth, in goal widths, so a camera zooming in on the
 * attack doesn't change them. A shot: the chosen ball moves quickly toward the mouth and ends in
 * it or right in front of it. A possible goal: after that the ball is seen inside the mouth at
 * least twice within goalConfirmSeconds and never back out in front of it.
 */
function goalMouthEvents(
  ball: BallObservation[],
  summaries: FrameSummary[],
  frames: WorkerFrameRecord[],
  possession: PossessionSample[],
  aspect: number,
  events: MatchEvent[],
  id: number,
  tracks: ObjectTrack[]
): number {
  const P = EVENT_PARAMS;
  /**
   * The shooter's team: the player whose feet are nearest the ball when the shot starts (or
   * just before). Possession smoothing lags behind a quick counter-attack, so it is only the
   * fallback.
   */
  const shooterTeam = (o: BallObservation): TeamId => {
    let best: { team: TeamId; d: number } | null = null;
    for (const t of tracks) {
      if (t.objectType !== "player" || (t.teamId !== "team_a" && t.teamId !== "team_b")) continue;
      for (const ob of t.observations) {
        const dt = o.timestampSeconds - ob.timestampSeconds;
        if (dt < -0.05 || dt > 0.45) continue;
        const h = Math.max(0.02, ob.box.height);
        const d = Math.hypot(o.x - (ob.box.x + ob.box.width / 2), (o.y - (ob.box.y + ob.box.height)) * 0.9) / h + dt;
        if (d <= 1.2 && (!best || d < best.d)) best = { team: t.teamId, d };
      }
    }
    return best?.team ?? possessionTeamBefore(o.timestampSeconds, possession);
  };
  const byIndex = new Map(frames.map((f) => [f.frameIndex, f]));
  const camera = new Map(summaries.map((s) => [s.frameIndex, s]));
  /** position of observation `o` as it would appear in frame `fi` (camera pan compensated) */
  const inFrame = (o: BallObservation, fi: number) => {
    const so = camera.get(o.frameIndex);
    const sf = camera.get(fi);
    return so && sf ? { x: o.x + so.cameraX - sf.cameraX, y: o.y + so.cameraY - sf.cameraY } : { x: o.x, y: o.y };
  };
  // camera shot number of each frame: a goal box never carries across a cut
  const shotOf = new Map<number, number>();
  let shotNo = 0;
  for (const s of summaries) {
    if (s.sceneCut) shotNo++;
    shotOf.set(s.frameIndex, shotNo);
  }
  /** goal box for a frame: its own, or the nearest within 0.25 s in the same camera shot */
  const goalAt = (fi: number): Goal | null => {
    const own = byIndex.get(fi)?.goal;
    if (own) return own;
    const t = byIndex.get(fi)?.timestampSeconds ?? 0;
    let best: WorkerFrameRecord | null = null;
    let bestDt = 0.25 + 1e-6;
    for (const f of frames) {
      if (!f.goal || shotOf.get(f.frameIndex) !== shotOf.get(fi)) continue;
      const dt = Math.abs(f.timestampSeconds - t);
      if (dt < bestDt) {
        bestDt = dt;
        best = f;
      }
    }
    if (!best?.goal) return null;
    // a borrowed box is in its own frame's coordinates: shift it by the camera pan in between
    const sb = camera.get(best.frameIndex);
    const sf = camera.get(fi);
    if (!sb || !sf) return best.goal;
    const g = best.goal;
    return { ...g, box: { ...g.box, x: g.box.x + sb.cameraX - sf.cameraX, y: g.box.y + sb.cameraY - sf.cameraY } };
  };
  const inMouth = (o: { x: number; y: number }, g: Goal) => {
    const b = g.box;
    // a ball on the goal line has its centre just in front of it, and the box edge is only
    // accurate to about 1% of the frame: allow 4% below the line
    return o.x >= b.x - 0.01 && o.x <= b.x + b.width + 0.01 && o.y >= b.y - 0.02 && o.y <= b.y + b.height + 0.04;
  };
  /**
   * Distance from the goal box, in goal heights (crossbar to goal line). The height stays fully
   * visible when the goal is cut by the frame edge, unlike the width.
   */
  const toGoal = (o: { x: number; y: number }, g: Goal) => {
    const b = g.box;
    const dx = Math.max(b.x - o.x, 0, o.x - (b.x + b.width));
    const dy = Math.max(b.y - o.y, 0, o.y - (b.y + b.height)) / aspect;
    return Math.hypot(dx, dy) / Math.max(1e-3, b.height / aspect);
  };

  let blockedUntil = -Infinity;
  for (let k = 1; k < ball.length; k++) {
    const a = ball[k - 1];
    const b = ball[k];
    if (b.timestampSeconds < blockedUntil) continue;
    const dt = b.timestampSeconds - a.timestampSeconds;
    if (dt <= 0 || dt > P.mouthMaxGap || shotOf.get(a.frameIndex) !== shotOf.get(b.frameIndex)) continue;
    // both positions against one goal box (the later frame's), the earlier one shifted by the
    // camera pan in between: a goal box seen whole in one frame and as a sliver in the next
    // must not look like the ball approaching
    const gb = goalAt(b.frameIndex);
    if (!gb) continue;
    const aInB = inFrame(a, b.frameIndex);
    if (inMouth(aInB, gb)) continue;
    const da = toGoal(aInB, gb);
    const db = toGoal(b, gb);
    const endsIn = inMouth(b, gb);
    if (!(endsIn || db <= P.mouthEndDistance)) continue;
    // entering the goal mouth from close range is a shot even over a short distance
    const minApproach = endsIn ? P.mouthEnterApproach : P.mouthMinApproach;
    const minSpeed = endsIn ? P.mouthEnterSpeed : P.mouthMinSpeed;
    if (da - db < minApproach || (da - db) / dt < minSpeed) continue;
    // a one-frame blip (a false ball in the goal) is not a shot: the ball must not jump straight
    // back to where it came from
    const next = ball[k + 1];
    if (next && next.timestampSeconds - b.timestampSeconds <= P.mouthMaxGap && shotOf.get(next.frameIndex) === shotOf.get(b.frameIndex)) {
      if (toGoal(inFrame(next, b.frameIndex), gb) > (da + db) / 2) continue;
    }

    const team = shooterTeam(a);
    const traj: MatchEvent["trajectory"] = [a, b].map((o) => ({ t: o.timestampSeconds, x: o.x, y: o.y }));
    // keep only one shot per attack: drop the fast-movement shot this one duplicates
    for (let e = events.length - 1; e >= 0; e--) {
      const ev = events[e];
      if (ev.type === "shot" && Math.abs(ev.timestampSeconds - a.timestampSeconds) <= 1.5) events.splice(e, 1);
    }
    events.push({
      eventId: `shot-${id++}`,
      type: "shot",
      timestampSeconds: a.timestampSeconds,
      endTimestampSeconds: b.timestampSeconds,
      teamId: team,
      confidence: Math.min(0.75, 0.45 + 0.15 * Math.min(1, (da - db) / dt / 4) + (endsIn ? 0.1 : 0)),
      quality: "low",
      description: endsIn ? "Ball moved quickly into the goal mouth seen in the picture." : "Ball moved quickly toward the goal mouth seen in the picture.",
      trajectory: traj,
    });

    // possible goal: seen inside the mouth again and never back out in front of it
    let inside = endsIn ? 1 : 0;
    let outside = 0;
    let enter = endsIn ? b : null;
    for (let m = k + 1; m < ball.length; m++) {
      const o = ball[m];
      if (o.timestampSeconds - b.timestampSeconds > P.goalConfirmSeconds || shotOf.get(o.frameIndex) !== shotOf.get(b.frameIndex)) break;
      const g = goalAt(o.frameIndex);
      if (!g) continue;
      if (inMouth(o, g)) {
        inside++;
        enter ??= o;
      } else if (toGoal(o, g) <= 1.0) outside++;
    }
    if (enter && inside >= 2 && outside === 0) {
      events.push({
        eventId: `goal-${id++}`,
        type: "goal",
        timestampSeconds: enter.timestampSeconds,
        teamId: team,
        confidence: 0.45,
        quality: "low",
        description: "Possible goal: after the shot the ball stayed in the goal mouth seen in the picture. Check it on the video.",
        trajectory: traj,
      });
    }
    blockedUntil = b.timestampSeconds + 2;
  }
  return id;
}
