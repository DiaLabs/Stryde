import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Help & limitations" };

const sections: { title: string; items: string[] }[] = [
  {
    title: "What Stryde does",
    items: [
      "Detects people and the ball in sampled frames with a YOLO11 model running in your browser (WebGPU, or WebAssembly on the CPU).",
      "Links detections over time into temporary tracks (e.g. “Team A · 12”). Track numbers are technical references, never player identities.",
      "Groups tracks into two teams by jersey color; ambiguous tracks, referees and goalkeepers usually stay Unknown.",
      "Estimates which team has the ball from ball-to-player proximity with temporal smoothing. Unknown or contested moments are excluded from the possession percentage.",
      "Builds team occupancy and movement heatmaps, zone shares, team shape and — with pitch calibration — distances, speeds, goal-directed shots and possible goals.",
    ],
  },
  {
    title: "Supported footage",
    items: [
      "Soccer only. Clips of about 30–60 seconds work best; up to 5 minutes is accepted.",
      "720p at 25 fps is the target. MP4 (H.264) is the most compatible; WebM and MOV work where your browser can decode them.",
      "Static sideline views give the most reliable results. Broadcast footage works, but pans, zooms and cuts break tracks and limit calibration coverage.",
    ],
  },
  {
    title: "Analysis modes",
    items: [
      "Faster: YOLO11n at 960 px, 5 sampled frames per second.",
      "More detailed: YOLO11s at 960 px, 10 frames per second (needs WebGPU; otherwise falls back to the small model at 8 frames per second).",
      "Processing time depends on your device. The model downloads once and is then cached by the browser.",
    ],
  },
  {
    title: "Pitch calibration",
    items: [
      "Without calibration, positions are camera-stabilized image coordinates stretched onto a standard pitch — useful for relative patterns, not true locations.",
      "Calibrate by clicking at least four visible pitch markings on a frame and matching them to landmarks on the pitch diagram.",
      "Calibration is compensated for camera pans but not zooms or cuts; frames that drift too far are excluded from pitch metrics.",
    ],
  },
  {
    title: "Limitations",
    items: [
      "All outputs are estimates. Small, blurred or occluded balls are often missed, which makes possession, shots and goals uncertain.",
      "Shots are detected from fast, straight ball travel; long passes or clearances can look similar, especially without calibration.",
      "Possible goals are inferred from the projected ground position of the ball crossing the goal line; ball height and the net are not observed.",
      "Individual-player statistics, identity recognition, pass detection, formations and downloadable reports are not part of this release.",
      "Tracks, possession and events cannot be edited manually; only team names and colors can be corrected.",
    ],
  },
  {
    title: "Privacy",
    items: [
      "Your video is read directly from your device and analyzed inside this browser tab. It is never uploaded to Stryde.",
      "Results live only in the tab's memory. Reloading, closing the tab or discarding a match removes them.",
      "No filenames, frames or analysis data are sent to any analytics service.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="pb-12">
      <PageHeader title="Help & limitations" subtitle="How Stryde works, what footage suits it, and how to read its estimates." />
      <div className="grid gap-5 px-4 sm:px-8 lg:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader title={s.title} />
            <ul className="list-disc space-y-2 px-5 pb-5 pl-10 text-sm text-ink-2">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
