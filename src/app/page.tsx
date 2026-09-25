import { ArrowRight, Crosshair, Eye, Map, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { DetectionDemo } from "@/components/landing/DetectionDemo";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import heroBg from "../../bg.jpg";

export default function Landing() {
  return (
    <div className="bg-navy-950 text-white">
      <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 rounded-full border border-white/10 bg-navy-950/75 py-3 pr-3 pl-5 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:min-h-[4.5rem] sm:py-3.5 sm:pr-3.5 sm:pl-6">
          <Logo mark="image" />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
            <a href="#features" className="rounded-full px-4 py-2.5 text-white/75 hover:bg-white/10 hover:text-white">
              Features
            </a>
            <a href="#how" className="rounded-full px-4 py-2.5 text-white/75 hover:bg-white/10 hover:text-white">
              How it works
            </a>
            <Link href="/app/help" className="rounded-full px-4 py-2.5 text-white/75 hover:bg-white/10 hover:text-white">
              Limitations
            </Link>
          </nav>
          <Link
            href="/app/analyze"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-navy-950 hover:bg-brand-hover"
          >
            Get started
          </Link>
        </div>
      </header>

      <section className="relative flex min-h-svh items-center overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat opacity-40 blur-md"
          style={{ backgroundImage: `url(${heroBg.src})` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="relative mx-auto flex w-full max-w-[90rem] flex-col items-center justify-center gap-8 px-5 pt-28 pb-16 sm:px-8 lg:flex-row lg:gap-10">
          <div className="w-full max-w-lg">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Football analytics, right in your browser
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] font-medium tracking-tight sm:text-6xl 2xl:text-7xl">
              Every run.
              <span className="block">Every pass.</span>
              <span className="mt-1 inline-block border-b-2 border-[#7dffc6] pb-1 italic leading-none">
                <span className="bg-gradient-to-r from-brand to-[#7dffc6] bg-clip-text text-transparent">Decoded.</span>
              </span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/70 sm:text-lg">
              Drop in a match clip. Stryde spots every player, splits the teams and turns their movement into heatmaps and possession — without the video
              ever leaving your device.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/app/analyze"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-semibold text-navy-950 hover:bg-brand-hover"
              >
                Analyze a match <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/app"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 font-semibold hover:bg-white/10"
              >
                Open workspace
              </Link>
            </div>
          </div>
          <div className="relative w-full max-w-3xl shrink-0">
            <DetectionDemo />
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-28 bg-page text-ink">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight">Everything centered on the video</h2>
          <p className="mt-2 max-w-2xl text-ink-2">Analytics support the footage instead of replacing it. Team-level insights only — no player identities, rankings or profiles.</p>
          <FeatureGrid />
        </div>
      </section>

      <section id="how" className="scroll-mt-28 bg-card text-ink">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-8 space-y-6">
              {[
                ["Set up the match", "Name the teams, optionally pick jersey colors and choose Faster or More Detailed analysis."],
                ["Choose a clip", "30–60 seconds of soccer footage. Validation runs instantly and analysis starts on its own."],
                ["Browser inference", "A YOLO11 detector runs on WebGPU (or the CPU), a tracker links detections, and team, possession and event estimators run on top."],
                ["Explore the dashboard", "Play, pause, seek and slow down the annotated video while the pitch, heatmaps and stats follow along."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-950 font-bold text-brand">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="text-sm text-ink-2">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4 rounded-2xl bg-navy-950 p-8 text-white">
            <h3 className="flex items-center gap-2 text-xl font-bold">
              <ShieldAlert className="size-5 text-brand" /> Built to be honest
            </h3>
            <p className="text-white/75">
              Computer vision on ordinary footage is imperfect. Stryde labels every estimate, shows unknown periods instead of guessing, and hides metrics
              the footage cannot support.
            </p>
            <ul className="space-y-2 text-sm text-white/80">
              <li className="flex gap-2">
                <Eye className="mt-0.5 size-4 shrink-0 text-brand" /> Coverage, calibration and confidence indicators on every result.
              </li>
              <li className="flex gap-2">
                <Map className="mt-0.5 size-4 shrink-0 text-brand" /> Meters and speeds only after pitch calibration.
              </li>
              <li className="flex gap-2">
                <Crosshair className="mt-0.5 size-4 shrink-0 text-brand" /> Shots and goals are presented as possible events, never facts.
              </li>
            </ul>
            <Link href="/app/help" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
              Read the limitations <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden border-t border-line bg-[#f6f4ef] text-ink">
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[22vw] leading-none font-extrabold tracking-tight text-ink/[0.05] select-none"
        >
          STRYDE
        </p>
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_1.6fr] lg:py-20">
          <div>
            <Logo light={false} mark="image" />
            <p className="mt-3 max-w-xs text-sm text-ink-2">Football footage to team insights</p>
            <p className="mt-6 text-sm text-ink-2">Stryde by DiaLabs</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-2 uppercase">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a href="#features" className="hover:text-ink-2">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-ink-2">
                    How it works
                  </a>
                </li>
                <li>
                  <Link href="/app/help" className="hover:text-ink-2">
                    Limitations
                  </Link>
                </li>
                <li>
                  <Link href="/app/analyze" className="hover:text-ink-2">
                    Analyze a match
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-2 uppercase">App</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link href="/app" className="hover:text-ink-2">
                    Workspace
                  </Link>
                </li>
                <li>
                  <Link href="/app/analyze" className="hover:text-ink-2">
                    Get started
                  </Link>
                </li>
                <li>
                  <Link href="/app/help" className="hover:text-ink-2">
                    Help
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-2 uppercase">Notes</p>
              <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
                <li>Football (soccer) only</li>
                <li>Results are estimates</li>
                <li>Video stays on device</li>
              </ul>
            </div>
          </div>
        </div>
        <p className="relative pb-8 text-center text-xs text-ink-2">© 2026 DiaLabs. All rights reserved.</p>
      </footer>
    </div>
  );
}
