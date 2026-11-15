"use client";

import { Film, Upload } from "lucide-react";
import { MatchList } from "@/components/match/MatchList";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

export default function MatchesPage() {
  const count = useStryde((s) => s.order.length);
  return (
    <div className="pb-16">
      <PageHeader
        title="Matches"
        subtitle="Clips analyzed in this tab. They are kept in memory only, so reloading or closing the tab clears them."
        actions={
          count ? (
            <LinkButton href="/app/analyze" variant="navy">
              <Upload className="size-4" aria-hidden /> Upload match
            </LinkButton>
          ) : undefined
        }
      />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden">
          {count ? (
            <>
              <CardHeader title="All matches" subtitle={`${count} ${count === 1 ? "clip" : "clips"} in this tab, newest first.`} />
              <MatchList />
            </>
          ) : (
            <EmptyState
              icon={<Film className="size-6" aria-hidden />}
              title="No matches yet"
              action={
                <LinkButton href="/app/analyze">
                  <Upload className="size-4" aria-hidden /> Upload match
                </LinkButton>
              }
            >
              Stryde keeps no history online. Analyze a clip from your last match, or try the built-in sample clip, and it will be listed here for as long as
              this tab stays open.
            </EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
