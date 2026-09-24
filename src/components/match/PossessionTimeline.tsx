"use client";

import { useMemo } from "react";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { usePlayback } from "./playback";

/**
 * Possession strip (who has the ball over time, unknown shown hatched) plus a
 * rolling-share line chart. Clicking seeks the video.
 */
export function PossessionTimeline({ result, height = 120 }: { result: AnalysisResult; height?: number }) {
  const { time, seek } = usePlayback();
  const duration = result.video.durationSeconds;
  const { teamAColor, teamBColor, teamAName, teamBName } = result.teams;
  const tl = result.possessionTimeline;

  const segments = useMemo(() => {
    const segs: { t0: number; t1: number; team: string; conf: number }[] = [];
    const interval = 1 / result.coverage.sampleFps;
    tl.forEach((s, i) => {
      const t1 = i < tl.length - 1 ? Math.min(tl[i + 1].timestampSeconds, s.timestampSeconds + interval * 2.5) : s.timestampSeconds + interval;
      const last = segs[segs.length - 1];
      if (last && last.team === s.teamId && Math.abs(last.t1 - s.timestampSeconds) < 1e-6) {
        last.t1 = t1;
        last.conf = Math.max(last.conf, s.confidence);
      } else segs.push({ t0: s.timestampSeconds, t1, team: s.teamId, conf: s.confidence });
    });
    return segs;
  }, [tl, result.coverage.sampleFps]);

  // rolling 8 s share of team A among known samples
  const line = useMemo(() => {
    const pts: { t: number; v: number | null }[] = [];
    const W = 8;
    let j0 = 0;
    for (let i = 0; i < tl.length; i++) {
      const t = tl[i].timestampSeconds;
      while (tl[j0].timestampSeconds < t - W / 2) j0++;
      let a = 0;
      let n = 0;
      for (let j = j0; j < tl.length && tl[j].timestampSeconds <= t + W / 2; j++) {
        if (tl[j].teamId === "team_a") a++;
        if (tl[j].teamId !== "unknown") n++;
      }
      pts.push({ t, v: n >= 3 ? a / n : null });
    }
    return pts;
  }, [tl]);

  const W = 1000;
  const H = height;
  const stripH = 18;
  const chartTop = stripH + 12;
  const chartH = H - chartTop - 16;
  const x = (t: number) => (t / (duration || 1)) * W;
  const path = (() => {
    let d = "";
    let pen = false;
    for (const p of line) {
      if (p.v === null) {
        pen = false;
        continue;
      }
      const X = x(p.t).toFixed(1);
      const Y = (chartTop + (1 - p.v) * chartH).toFixed(1);
      d += pen ? `L${X},${Y}` : `M${X},${Y}`;
      pen = true;
    }
    return d;
  })();

  const known = tl.filter((s) => s.teamId !== "unknown").length;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-auto w-full cursor-pointer"
        style={{ height }}
        role="img"
        aria-label={`Possession timeline. ${known} of ${tl.length} analyzed samples have an estimated team; the rest are unknown.`}
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          seek(((e.clientX - r.left) / r.width) * duration);
        }}
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#EEF1F3" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#CBD3D9" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={stripH} fill="url(#hatch)" rx="3" />
        {segments.map((s, i) =>
          s.team === "unknown" ? null : (
            <rect
              key={i}
              x={x(s.t0)}
              y={0}
              width={Math.max(1, x(s.t1) - x(s.t0))}
              height={stripH}
              fill={s.team === "team_a" ? teamAColor : teamBColor}
              opacity={0.45 + 0.55 * Math.min(1, s.conf * 1.4)}
            />
          )
        )}
        {[0.5].map((v) => (
          <line key={v} x1={0} x2={W} y1={chartTop + v * chartH} y2={chartTop + v * chartH} stroke="#DDE3E7" strokeDasharray="4 4" />
        ))}
        <rect x="0" y={chartTop} width={W} height={chartH} fill="none" stroke="#DDE3E7" />
        <path d={path} fill="none" stroke={teamAColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {result.events.map((e) => (
          <line
            key={e.eventId}
            x1={x(e.timestampSeconds)}
            x2={x(e.timestampSeconds)}
            y1={chartTop}
            y2={chartTop + chartH}
            stroke={e.type === "goal" ? "#20C785" : "#E0A800"}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={x(time)} x2={x(time)} y1={0} y2={H - 14} stroke="#17232D" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span>0:00</span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: teamAColor }} /> {teamAName}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: teamBColor }} /> {teamBName}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm border border-line bg-[repeating-linear-gradient(45deg,#EEF1F3_0_3px,#CBD3D9_3px_5px)]" /> Unknown
          </span>
          <span>Line: {teamAName} share, rolling 8 s</span>
        </span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}
