import type { BallObservation, ObjectTrack, PossessionSample, TeamId } from "../types";

interface RawEvidence {
  t: number;
  team: "team_a" | "team_b" | "contested" | null;
  weight: number;
  nearestTrackId?: string;
}

export const POSSESSION_PARAMS = {
  /** max ball-to-feet distance, in player-heights (image space) */
  maxImageDistance: 1.1,
  /** max ball-to-player distance in meters (calibrated) */
  maxPitchDistance: 3,
  /** smoothing half window, seconds */
  window: 0.8,
  /** hold last team for this long without new evidence */
  hold: 1.2,
  /** minimum vote share to assign a team */
  minShare: 0.65,
  minTeamConfidence: 0.3,
};

/**
 * Team possession from ball proximity + temporal consistency.
 * Returns one sample per sampled frame; unknown when evidence is insufficient.
 */
export function estimatePossession(
  frameTimes: { frameIndex: number; t: number }[],
  tracks: ObjectTrack[],
  ball: BallObservation[],
  calibrated: boolean
): PossessionSample[] {
  // index player observations by frame
  const byFrame = new Map<number, { track: ObjectTrack; obs: ObjectTrack["observations"][number] }[]>();
  for (const track of tracks) {
    if (track.teamId !== "team_a" && track.teamId !== "team_b") continue;
    if ((track.teamConfidence ?? 0) < POSSESSION_PARAMS.minTeamConfidence) continue;
    for (const obs of track.observations) {
      let list = byFrame.get(obs.frameIndex);
      if (!list) byFrame.set(obs.frameIndex, (list = []));
      list.push({ track, obs });
    }
  }

  const evidence: RawEvidence[] = [];
  for (const b of ball) {
    const players = byFrame.get(b.frameIndex) ?? [];
    const scored = players
      .map(({ track, obs }) => {
        let d: number;
        if (calibrated && b.pitchX !== undefined && obs.pitchX !== undefined) {
          d = Math.hypot(b.pitchX - obs.pitchX, b.pitchY! - obs.pitchY!) / POSSESSION_PARAMS.maxPitchDistance;
        } else {
          const fx = obs.box.x + obs.box.width / 2;
          const fy = obs.box.y + obs.box.height;
          const h = Math.max(obs.box.height, 0.02);
          d = Math.hypot(b.x - fx, (b.y - fy) * 0.9) / h / POSSESSION_PARAMS.maxImageDistance;
        }
        return { track, d };
      })
      .filter((s) => s.d <= 1)
      .sort((a, b) => a.d - b.d);
    if (!scored.length) {
      evidence.push({ t: b.timestampSeconds, team: null, weight: 0 });
      continue;
    }
    const nearest = scored[0];
    const rival = scored.find((s) => s.track.teamId !== nearest.track.teamId);
    const contested = rival && rival.d < nearest.d * 1.25 + 0.08;
    const weight = Math.min(1, b.confidence * 2) * (1 - nearest.d * 0.6) * (nearest.track.teamConfidence ?? 0.5);
    evidence.push({
      t: b.timestampSeconds,
      team: contested ? "contested" : (nearest.track.teamId as "team_a" | "team_b"),
      weight,
      nearestTrackId: nearest.track.trackId,
    });
  }

  const samples: PossessionSample[] = [];
  let lastAssigned: { team: TeamId; t: number } | null = null;
  let ei = 0;
  for (const { frameIndex, t } of frameTimes) {
    void frameIndex;
    while (ei < evidence.length && evidence[ei].t < t - POSSESSION_PARAMS.window) ei++;
    let a = 0;
    let bVotes = 0;
    let contested = 0;
    let n = 0;
    let nearestTrackId: string | undefined;
    let nearestDt = Infinity;
    for (let j = ei; j < evidence.length && evidence[j].t <= t + POSSESSION_PARAMS.window; j++) {
      const e = evidence[j];
      if (!e.team) continue;
      const w = e.weight * (1 - Math.abs(e.t - t) / (POSSESSION_PARAMS.window * 1.5));
      if (e.team === "team_a") a += w;
      else if (e.team === "team_b") bVotes += w;
      else contested += w;
      n++;
      if (Math.abs(e.t - t) < nearestDt && e.team !== "contested") {
        nearestDt = Math.abs(e.t - t);
        nearestTrackId = e.nearestTrackId;
      }
    }
    const total = a + bVotes + contested;
    let team: TeamId = "unknown";
    let confidence = 0;
    if (total > 0) {
      const lead = Math.max(a, bVotes);
      const share = lead / total;
      if (share >= POSSESSION_PARAMS.minShare) {
        team = a >= bVotes ? "team_a" : "team_b";
        confidence = Math.min(1, share * Math.min(1, total / 1.2) * Math.min(1, n / 2));
      }
    } else if (lastAssigned && t - lastAssigned.t <= POSSESSION_PARAMS.hold && lastAssigned.team !== "unknown") {
      team = lastAssigned.team;
      confidence = 0.3 * (1 - (t - lastAssigned.t) / POSSESSION_PARAMS.hold);
    }
    if (team !== "unknown" && confidence < 0.12) team = "unknown";
    if (team !== "unknown" && total > 0) lastAssigned = { team, t };
    samples.push({
      timestampSeconds: t,
      teamId: team,
      confidence: team === "unknown" ? 0 : confidence,
      basis: team === "unknown" ? "unknown" : "proximity_temporal",
      nearestTrackId: team === "unknown" ? undefined : nearestTrackId,
    });
  }
  return samples;
}

/** Duration each sample represents (half-gap to neighbors, capped). */
export function sampleDurations(times: number[], maxGap: number): number[] {
  return times.map((t, i) => {
    const prev = i > 0 ? Math.min(maxGap, t - times[i - 1]) / 2 : 0;
    const next = i < times.length - 1 ? Math.min(maxGap, times[i + 1] - t) / 2 : 0;
    return prev + next || Math.min(maxGap, 1);
  });
}
