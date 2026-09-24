"use client";

import { Ban, FileQuestion, RotateCcw, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { MatchWorkspace } from "@/components/match/MatchWorkspace";
import { ProcessingView } from "@/components/processing/ProcessingView";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, EmptyState, LinkButton, Notice } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

function MatchPageInner() {
  const { id } = useParams<{ id: string }>();
  const entry = useStryde((s) => s.matches[id]);
  const retry = useStryde((s) => s.retryAnalysis);

  if (!entry) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <Card>
          <EmptyState
            icon={<FileQuestion className="size-5" />}
            title="This analysis is no longer available"
            action={
              <LinkButton href="/app/analyze">
                <Upload className="size-4" /> Analyze a match
              </LinkButton>
            }
          >
            Results exist only in the browser tab that created them and are cleared on reload or when the tab closes. Nothing is stored on a server.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const title = `${entry.config.teamAName} vs ${entry.config.teamBName}`;
  const s = entry.session.status;

  if (s === "complete" && entry.result) return <MatchWorkspace entry={entry} result={entry.result} />;

  if (s === "failed") {
    const err = entry.error;
    return (
      <>
        <PageHeader title={title} subtitle={entry.meta.fileName} />
        <div className="max-w-3xl space-y-4 px-4 sm:px-8">
          <Notice tone="danger" title="Analysis failed">
            {err?.message ?? "An unexpected error stopped the analysis."}
            {err?.suggestedAction && <span className="mt-1 block font-medium">Next step: {err.suggestedAction}</span>}
            <span className="mt-1 block">Your video never left this device.</span>
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => retry(entry.id)}>
              <RotateCcw className="size-4" /> Retry
            </Button>
            {entry.config.mode === "detailed" && (
              <Button variant="secondary" onClick={() => retry(entry.id, { mode: "faster" })}>
                Retry in Faster mode
              </Button>
            )}
            <LinkButton href="/app/analyze" variant="secondary">
              Choose another video
            </LinkButton>
          </div>
        </div>
      </>
    );
  }

  if (s === "cancelled") {
    return (
      <>
        <PageHeader title={title} subtitle={entry.meta.fileName} />
        <div className="px-4 sm:px-8">
          <Card>
            <EmptyState
              icon={<Ban className="size-5" />}
              title="Analysis cancelled"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => retry(entry.id)}>
                    <RotateCcw className="size-4" /> Restart analysis
                  </Button>
                  <LinkButton href="/app/analyze" variant="secondary">
                    Choose another video
                  </LinkButton>
                </div>
              }
            >
              Temporary data was released. The video is still selected in this tab, so you can restart without choosing it again.
            </EmptyState>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} subtitle="Match processing" />
      <ProcessingView entry={entry} />
    </>
  );
}

export default function MatchPage() {
  return (
    <Suspense>
      <MatchPageInner />
    </Suspense>
  );
}
