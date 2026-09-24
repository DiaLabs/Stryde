"use client";

import clsx from "clsx";
import { BarChart3, CircleHelp, Film, Home, Lock, Menu, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { ModelStatusBar } from "@/components/shell/ModelStatusBar";
import { preloadAllModels } from "@/lib/models/cache";
import { useStryde } from "@/lib/store";

function useLatestCompletedMatchId(): string | undefined {
  return useStryde((s) => s.order.find((id) => s.matches[id]?.result));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  // the drawer closes itself on navigation because it is tied to the path it was opened on
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const latest = useLatestCompletedMatchId();
  const hasMatches = useStryde((s) => s.order.length > 0);

  // Results live only in this tab's memory; warn before a reload or close discards them.
  useEffect(() => {
    preloadAllModels();
  }, []);

  useEffect(() => {
    if (!hasMatches) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasMatches]);

  const nav = [
    { href: "/app", label: "Home", icon: Home, match: (p: string) => p === "/app" },
    { href: "/app/analyze", label: "Analyze a match", icon: Upload, match: (p: string) => p.startsWith("/app/analyze") },
    { href: "/app/matches", label: "Matches", icon: Film, match: (p: string) => p.startsWith("/app/matches") || (p.startsWith("/app/match/") && !p.includes("tab=team")) },
    {
      href: latest ? `/app/match/${latest}?tab=team` : "/app/team",
      label: "Team analysis",
      icon: BarChart3,
      match: (p: string) => p.startsWith("/app/team"),
    },
    { href: "/app/help", label: "Help & limitations", icon: CircleHelp, match: (p: string) => p.startsWith("/app/help") },
  ];

  const sidebar = (
    <nav aria-label="Primary" className="flex h-full flex-col bg-navy-950 px-3 py-5 text-white">
      <Link href="/" className="px-2" aria-label="Stryde home">
        <Logo />
      </Link>
      <ul className="mt-8 space-y-1">
        {nav.map((n) => {
          const active = n.match(pathname);
          return (
            <li key={n.label}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <n.icon className={clsx("size-4", active && "text-brand")} aria-hidden />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
        <p className="flex items-center gap-1.5 font-semibold text-white">
          <Lock className="size-3.5 text-brand" aria-hidden /> Local processing
        </p>
        <p className="mt-1 leading-relaxed">Videos are analyzed in this browser tab and never uploaded. Results are cleared when you close the tab.</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            {sidebar}
            <button className="absolute top-4 right-3 rounded p-1 text-white/80 hover:text-white" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded p-1.5 text-ink hover:bg-page" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <Link href="/" aria-label="Stryde home">
            <Logo light={false} />
          </Link>
        </header>
        <ModelStatusBar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
