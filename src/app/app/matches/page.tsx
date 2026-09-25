"use client";

import { Film, Upload } from "lucide-react";
import { MatchList } from "@/components/match/MatchList";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, LinkButton } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

export default function MatchesPage() {
  const count = useStryde((s) => s.order.length);
  return (
    <div className="pb-12">
      <PageHeader
        title="Matches"
        subtitle="Analyses from this browser session. They are kept in memory only — reloading or closing the tab clears them."
      />
      <div className="px-4 sm:px-8">
        <Card>
          {count ? (
            <MatchList />
          ) : (
            <EmptyState
              icon={<Film className="size-6" />}
              title="No matches in this session"
              action={
                <LinkButton href="/app/analyze" size="lg">
                  <Upload className="size-5" /> Analyze a match
                </LinkButton>
              }
            >
              Stryde does not keep a cloud history. Analyze a clip to see it listed here while this tab stays open.
            </EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
