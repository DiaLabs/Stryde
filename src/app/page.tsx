import { Activity, ArrowRight, Crosshair, Flame, Lock, PieChart, Shirt, Upload, Video } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LandingHero } from "@/components/landing/LandingHero";
import { MirrorBar } from "@/components/ui/primitives";

const BLUE = "#3B82F6";
const ORANGE = "#F97316";

const FEATURES = [
  { icon: Crosshair, title: "Player and ball tracking", body: "Every player and the ball detected frame by frame, with temporary track IDs while they stay in view." },
  { icon: Shirt, title: "Teams split by kit", body: "Kit colours are learned from the clip automatically. Correct them in one click if the light plays tricks." },
  { icon: PieChart, title: "Possession estimates", body: "Who had the ball, when and for how long, with a timeline you can scrub and every estimate labelled." },
  { icon: Flame, title: "Heatmaps and territory", body: "Where each team played: occupancy heatmaps, movement, team shape and time spent in each third." },
  { icon: Video, title: "Annotated playback", body: "Watch the clip with team-coloured tracking, ball trail and a live scorebug layered on top." },
  { icon: Lock, title: "Private by design", body: "The video is read from your device and analyzed in the browser. Nothing is uploaded, no account needed." },
];

function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-navy-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label="Stryde home" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Page" className="hidden md:block">
          <ul className="flex gap-1 text-sm text-white/70">
            <li>
              <a href="#features" className="rounded-md px-3 py-2 hover:text-white">
                Features
              </a>
            </li>
            <li>
              <a href="#workflow" className="rounded-md px-3 py-2 hover:text-white">
                How it works
              </a>
            </li>
            <li>
              <Link href="/app/help" className="rounded-md px-3 py-2 hover:text-white">
                Help
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/app" className="hidden h-9 items-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10 sm:inline-flex">
            Open app
          </Link>
          <Link href="/app/analyze" className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-navy-950 hover:bg-brand-hover">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function StepCard({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-card)]">
      <span className="grid size-8 place-items-center rounded-full bg-navy-950 text-sm font-bold text-white">{n}</span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
      <div className="mt-6 flex-1 rounded-xl border border-line-soft bg-page p-4">{children}</div>
    </li>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-page">
      <a href="#main" className="sr-only z-50 rounded-lg bg-brand px-3 py-2 font-semibold text-navy-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <LandingHero />

        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[1280px] scroll-mt-20 px-5 py-20 sm:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-deep">What you get</p>
            <h2 id="features-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Everything you need to read a match
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-2">Team-level analysis from a single clip: how each side moved, where they played and who controlled the ball.</p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-card)]">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-deep">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-20 border-y border-line bg-card/60">
          <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-8 lg:py-28">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-deep">How it works</p>
              <h2 id="workflow-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                From clip to insights in three steps
              </h2>
            </div>
            <ol className="mt-12 grid gap-4 lg:grid-cols-3">
              <StepCard n={1} title="Upload your clip" body="Drop in an MP4, MOV or WebM from a phone, club camera or broadcast. Name the teams if you like.">
                <div className="grid place-items-center rounded-lg border-2 border-dashed border-line py-6 text-center">
                  <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand-deep">
                    <Upload className="size-4" aria-hidden />
                  </span>
                  <p className="mt-2 text-xs font-medium text-ink">Drag and drop your video</p>
                  <p className="text-[11px] text-ink-2">MP4, MOV, WebM up to 5 minutes</p>
                </div>
              </StepCard>
              <StepCard n={2} title="Let it analyze" body="Detection, tracking and team assignment run in your browser. You see a live preview while it works.">
                <ul className="space-y-2.5 text-xs">
                  {[
                    ["Detecting players and ball", 1],
                    ["Tracking and assigning teams", 0.64],
                    ["Calculating team analytics", 0],
                  ].map(([label, v]) => (
                    <li key={label as string}>
                      <div className="flex items-center justify-between text-ink">
                        <span>{label}</span>
                        <span className="text-ink-2 tabular">{v === 1 ? "Done" : v === 0 ? "Pending" : `${Math.round((v as number) * 100)}%`}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-line-soft">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(v as number) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </StepCard>
              <StepCard n={3} title="Review the match" body="Annotated playback, team stats side by side, a synced 2D pitch with heatmaps and a possession timeline.">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: BLUE }} aria-hidden />
                    Blue
                  </span>
                  <span className="flex items-center gap-1.5">
                    White
                    <span className="size-2 rounded-full" style={{ background: ORANGE }} aria-hidden />
                  </span>
                </div>
                <MirrorBar label="Possession" a={58} b={42} max={100} unit="%" colorA={BLUE} colorB={ORANGE} estimated />
                <MirrorBar label="Team width" a={41} b={36} unit="m" colorA={BLUE} colorB={ORANGE} />
                <p className="mt-1 text-[11px] text-ink-2">Example values</p>
              </StepCard>
            </ol>
          </div>
        </section>

        <section aria-labelledby="cta-title" className="mx-auto max-w-[1280px] px-5 py-20 sm:px-8 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-navy-950 px-6 py-12 text-white sm:px-12 sm:py-16">
            <svg className="pointer-events-none absolute -top-24 -right-24 size-[420px] text-white/[0.05]" viewBox="0 0 200 200" aria-hidden>
              <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <line x1="100" y1="0" x2="100" y2="200" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="100" cy="100" r="3" fill="currentColor" />
            </svg>
            <div className="relative flex flex-wrap items-end justify-between gap-8">
              <div className="max-w-xl">
                <p className="flex items-center gap-2 text-sm font-semibold text-brand">
                  <Activity className="size-4" aria-hidden /> No sign-up, no upload
                </p>
                <h2 id="cta-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  Analyze your first match today
                </h2>
                <p className="mt-3 text-base leading-relaxed text-white/70">Bring a clip from your last game, or try the built-in sample match.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/app/analyze" className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-semibold text-navy-950 hover:bg-brand-hover">
                  Get started <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href="/app" className="inline-flex h-12 items-center rounded-lg border border-white/20 px-5 text-[15px] font-semibold hover:bg-white/10">
                  Open the app
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy-950 text-white/60">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-6 px-5 py-10 text-sm sm:px-8">
          <Logo />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              <li>
                <Link href="/app" className="hover:text-white">
                  Open the app
                </Link>
              </li>
              <li>
                <Link href="/app/analyze" className="hover:text-white">
                  Upload a match
                </Link>
              </li>
              <li>
                <Link href="/app/help" className="hover:text-white">
                  Help
                </Link>
              </li>
            </ul>
          </nav>
          <p>© 2026 DiaLabs</p>
        </div>
      </footer>
    </div>
  );
}
