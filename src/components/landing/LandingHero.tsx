"use client";

import clsx from "clsx";
import { ArrowRight, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ballAt,
  buildCrowd,
  buildHeatmap,
  C,
  carrierIndex,
  drawBall,
  drawHeat,
  drawMinimap,
  drawPitch,
  drawPlayers,
  drawTrails,
  inRewind,
  makeCamera,
  makePlayers,
  possessionShare,
  pushTrail,
  smooth,
  stepPlayers,
} from "./heroScene";

/*
 * Landing hero, after the reference landing panel: full-bleed footage with broadcast tracking
 * graphics, headline, CTAs and a stats row. Scrolling (while the hero is pinned) walks through how
 * Stryde reads the footage: detections, teams, the 2D pitch and heatmaps.
 *
 * Scroll progress lives in the CSS custom property --p on the sticky stage. Where supported it is
 * produced natively by a scroll-driven animation on a view timeline (globals.css .hero /
 * .hero-stage); otherwise this component writes it from scroll position. Canvas and captions both
 * read the same --p.
 */

const STEPS = [
  {
    title: "Detects every player and the ball",
    body: "A YOLO model scans each sampled frame on your graphics card (WebGPU) or processor. Every person and the ball gets a box and a confidence score.",
  },
  {
    title: "Splits the teams by kit colour",
    body: "Stryde learns both kit colours from the clip and keeps a temporary track on each player. The referee is recognised and left out of team stats.",
  },
  {
    title: "Maps play onto a 2D pitch",
    body: "Camera movement is removed and positions are laid onto a top-down pitch, so runs, width and team shape are easy to read.",
  },
  {
    title: "Turns it into team insights",
    body: "Heatmaps, possession estimates, territory by thirds and side-by-side team stats, with every estimate clearly labelled.",
  },
];
const PHASES = STEPS.length + 1;

const STATS: [string, string][] = [
  ["100% local", "Analysis runs in your browser"],
  ["0 uploads", "Your video stays on your device"],
  ["11 MB", "Detection model, cached for 30 days"],
  ["5 min", "Longest clip per analysis"],
];

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function layers(p: number) {
  return {
    tracking: 1 - smooth(0.13, 0.19, p),
    boxes: smooth(0.16, 0.24, p),
    teams: smooth(0.36, 0.44, p),
    tilt: smooth(0.54, 0.74, p),
    trails: smooth(0.6, 0.75, p),
    heat: smooth(0.8, 0.88, p),
    minimap: 1 - smooth(0.5, 0.6, p),
  };
}

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const [phase, setPhase] = useState(0);
  // reduced motion: no scroll sequence, the step buttons set the phase directly
  const [manual, setManual] = useState(0);
  const manualRef = useRef(manual);
  useEffect(() => {
    manualRef.current = manual;
  }, [manual]);
  const share = useMemo(() => possessionShare(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const section = sectionRef.current;
    if (!canvas || !stage || !section) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const nativeTimeline = typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");
    const rootStyle = getComputedStyle(document.documentElement);
    const fonts = {
      ui: getComputedStyle(document.body).fontFamily,
      hud: `${rootStyle.getPropertyValue("--font-barlow").trim() || "sans-serif"}, sans-serif`,
    };
    const players = makePlayers();
    const ball = { x: 0, y: 0, z: 0 };
    const ballTrail = new Float32Array(3 * 40);
    let ballTrailLen = 0;
    const heat = buildHeatmap("a");
    const crowd = buildCrowd();

    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ro = new ResizeObserver(([entry]) => {
      w = entry.contentRect.width;
      h = entry.contentRect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    });
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "100px" });
    io.observe(section);

    const readProgress = (): number => {
      if (reduced) return (manualRef.current + 0.85) / PHASES;
      if (nativeTimeline) {
        const v = parseFloat(getComputedStyle(stage).getPropertyValue("--p"));
        if (Number.isFinite(v)) return v;
      }
      const r = section.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - window.innerHeight)));
      stage.style.setProperty("--p", String(p));
      return p;
    };

    let raf = 0;
    let last = performance.now();
    let simT = reduced ? 9.6 : 0;
    let trailClock = 0;
    let shown = -1;
    if (reduced) {
      for (let t = 0; t < simT; t += 0.12) {
        ballAt(t, ball);
        stepPlayers(players, t, ball, 0.12);
        for (const p of players) pushTrail(p);
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = readProgress();
      const ph = Math.min(PHASES - 1, Math.floor(p * PHASES));
      if (ph !== shown) {
        shown = ph;
        setPhase(ph);
      }
      if (!visible || w === 0) return;
      if (!reduced) {
        simT += dt;
        trailClock += dt;
      }
      ballAt(simT, ball);
      stepPlayers(players, simT, ball, reduced ? 0 : dt);
      if (inRewind(simT)) {
        for (const pl of players) pl.trailLen = 0;
        ballTrailLen = 0;
      } else if (trailClock >= 0.1) {
        trailClock = 0;
        for (const pl of players) pushTrail(pl);
        if (ballTrailLen === 40) ballTrail.copyWithin(0, 3);
        else ballTrailLen++;
        ballTrail.set([ball.x, ball.y, ball.z], (ballTrailLen - 1) * 3);
      }

      const L = layers(p);
      const wide = w >= 1024;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = C.navy;
      g.fillRect(0, 0, w, h);
      const cam = makeCamera(L.tilt, w, h, ball.x, wide ? 0.42 : 0);
      drawPitch(g, cam, L.tilt, crowd);
      drawHeat(g, cam, heat, L.heat);
      drawTrails(g, cam, players, L.trails * (1 - L.heat * 0.7));
      drawPlayers(g, cam, players, L, fonts, carrierIndex(players, simT, ball));
      drawBall(g, cam, ball, ballTrail, ballTrailLen, L);
      if (w >= 640) {
        const mw = Math.min(220, w * 0.18);
        drawMinimap(g, players, ball, w - mw - 32, 92, mw, L.minimap);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduced]);

  const jumpTo = (ph: number) => {
    if (reduced) {
      setManual(ph);
      return;
    }
    const section = sectionRef.current;
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const travel = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((ph + 0.6) / PHASES) * travel, behavior: "smooth" });
  };

  const current = reduced ? manual : phase;
  const step = current - 1; // -1 on the opening shot

  return (
    <section ref={sectionRef} aria-labelledby="hero-title" className={clsx("hero relative bg-navy-950 text-white", reduced ? "" : "h-[520svh]")}>
      <div ref={stageRef} className={clsx("hero-stage overflow-hidden", reduced ? "relative h-[100svh] min-h-[640px]" : "sticky top-0 h-svh min-h-[560px]")}>
        <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
        {/* legibility: navy wash from the left and from the bottom, as in the reference hero */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: current === 0 ? 1 : 0.85,
            background:
              "linear-gradient(90deg, rgba(7,19,29,0.92) 0%, rgba(7,19,29,0.72) 32%, rgba(7,19,29,0.12) 62%, rgba(7,19,29,0) 75%), linear-gradient(0deg, rgba(7,19,29,0.95) 0%, rgba(7,19,29,0) 30%), linear-gradient(180deg, rgba(7,19,29,0.7) 0%, rgba(7,19,29,0) 18%)",
          }}
        />

        <div className="relative mx-auto flex h-full max-w-[1280px] flex-col px-5 pt-24 pb-6 sm:px-8 lg:pb-10">
          {/* opening shot: headline, CTAs, stats */}
          <div className={clsx("flex flex-1 flex-col transition-opacity duration-300", current === 0 ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={current !== 0}>
            <div className="my-auto max-w-[620px] py-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                <span className="size-1.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(32,199,133,0.25)]" aria-hidden />
                Football video analysis, in your browser
              </p>
              <h1 id="hero-title" className="mt-5 text-[2.6rem] leading-[1.04] font-extrabold tracking-[-0.025em] sm:text-6xl lg:text-[4.25rem]">
                Turn match footage into game-changing insights
              </h1>
              <p className="mt-5 max-w-[520px] text-base leading-relaxed text-white/75 sm:text-lg">
                Upload a clip of your game. Get player tracking, heatmaps, possession estimates and side-by-side team stats, analyzed by AI right on your device.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/app/analyze"
                  tabIndex={current === 0 ? 0 : -1}
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-semibold text-navy-950 shadow-[0_8px_24px_-8px_rgba(32,199,133,0.6)] transition-colors hover:bg-brand-hover"
                >
                  Get started <ArrowRight className="size-4" aria-hidden />
                </Link>
                <button
                  type="button"
                  tabIndex={current === 0 ? 0 : -1}
                  onClick={() => jumpTo(1)}
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/25 bg-white/[0.04] px-5 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  <PlayCircle className="size-[18px]" aria-hidden /> See how it works
                </button>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-5 sm:grid-cols-4">
              {STATS.map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-xl font-bold tracking-tight sm:text-2xl">{v}</dd>
                  <dd className="mt-0.5 text-[13px] text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* the walkthrough captions */}
          {STEPS.map((s, i) => {
            const on = step === i;
            return (
              <div
                key={s.title}
                aria-hidden={!on}
                className={clsx(
                  "absolute inset-x-5 bottom-8 transition-all duration-300 sm:inset-x-8 lg:top-1/2 lg:right-auto lg:bottom-auto lg:w-[400px] lg:-translate-y-1/2",
                  on ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                )}
              >
                <div className="rounded-2xl border border-white/10 bg-navy-950/75 p-6 shadow-[var(--shadow-pop)] backdrop-blur-md">
                  <p className="flex items-center gap-2 text-xs font-semibold text-brand">
                    <span className="grid size-6 place-items-center rounded-full bg-brand text-[12px] font-bold text-navy-950">{i + 1}</span>
                    Step {i + 1} of {STEPS.length}
                  </p>
                  <h2 className="mt-3 text-2xl leading-tight font-bold tracking-tight sm:text-[1.75rem]">{s.title}</h2>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-white/70">{s.body}</p>
                  {i === STEPS.length - 1 && (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link href="/app/analyze" tabIndex={on ? 0 : -1} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-navy-950 hover:bg-brand-hover">
                        Analyze your match <ArrowRight className="size-4" aria-hidden />
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-white/60">
                        <span className="h-2 w-16 rounded-full bg-[linear-gradient(90deg,#2563EB,#06B6D4,#22C55E,#FACC15,#F97316,#DC2626)]" aria-hidden />
                        Blue team, time spent
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* step rail */}
          <ol
            aria-label="How it works"
            className={clsx(
              "absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 transition-opacity duration-300 lg:flex",
              current === 0 ? "pointer-events-none opacity-0" : "opacity-100",
              "bottom-6"
            )}
          >
            {Array.from({ length: PHASES }, (_, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-label={i === 0 ? "Back to the start" : `Step ${i}: ${STEPS[i - 1].title}`}
                  aria-current={current === i ? "step" : undefined}
                  className={clsx("block h-1.5 rounded-full transition-all", current === i ? "w-8 bg-brand" : "w-4 bg-white/30 hover:bg-white/60")}
                />
              </li>
            ))}
          </ol>
          {reduced && (
            <div className="absolute right-5 bottom-6 flex gap-2 sm:right-8">
              <button type="button" onClick={() => setManual((m) => Math.max(0, m - 1))} disabled={manual === 0} className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
                Previous
              </button>
              <button type="button" onClick={() => setManual((m) => Math.min(PHASES - 1, m + 1))} disabled={manual === PHASES - 1} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-navy-950 disabled:opacity-40">
                Next step
              </button>
            </div>
          )}

          {/* broadcast possession panel (ball_traj reference) */}
          <div
            className={clsx(
              "absolute right-5 bottom-36 hidden w-[250px] rounded-xl border border-white/10 bg-navy-950/75 p-4 backdrop-blur-md transition-opacity duration-300 sm:right-8 md:block",
              current === 0 ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          >
            <p className="flex items-baseline justify-between">
              <span className="font-hud text-sm font-semibold tracking-[0.12em] text-white/85">POSSESSION</span>
              <span className="text-[11px] text-white/45">This passage</span>
            </p>
            {(
              [
                ["Blue", share.a, C.a],
                ["White", share.b, C.b],
              ] as const
            ).map(([name, v, col]) => (
              <div key={name} className="mt-2.5 grid grid-cols-[48px_1fr_40px] items-center gap-2.5 text-sm">
                <span className="text-white/80">{name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: col }} />
                </span>
                <span className="font-hud text-right text-lg font-bold">{Math.round(v * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
