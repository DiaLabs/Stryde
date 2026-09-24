"use client";

import clsx from "clsx";
import { Crosshair, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Notice, QualityBadge } from "@/components/ui/primitives";
import { applyHomography, inv3 } from "@/lib/analysis/homography";
import { computeCalibration } from "@/lib/analysis/pipeline";
import { PITCH_LANDMARKS, PITCH_LENGTH, PITCH_WIDTH, pitchLineSegments } from "@/lib/analysis/pitch";
import { formatClock } from "@/lib/format";
import { nearestSample, type RenderIndex } from "@/lib/render";
import type { AnalysisResult, CalibrationPoint } from "@/lib/types";
import { seekTo, waitForEvent } from "@/lib/video";
import { usePlayback } from "./playback";

const SEGMENTS = pitchLineSegments();

export function CalibrationPanel({
  src,
  result,
  index,
  onApply,
}: {
  src: string;
  result: AnalysisResult;
  index: RenderIndex;
  onApply: (cal: { points: CalibrationPoint[]; referenceFrameIndex: number } | null) => void;
}) {
  const { time } = usePlayback();
  const existing = result.calibration.method === "homography" ? result.calibration : null;
  const [refFrame, setRefFrame] = useState<{ frameIndex: number; t: number } | null>(
    existing?.referenceFrameIndex !== undefined ? { frameIndex: existing.referenceFrameIndex, t: existing.referenceTimestamp ?? 0 } : null
  );
  const [points, setPoints] = useState<CalibrationPoint[]>(existing?.points ?? []);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const aspect = result.video.width / result.video.height;

  const solved = useMemo(() => (points.length >= 4 ? computeCalibration(points) : null), [points]);

  const grab = useCallback(
    async (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      setLoading(true);
      try {
        if (v.readyState < 2) await waitForEvent(v, "loadeddata", 15000);
        await seekTo(v, t);
        const off = document.createElement("canvas");
        off.width = v.videoWidth;
        off.height = v.videoHeight;
        off.getContext("2d")!.drawImage(v, 0, 0);
        frameRef.current = off;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const frame = frameRef.current;
    if (!c) return;
    const cssW = c.clientWidth;
    const cssH = cssW / aspect;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07131D";
    ctx.fillRect(0, 0, cssW, cssH);
    if (frame) ctx.drawImage(frame, 0, 0, cssW, cssH);
    // projected pitch lines
    if (solved?.H) {
      const inv = inv3(solved.H);
      if (inv) {
        ctx.strokeStyle = "rgba(0,229,255,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of SEGMENTS) {
          const steps = 6;
          let started = false;
          for (let k = 0; k <= steps; k++) {
            const px = x1 + ((x2 - x1) * k) / steps;
            const py = y1 + ((y2 - y1) * k) / steps;
            const q = applyHomography(inv, px, py);
            if (!q || q.x < -1 || q.x > 2 || q.y < -1 || q.y > 2) {
              started = false;
              continue;
            }
            if (!started) ctx.moveTo(q.x * cssW, q.y * cssH);
            else ctx.lineTo(q.x * cssW, q.y * cssH);
            started = true;
          }
        }
        ctx.stroke();
      }
    }
    points.forEach((p, i) => {
      ctx.fillStyle = "#20C785";
      ctx.strokeStyle = "#07131D";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.imageX * cssW, p.imageY * cssH, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(String(i + 1), p.imageX * cssW + 8, p.imageY * cssH - 8);
    });
    if (pending) {
      ctx.strokeStyle = "#FFD400";
      ctx.lineWidth = 2;
      const x = pending.x * cssW;
      const y = pending.y * cssH;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
  }, [aspect, points, pending, solved]);

  useEffect(() => {
    if (refFrame) void grab(refFrame.t).then(redraw);
  }, [refFrame, grab, redraw]);

  useEffect(() => {
    redraw();
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(redraw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  const useCurrent = () => {
    const { i } = nearestSample(index, time);
    if (i < 0) return;
    const f = index.frames[i];
    setRefFrame({ frameIndex: f.frameIndex, t: f.timestampSeconds });
    setPoints([]);
    setPending(null);
  };

  const usedLandmarks = new Set(points.map((p) => p.landmarkId));
  const pitchW = 360;
  const pitchS = pitchW / (PITCH_LENGTH + 6);

  return (
    <div className="space-y-4">
      <video ref={videoRef} src={src} muted playsInline preload="auto" className="hidden" />
      <Notice tone="info" title="Map the camera view to the pitch">
        Pick a frame where several pitch markings are visible (penalty box corners, halfway line, centre circle). Click a point on the frame, then click the
        matching landmark on the pitch diagram. Four or more well-spread pairs are needed. Calibration enables pitch-accurate heatmaps, meters, speeds,
        goal-directed shots and goal estimates. It is pan-compensated but zooms and cuts limit how much of the clip it covers.
      </Notice>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={useCurrent} variant="secondary">
          <Crosshair className="size-4" /> Use current video frame ({formatClock(time, true)})
        </Button>
        {refFrame && <span className="text-sm text-ink-2">Reference frame at {formatClock(refFrame.t, true)}</span>}
        {existing && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            Active calibration <QualityBadge quality={existing.quality} label={`${existing.quality} quality`} />
          </span>
        )}
      </div>

      {refFrame ? (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className={clsx("block w-full cursor-crosshair rounded-lg", loading && "opacity-60")}
              style={{ aspectRatio: `${aspect}` }}
              aria-label="Reference frame. Click to place an image point."
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPending({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
              }}
            />
            <p className="mt-1 text-xs text-ink-2">
              {pending ? "Now click the matching landmark on the pitch diagram." : "Click a clearly visible pitch marking on the frame."} Cyan lines show the
              fitted pitch once four pairs exist.
            </p>
          </div>
          <div className="space-y-3">
            <svg
              viewBox={`0 0 ${pitchW} ${(PITCH_WIDTH + 6) * pitchS}`}
              className="w-full rounded-lg bg-[#17804b]"
              role="group"
              aria-label="Pitch landmarks"
            >
              <g transform={`translate(${3 * pitchS},${3 * pitchS})`}>
                {SEGMENTS.map(([x1, y1, x2, y2], i) => (
                  <line key={i} x1={x1 * pitchS} y1={y1 * pitchS} x2={x2 * pitchS} y2={y2 * pitchS} stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                ))}
                {PITCH_LANDMARKS.map((l) => {
                  const used = usedLandmarks.has(l.id);
                  return (
                    <g key={l.id}>
                      <circle
                        cx={l.x * pitchS}
                        cy={l.y * pitchS}
                        r={6}
                        tabIndex={pending && !used ? 0 : -1}
                        role="button"
                        aria-label={l.label}
                        aria-disabled={!pending || used}
                        className={clsx(pending && !used ? "cursor-pointer" : "cursor-not-allowed")}
                        fill={used ? "#20C785" : pending ? "#FFD400" : "rgba(255,255,255,0.55)"}
                        stroke="#07131D"
                        strokeWidth="1.5"
                        onClick={() => {
                          if (!pending || used) return;
                          setPoints((ps) => [...ps, { imageX: pending.x, imageY: pending.y, pitchX: l.x, pitchY: l.y, landmarkId: l.id }]);
                          setPending(null);
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && pending && !used) {
                            e.preventDefault();
                            setPoints((ps) => [...ps, { imageX: pending.x, imageY: pending.y, pitchX: l.x, pitchY: l.y, landmarkId: l.id }]);
                            setPending(null);
                          }
                        }}
                      >
                        <title>{l.label}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>
            </svg>
            <ol className="space-y-1 text-sm">
              {points.map((p, i) => (
                <li key={p.landmarkId} className="flex items-center gap-2 rounded-md border border-line px-2 py-1">
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-xs font-bold text-navy-950">{i + 1}</span>
                  <span className="flex-1 truncate">{PITCH_LANDMARKS.find((l) => l.id === p.landmarkId)?.label}</span>
                  <button className="rounded p-1 text-ink-2 hover:bg-page hover:text-danger" aria-label="Remove point" onClick={() => setPoints((ps) => ps.filter((_, k) => k !== i))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ol>
            {solved && !solved.H && <Notice tone="warn">{solved.message}</Notice>}
            {solved?.H && (
              <p className="text-sm text-ink-2">
                Mean landmark error: <b className="text-ink">{solved.errorMeters.toFixed(2)} m</b>{" "}
                {solved.errorMeters > 3 ? "— high; check point placement." : solved.errorMeters > 1.5 ? "— acceptable." : "— good fit."}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!solved?.H} onClick={() => refFrame && onApply({ points, referenceFrameIndex: refFrame.frameIndex })}>
                Apply calibration
              </Button>
              <Button variant="secondary" disabled={!points.length} onClick={() => setPoints((ps) => ps.slice(0, -1))}>
                <Undo2 className="size-4" /> Undo
              </Button>
              {existing && (
                <Button
                  variant="danger"
                  onClick={() => {
                    onApply(null);
                    setPoints([]);
                  }}
                >
                  Remove calibration
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-2">Seek the video to a frame with visible pitch markings, then choose “Use current video frame”.</p>
      )}
    </div>
  );
}
