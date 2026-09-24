import { Activity, Crosshair, Lock, Map, Users, Video, type LucideIcon } from "lucide-react";

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Video,
    title: "Annotated playback",
    text: "Player boxes, team labels, ball indicator, possession highlight, trails and a broadcast-style HUD over your own footage.",
  },
  {
    icon: Users,
    title: "Automatic team grouping",
    text: "Players are grouped by jersey color. Review and correct the colors at any time; ambiguous players stay Unknown.",
  },
  {
    icon: Activity,
    title: "Estimated possession",
    text: "Ball proximity plus temporal reasoning estimates which team has the ball — with unknown moments shown, not hidden.",
  },
  {
    icon: Map,
    title: "Synchronized pitch",
    text: "Occupancy and movement heatmaps, zones and team shape on a 2D pitch that follows the video time.",
  },
  {
    icon: Crosshair,
    title: "Shot & goal estimates",
    text: "Best-effort shot attempts with trajectories and possible goals, always labeled with confidence.",
  },
  {
    icon: Lock,
    title: "Private by design",
    text: "Everything runs in your browser. The video is never uploaded and results vanish when you close the tab.",
  },
];

export function FeatureGrid() {
  return (
    <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <article key={feature.title} className="flex h-full flex-col bg-white p-7">
            <Icon className="size-5 text-[#11704a]" strokeWidth={1.75} aria-hidden />
            <h3 className="mt-6 text-base font-semibold tracking-tight text-ink">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{feature.text}</p>
          </article>
        );
      })}
    </div>
  );
}
