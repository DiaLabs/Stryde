import { Activity, ArrowRight, Crosshair, Eye, Lock, Map, ShieldAlert, Users, Video } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { HeroVisual } from "@/components/landing/HeroVisual";

const features = [
  { icon: Video, title: "Annotated playback", text: "Player boxes, team labels, ball indicator, possession highlight, trails and a broadcast-style HUD over your own footage." },
  { icon: Users, title: "Automatic team grouping", text: "Players are grouped by jersey color. Review and correct the colors at any time; ambiguous players stay Unknown." },
  { icon: Activity, title: "Estimated possession", text: "Ball proximity plus temporal reasoning estimates which team has the ball — with unknown moments shown, not hidden." },
  { icon: Map, title: "Synchronized pitch", text: "Occupancy and movement heatmaps, zones and team shape on a 2D pitch that follows the video time." },
  { icon: Crosshair, title: "Shot & goal estimates", text: "Best-effort shot attempts with trajectories and possible goals, always labeled with confidence." },
  { icon: Lock, title: "Private by design", text: "Everything runs in your browser. The video is never uploaded and results vanish when you close the tab." },
];

export default function Landing() {
  return (
    <div className="bg-navy-950 text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-2 text-sm sm:gap-6">
          <a href="#features" className="hidden text-white/75 hover:text-white sm:inline">
            Features
          </a>
          <a href="#how" className="hidden text-white/75 hover:text-white sm:inline">
            How it works
          </a>
          <Link href="/app/help" className="hidden text-white/75 hover:text-white sm:inline">
            Limitations
          </Link>
          <Link href="/app/analyze" className="rounded-lg bg-brand px-4 py-2 font-semibold text-navy-950 hover:bg-brand-hover">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(32,199,133,0.18),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
              <span className="size-1.5 rounded-full bg-brand" /> Football video analytics in the browser
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Turn match footage into <span className="text-brand">team insights</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/75">
              Upload a short soccer clip and Stryde tracks the players, groups them into teams, estimates possession and maps movement onto a 2D pitch —
              all analyzed locally on your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app/analyze" className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 font-semibold text-navy-950 hover:bg-brand-hover">
                Analyze a match <ArrowRight className="size-4" />
              </Link>
              <Link href="/app" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 font-semibold hover:bg-white/10">
                Open workspace
              </Link>
            </div>
            <ul className="mt-10 grid max-w-xl grid-cols-3 gap-4 text-sm">
              {[
                ["No upload", "Video stays on device"],
                ["No account", "Open and analyze"],
                ["Honest output", "Confidence on every estimate"],
              ].map(([a, b]) => (
                <li key={a} className="border-l-2 border-brand/70 pl-3">
                  <p className="font-bold">{a}</p>
                  <p className="text-white/60">{b}</p>
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="features" className="bg-page text-ink">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight">Everything centered on the video</h2>
          <p className="mt-2 max-w-2xl text-ink-2">Analytics support the footage instead of replacing it. Team-level insights only — no player identities, rankings or profiles.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-line bg-card p-6">
                <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-[#11704a]">
                  <f.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="bg-card text-ink">
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
                <Eye className="mt-0.5 size-4 shrink-0 text-brand" /> Coverage and confidence indicators on every result.
              </li>
              <li className="flex gap-2">
                <Map className="mt-0.5 size-4 shrink-0 text-brand" /> Tactical views from the camera angle — relative patterns, not GPS.
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

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-white/60 sm:px-8">
          <Logo />
          <p>Stryde by DiaLabs · Football (soccer) only · Results are estimates</p>
        </div>
      </footer>
    </div>
  );
}
