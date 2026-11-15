"use client";

import { BarChart3, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, LinkButton } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

export default function TeamAnalysisIndex() {
  const router = useRouter();
  const latest = useStryde((s) => s.order.find((id) => s.matches[id]?.result));
  const hasAny = useStryde((s) => s.order.length > 0);
  useEffect(() => {
    if (latest) router.replace(`/app/match/${latest}?tab=team`);
  }, [latest, router]);
  return (
    <div className="pb-16">
      <PageHeader title="Team analysis" subtitle="Possession over time, where each team played and how they spread out, for a match you have analyzed." />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Card>
          <EmptyState
            icon={<BarChart3 className="size-6" aria-hidden />}
            title="No finished match yet"
            action={
              hasAny ? (
                <LinkButton href="/app/matches" variant="secondary">
                  See your matches
                </LinkButton>
              ) : (
                <>
                  <LinkButton href="/app/analyze">
                    <Upload className="size-4" aria-hidden /> Upload match
                  </LinkButton>
                  <LinkButton href="/app/analyze?sample=1" variant="secondary">
                    Try the sample clip
                  </LinkButton>
                </>
              )
            }
          >
            {hasAny
              ? "A match in this tab is still being analyzed or was stopped. The team view opens here once one has finished."
              : "The team view opens here once a match in this tab has finished analyzing."}
          </EmptyState>
        </Card>
      </div>
    </div>
  );
}
