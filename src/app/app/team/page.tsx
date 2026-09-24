"use client";

import { BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, EmptyState, LinkButton } from "@/components/ui/primitives";
import { useStryde } from "@/lib/store";

export default function TeamAnalysisIndex() {
  const router = useRouter();
  const latest = useStryde((s) => s.order.find((id) => s.matches[id]?.result));
  useEffect(() => {
    if (latest) router.replace(`/app/match/${latest}?tab=team`);
  }, [latest, router]);
  return (
    <div className="pb-12">
      <PageHeader title="Team analysis" subtitle="Heatmaps, occupancy, distribution and team comparisons for an analyzed match." />
      <div className="px-4 sm:px-8">
        <Card>
          <EmptyState icon={<BarChart3 className="size-5" />} title="No completed analysis yet" action={<LinkButton href="/app/analyze">Analyze a match</LinkButton>}>
            Team analysis becomes available once a match has finished processing in this session.
          </EmptyState>
        </Card>
      </div>
    </div>
  );
}
