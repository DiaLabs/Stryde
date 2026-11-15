"use client";

import { useId, useMemo, type KeyboardEvent, type PointerEvent } from "react";
import { Magnet } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { usePlayback } from "./playback";

/** Below this confidence a possession spell is drawn hatched (estimated) rather than solid. */
const SOLID_CONFIDENCE = 0.5;

type Segment = { t0: number; t1: number; team: string; conf: number };

/** Tick step (seconds) giving at most ~6 labels: whole minutes on long clips, seconds on short ones. */
function tickStep(duration: number): number {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
  return steps.find((s) => duration / s <= 6) ?? 3600;
}

const Y_TICKS = [100, 75, 50, 25, 0];

/**
 * Reference "Possession Timeline": an area chart of Team A's rolling share of possession (0–100%),
 * Team A's area in its colour against the opponent's complement in grey, with a thin strip below
 * showing who had the ball sample by sample (unknown hatched grey, low-confidence spells hatched
 * in the team colour). The share's dashed top edge marks it as an estimate. The whole plot is a
 * slider: click, drag or use the keyboard to seek the video.
 */
export function PossessionTimeline({ result, height = 140 }: { result: AnalysisResult; height?: number }) {
  const { time, seek } = usePlayback();
  const duration = result.video.durationSeconds;
  const { teamAColor, teamBColor, teamAName, teamBName } = result.teams;
  const tl = result.possessionTimeline;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const descId = `${uid}-desc`;

  const segments = useMemo(() => {
    const segs: Segment[] = [];
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
  const plotH = Math.max(60, height);
  const stripGap = 8;
  const stripH = 8;
  const H = plotH + stripGap + stripH;
  const stripY = plotH + stripGap;
  const x = (t: number) => (t / (duration || 1)) * W;
  const pct = (t: number) => `${Math.max(0, Math.min(1, t / (duration || 1))) * 100}%`;

  // per continuous run of known samples: the share line, Team A's area beneath it, the opponent's above
  const { linePath, areaA, areaB } = useMemo(() => {
    const px = (t: number) => (t / (duration || 1)) * W;
    let lp = "";
    let aa = "";
    let ab = "";
    let run: string[] = [];
    let runX0 = 0;
    let runX1 = 0;
    const flush = () => {
      if (run.length) {
        aa += `M${runX0},${plotH}L${run.join("L")}L${runX1},${plotH}Z`;
        ab += `M${runX0},0L${run.join("L")}L${runX1},0Z`;
      }
      run = [];
    };
    for (const p of line) {
      if (p.v === null) {
        flush();
        continue;
      }
      const X = px(p.t).toFixed(1);
      const Y = ((1 - p.v) * plotH).toFixed(1);
      lp += run.length ? `L${X},${Y}` : `M${X},${Y}`;
      if (!run.length) runX0 = Number(X);
      runX1 = Number(X);
      run.push(`${X},${Y}`);
    }
    flush();
    return { linePath: lp, areaA: aa, areaB: ab };
  }, [line, duration, plotH]);

  const ticks = useMemo(() => {
    const step = tickStep(duration);
    const out: number[] = [];
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(t);
    return out;
  }, [duration]);

  const known = tl.filter((s) => s.teamId !== "unknown").length;
  const teamName = (id: string) => (id === "team_a" ? teamAName : id === "team_b" ? teamBName : null);
  const spellAt = (t: number) => segments.find((s) => t >= s.t0 && t < s.t1);
  const current = spellAt(time);
  const currentTeam = current ? teamName(current.team) : null;
  const valueText = `${formatClock(time)} of ${formatClock(duration)}. ${currentTeam ? `${currentTeam} in possession (estimated)` : "Possession unknown"}.`;

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    const big = e.shiftKey ? 5 : 1;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = time + big;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = time - big;
        break;
      case "PageUp":
        next = time + 10;
        break;
      case "PageDown":
        next = time - 10;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = duration;
        break;
      case "]": {
        // next change of possession
        const s = segments.find((sg) => sg.t0 > time + 0.05);
        next = s ? s.t0 : null;
        break;
      }
      case "[": {
        const before = segments.filter((sg) => sg.t0 < time - 0.5);
        next = before.length ? before[before.length - 1].t0 : 0;
        break;
      }
    }
    if (next === null) return;
    e.preventDefault();
    seek(Math.max(0, Math.min(duration, next)));
  };

  const hatchA = `${uid}-ha`;
  const hatchB = `${uid}-hb`;
  const hatchU = `${uid}-hu`;
  const gradA = `${uid}-ga`;
  // pale kits (white, light grey) still need a visible edge on a white card
  const edgeA = `color-mix(in srgb, ${teamAColor} 72%, var(--color-navy-950))`;

  return (
    <div className="min-w-0">
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2 sm:justify-end">
        <li className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Magnet color={teamAColor} size={9} /> {teamAName}
        </li>
        <li className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Magnet color={teamBColor} size={9} /> {teamBName}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-4 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-line-soft)_0_3px,var(--color-line)_3px_5px)]" />
          Unknown
        </li>
        {result.events.length > 0 && (
          <>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full bg-hud ring-1 ring-navy-950" />
              Possible shot
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full bg-navy-950 ring-1 ring-white" />
              Possible goal
            </li>
          </>
        )}
      </ul>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* y axis: Team A's share of known possession */}
        <div aria-hidden className="relative w-8 text-right text-[11px] text-ink-2 tabular" style={{ height: H }}>
          {Y_TICKS.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: ((100 - v) / 100) * plotH }}>
              {v}%
            </span>
          ))}
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Possession timeline, seek video"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={valueText}
          aria-describedby={descId}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
          }}
          className="relative min-w-0 cursor-pointer touch-none rounded-sm select-none"
          style={{ height: H }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full overflow-visible" aria-hidden focusable="false">
            <defs>
              <pattern id={hatchU} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" style={{ fill: "var(--color-line-soft)" }} />
                <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2" style={{ stroke: "var(--color-line)" }} />
              </pattern>
              {[
                [hatchA, teamAColor],
                [hatchB, teamBColor],
              ].map(([id, c]) => (
                <pattern key={id} id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={c} fillOpacity="0.4" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="3" />
                </pattern>
              ))}
              <linearGradient id={gradA} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: teamAColor, stopOpacity: 0.75 }} />
                <stop offset="1" style={{ stopColor: teamAColor, stopOpacity: 0.3 }} />
              </linearGradient>
            </defs>

            {/* grid */}
            {Y_TICKS.map((v) => (
              <line
                key={v}
                x1={0}
                x2={W}
                y1={((100 - v) / 100) * plotH}
                y2={((100 - v) / 100) * plotH}
                strokeWidth="1"
                strokeDasharray={v === 50 ? "4 4" : undefined}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: v === 50 ? "var(--color-line)" : "var(--color-line-soft)" }}
              />
            ))}

            {/* the opponent's complement in grey (tinted with its kit), Team A's share in its colour */}
            <path d={areaB} style={{ fill: "var(--color-line-soft)" }} />
            <path d={areaB} fill={teamBColor} fillOpacity="0.16" />
            <path d={areaA} fill={`url(#${gradA})`} />
            <path
              d={linePath}
              fill="none"
              strokeWidth="2"
              strokeDasharray="7 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: edgeA }}
            />

            {/* who had the ball, sample by sample */}
            <rect x="0" y={stripY} width={W} height={stripH} fill={`url(#${hatchU})`} />
            {segments.map((s, i) => {
              if (s.team === "unknown") return null;
              const solid = s.conf >= SOLID_CONFIDENCE;
              const color = s.team === "team_a" ? teamAColor : teamBColor;
              return (
                <rect
                  key={i}
                  x={x(s.t0)}
                  y={stripY}
                  width={Math.max(1, x(s.t1) - x(s.t0))}
                  height={stripH}
                  fill={solid ? color : `url(#${s.team === "team_a" ? hatchA : hatchB})`}
                />
              );
            })}

            {/* estimated events: dashed */}
            {result.events.map((e) => (
              <line
                key={e.eventId}
                x1={x(e.timestampSeconds)}
                x2={x(e.timestampSeconds)}
                y1={0}
                y2={H}
                strokeWidth="1.5"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                style={{ stroke: "var(--color-navy-950)", strokeOpacity: e.type === "goal" ? 0.8 : 0.45 }}
              />
            ))}

            {/* playhead */}
            <line x1={x(time)} x2={x(time)} y1={0} y2={H} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--color-ink)" }} />
          </svg>

          {/* round markers in HTML so they stay circular while the plot stretches */}
          {result.events.map((e) => (
            <span
              key={e.eventId}
              aria-hidden
              className={`pointer-events-none absolute -top-1 size-2.5 -translate-x-1/2 rounded-full ${e.type === "goal" ? "bg-navy-950 ring-1 ring-white" : "bg-hud ring-1 ring-navy-950"}`}
              style={{ left: pct(e.timestampSeconds) }}
            />
          ))}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-1.5 size-3 -translate-x-1/2 rounded-full bg-ink ring-2 ring-white"
            style={{ left: pct(time) }}
          />
        </div>

        <span aria-hidden />
        {/* x axis */}
        <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-ink-2 tabular">
          {ticks.map((t) => {
            // keep the end labels inside the plot
            const f = t / (duration || 1);
            return (
              <span
                key={t}
                className="absolute top-0 leading-none whitespace-nowrap"
                style={{ left: pct(t), transform: f < 0.04 ? undefined : f > 0.94 ? "translateX(-100%)" : "translateX(-50%)" }}
              >
                {formatClock(t)}
              </span>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-2">
        Area: {teamAName}&apos;s rolling 8 s share of possession, estimated (dashed edge). Strip: who had the ball; hatched when uncertain or unknown.
      </p>
      <p id={descId} className="sr-only">
        {known} of {tl.length} analyzed samples have an estimated team in possession; the rest are unknown. Use the arrow keys to move one second (five with
        Shift), Page Up and Page Down for ten seconds, and the bracket keys to jump between changes of possession.
      </p>
    </div>
  );
}
