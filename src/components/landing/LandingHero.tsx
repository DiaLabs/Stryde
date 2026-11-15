import { ArrowRight, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import stadium from "../../../bg.jpg";

const STATS: [string, string][] = [
  ["100% local", "Analysis runs in your browser"],
  ["0 uploads", "Your video stays on your device"],
  ["11 MB", "Detection model, cached for 30 days"],
  ["5 min", "Longest clip per analysis"],
];

const TEAM_A = "#3B82F6";
const TEAM_B = "#F97316";

/** A preview of a finished analysis, built from the same visual language as the app (example values). */
function AnalysisPreview() {
  const rows: [string, string, string][] = [
    ["15 s", "Possession time", "11 s"],
    ["41 m", "Team width", "36 m"],
    ["29 m", "Team depth", "33 m"],
    ["5.5", "Players visible", "5.4"],
  ];
  return (
    <figure className="hero-rise relative w-full max-w-[440px] [animation-delay:240ms]">
      <div className="rounded-2xl border border-white/12 bg-navy-950/70 p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="size-2.5 rounded-full" style={{ background: TEAM_A }} aria-hidden />
            Team A
            <span className="font-normal text-white/45">vs</span>
            <span className="size-2.5 rounded-full" style={{ background: TEAM_B }} aria-hidden />
            Team B
          </p>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">Completed</span>
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between">
            <span className="font-hud text-3xl font-bold text-white">58%</span>
            <span className="pb-1 text-xs text-white/55">Possession (estimated)</span>
            <span className="font-hud text-3xl font-bold text-white/80">42%</span>
          </div>
          <div className="mt-2 flex h-2 gap-1 overflow-hidden rounded-full">
            <span className="hero-bar h-full rounded-l-full" style={{ width: "58%", background: TEAM_A }} />
            <span className="hero-bar h-full flex-1 rounded-r-full [animation-delay:120ms]" style={{ background: TEAM_B }} />
          </div>
        </div>

        <dl className="mt-5 divide-y divide-white/[0.07] border-t border-white/[0.07] text-sm">
          {rows.map(([a, label, b]) => (
            <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5">
              <dd className="font-hud text-lg font-semibold text-white">{a}</dd>
              <dt className="text-center text-xs text-white/55">{label}</dt>
              <dd className="font-hud text-right text-lg font-semibold text-white/80">{b}</dd>
            </div>
          ))}
        </dl>

        {/* occupancy heatmap on a pitch drawing (thermal scale, as in the app) */}
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <svg viewBox="0 0 105 68" className="block w-full" role="img" aria-label="Example heatmap of where Team A spent its time">
            <defs>
              <radialGradient id="hero-h1">
                <stop offset="0" stopColor="#DC2626" stopOpacity="0.85" />
                <stop offset="0.35" stopColor="#FACC15" stopOpacity="0.7" />
                <stop offset="0.7" stopColor="#22C55E" stopOpacity="0.45" />
                <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hero-h2">
                <stop offset="0" stopColor="#F97316" stopOpacity="0.75" />
                <stop offset="0.5" stopColor="#22C55E" stopOpacity="0.4" />
                <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
              </radialGradient>
              <pattern id="hero-stripes" width="15" height="68" patternUnits="userSpaceOnUse">
                <rect width="7.5" height="68" fill="#1d8f55" />
                <rect x="7.5" width="7.5" height="68" fill="#1a834e" />
              </pattern>
            </defs>
            <rect width="105" height="68" fill="url(#hero-stripes)" />
            <g className="hero-heat">
              <ellipse cx="44" cy="30" rx="22" ry="16" fill="url(#hero-h1)" />
              <ellipse cx="66" cy="46" rx="17" ry="12" fill="url(#hero-h2)" />
              <ellipse cx="30" cy="50" rx="13" ry="10" fill="url(#hero-h2)" />
            </g>
            <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.5">
              <rect x="1" y="1" width="103" height="66" />
              <line x1="52.5" y1="1" x2="52.5" y2="67" />
              <circle cx="52.5" cy="34" r="9.15" />
              <rect x="1" y="13.85" width="16.5" height="40.3" />
              <rect x="87.5" y="13.85" width="16.5" height="40.3" />
              <rect x="1" y="24.85" width="5.5" height="18.3" />
              <rect x="98.5" y="24.85" width="5.5" height="18.3" />
            </g>
          </svg>
        </div>
      </div>
      <figcaption className="mt-2 text-right text-xs text-white/45">Example analysis</figcaption>
    </figure>
  );
}

export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-navy-950 text-white">
      <Image src={stadium} alt="" fill priority sizes="100vw" placeholder="blur" className="hero-zoom -z-20 object-cover object-[center_70%]" />
      {/* navy wash so text stays legible over the floodlights */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(7,19,29,0.94) 0%, rgba(7,19,29,0.78) 38%, rgba(7,19,29,0.35) 70%, rgba(7,19,29,0.55) 100%), linear-gradient(0deg, rgba(7,19,29,1) 0%, rgba(7,19,29,0) 35%), linear-gradient(180deg, rgba(7,19,29,0.8) 0%, rgba(7,19,29,0) 25%)",
        }}
      />

      <div className="mx-auto flex min-h-[100svh] max-w-[1120px] flex-col px-5 pt-28 pb-8 sm:px-8 lg:pt-32">
        <div className="grid flex-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="max-w-[600px]">
            <h1 id="hero-title" className="hero-rise text-[2.6rem] leading-[1.04] font-extrabold tracking-[-0.025em] [animation-delay:60ms] sm:text-6xl lg:text-[4rem]">
              Turn match footage into game-changing insights
            </h1>
            <p className="hero-rise mt-5 max-w-[520px] text-base leading-relaxed text-white/75 [animation-delay:120ms] sm:text-lg">
              Upload a clip of your game. Get player tracking, heatmaps, possession estimates and side-by-side team stats, analyzed by AI right on your device.
            </p>
            <div className="hero-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:180ms]">
              <Link
                href="/app/analyze"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-semibold text-navy-950 shadow-[0_10px_30px_-10px_rgba(32,199,133,0.8)] transition-[background-color,transform] hover:-translate-y-px hover:bg-brand-hover"
              >
                Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href="#workflow"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 bg-white/[0.04] px-5 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                <PlayCircle className="size-[18px]" aria-hidden /> See how it works
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <AnalysisPreview />
          </div>
        </div>

        <dl className="hero-rise mt-12 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-6 [animation-delay:300ms] sm:grid-cols-4">
          {STATS.map(([v, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="text-xl font-bold tracking-tight sm:text-2xl">{v}</dd>
              <dd className="mt-0.5 text-[13px] text-white/60">{l}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
