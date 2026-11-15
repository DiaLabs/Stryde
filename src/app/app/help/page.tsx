import type { Metadata } from "next";
import { BookOpen, Camera, Gauge, LineChart, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Help and limitations" };

const sections: { id: string; title: string; icon: LucideIcon; body: ReactNode }[] = [
  {
    id: "what-it-does",
    icon: BookOpen,
    title: "What Stryde does",
    body: (
      <>
        <p>
          Stryde looks at a short clip of a soccer match and works out where the players and the ball are, frame by frame. It runs a detection model
          (YOLO11) inside your browser, on the graphics chip through WebGPU when there is one, or on the processor through WebAssembly when there
          isn&apos;t.
        </p>
        <ul>
          <li>
            Detections are linked over time into tracks, each with a number. A track number is a technical reference, never a player&apos;s identity.
          </li>
          <li>
            Tracks are split into two teams by shirt color. Players who are hard to place, referees and goalkeepers usually stay unassigned.
          </li>
          <li>
            Possession is estimated from which team is closest to the ball, smoothed over time. Moments where nobody clearly has the ball are left out
            of the percentage.
          </li>
          <li>From the tracks it builds heatmaps of where each team played, zone shares, team shape and estimated shots.</li>
        </ul>
      </>
    ),
  },
  {
    id: "footage",
    icon: Camera,
    title: "How to film and which clips work",
    body: (
      <ul>
        <li>Soccer only. Clips of about 30 to 60 seconds work best; up to 5 minutes is accepted.</li>
        <li>
          720p at 25 frames per second is the target. MP4 (H.264) is the safest format; WebM and MOV work where your browser can play them.
        </li>
        <li>
          A steady camera on the sideline gives the most reliable results. Broadcast footage works, but pans, zooms and cuts between cameras can break
          tracks.
        </li>
      </ul>
    ),
  },
  {
    id: "modes",
    icon: Gauge,
    title: "Faster or more detailed",
    body: (
      <>
        <p>
          <strong>Faster</strong> uses the small model (YOLO11n at 960 pixels) and looks at 5 frames each second. It gives a quicker result and is the
          right choice on a device without a usable graphics chip.
        </p>
        <p>
          <strong>More detailed</strong> uses a larger model (YOLO11s at 960 pixels) and looks at 10 frames each second. It finds the ball more often
          but takes about twice as long. It needs WebGPU; without it, Stryde falls back to the small model at 8 frames each second.
        </p>
        <p>How long either takes depends on your device. The model downloads once and is then kept by the browser.</p>
      </>
    ),
  },
  {
    id: "estimates",
    icon: LineChart,
    title: "What the numbers mean, and the limits",
    body: (
      <>
        <p>
          Everything Stryde reports is an estimate. Where a value is estimated rather than measured, it is drawn with a dashed line or underlined with
          dashes. Solid lines mean the value was measured directly.
        </p>
        <ul>
          <li>A small, blurred or hidden ball is often missed, which makes possession, shots and goals less certain.</li>
          <li>Shots are picked up from fast, straight ball travel, so a long pass or a clearance can look like a shot.</li>
          <li>
            Individual player statistics, recognizing who a player is, pass detection, formations and downloadable reports are not part of this
            release.
          </li>
          <li>Tracks, possession and events can&apos;t be edited by hand. Team names and colors can be corrected after the analysis.</li>
        </ul>
      </>
    ),
  },
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "Privacy: where your video goes",
    body: (
      <ul>
        <li>Your video is read straight from your device and analyzed inside this browser tab. It is never uploaded to Stryde.</li>
        <li>Results live only in the tab&apos;s memory. Reloading or closing the tab, or discarding a match, removes them.</li>
        <li>No file names, frames or analysis data are sent to any analytics service.</li>
      </ul>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="pb-16">
      <PageHeader title="Help and limitations" subtitle="How Stryde works, which clips suit it, and how to read what it tells you." />
      <div className="mx-auto grid max-w-[1400px] gap-5 px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8">
        <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-line bg-card p-2 shadow-[var(--shadow-card)]">
            <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-ink-2">On this page</p>
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-page hover:text-ink"
                  >
                    <s.icon className="size-4 shrink-0 text-ok" aria-hidden />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="min-w-0 space-y-5">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className="scroll-mt-20 rounded-xl border border-line bg-card p-5 shadow-[var(--shadow-card)] sm:p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-ok">
                  <s.icon className="size-[18px]" aria-hidden />
                </span>
                <h2 id={`${s.id}-title`} className="text-[17px] font-semibold text-ink">
                  {s.title}
                </h2>
              </div>
              <div className="mt-3 max-w-[72ch] text-sm leading-relaxed text-ink-2 [&_li]:mt-1.5 [&_li]:marker:text-brand [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
