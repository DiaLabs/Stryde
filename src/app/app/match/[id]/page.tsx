"use client";

import { ArrowLeft, CircleSlash, FileQuestion, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { MatchWorkspace } from "@/components/match/MatchWorkspace";
import { ProcessingView } from "@/components/processing/ProcessingView";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, EmptyState, LinkButton, Notice, TeamChip } from "@/components/ui/primitives";
import { useStryde, type MatchEntry } from "@/lib/store";

const PENDING_COLOR = "#9aa5ae";

function Teams({ entry }: { entry: MatchEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <TeamChip color={entry.config.teamAColor ?? PENDING_COLOR} name={entry.config.teamAName} className="font-semibold text-ink" />
      <span className="text-ink-2">vs</span>
      <TeamChip color={entry.config.teamBColor ?? PENDING_COLOR} name={entry.config.teamBName} className="font-semibold text-ink" />
      <span className="ml-2 min-w-0 truncate text-ink-2">· {entry.meta.fileName}</span>
    </span>
  );
}

const container = "mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:px-8";

const back = (
  <Link href="/app/matches" aria-label="Back to matches" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink transition-colors hover:bg-ink/5">
    <ArrowLeft className="size-5" aria-hidden />
  </Link>
);

function MatchPageInner() {
  const { id } = useParams<{ id: string }>();
  const entry = useStryde((s) => s.matches[id]);
  const retry = useStryde((s) => s.retryAnalysis);

  if (!entry) {
    return (
      <>
        <PageHeader back={back} title="Match not found" />
        <div className={container}>
          <Card>
            <EmptyState
              icon={<FileQuestion className="size-6" aria-hidden />}
              title="This match is no longer here"
              action={
                <>
                  <LinkButton href="/app/analyze">
                    <Upload className="size-4" aria-hidden /> Upload match
                  </LinkButton>
                  <LinkButton href="/app/matches" variant="secondary">
                    See your matches
                  </LinkButton>
                </>
              }
            >
              Results exist only in the browser tab that created them, and are cleared when the tab is reloaded or closed. Nothing is stored on a server.
            </EmptyState>
          </Card>
        </div>
      </>
    );
  }

  const title = `${entry.config.teamAName} vs ${entry.config.teamBName}`;
  const s = entry.session.status;

  if (s === "complete" && entry.result) return <MatchWorkspace entry={entry} result={entry.result} />;

  if (s === "failed") {
    const err = entry.error;
    return (
      <>
        <PageHeader back={back} title="The analysis stopped" subtitle={<Teams entry={entry} />} />
        <div className={container}>
          <Card className="max-w-3xl space-y-5 p-5">
            <Notice tone="danger" title={err?.message ?? "An unexpected error stopped the analysis."}>
              {err?.suggestedAction && <span className="block">Next step: {err.suggestedAction}</span>}
              <span className="mt-1 block">Your video never left this device.</span>
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => retry(entry.id)}>
                <RotateCcw className="size-4" aria-hidden /> Try again
              </Button>
              {entry.config.mode === "detailed" && (
                <Button variant="secondary" onClick={() => retry(entry.id, { mode: "faster" })}>
                  Try again in Faster mode
                </Button>
              )}
              <LinkButton href="/app/analyze" variant="secondary">
                Choose another video
              </LinkButton>
            </div>
          </Card>
        </div>
      </>
    );
  }

  if (s === "cancelled") {
    return (
      <>
        <PageHeader back={back} title="Analysis cancelled" subtitle={<Teams entry={entry} />} />
        <div className={container}>
          <Card>
            <EmptyState
              icon={<CircleSlash className="size-6" aria-hidden />}
              title="Nothing was kept from this run"
              action={
                <>
                  <Button onClick={() => retry(entry.id)}>
                    <RotateCcw className="size-4" aria-hidden /> Restart analysis
                  </Button>
                  <LinkButton href="/app/analyze" variant="secondary">
                    Choose another video
                  </LinkButton>
                </>
              }
            >
              Temporary data was released. The video is still selected in this tab, so you can restart without choosing it again.
            </EmptyState>
          </Card>
        </div>
      </>
    );
  }

  return <ProcessingView entry={entry} title={title} />;
}

export default function MatchPage() {
  return (
    <Suspense>
      <MatchPageInner />
    </Suspense>
  );
}
