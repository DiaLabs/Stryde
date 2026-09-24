"use client";

import clsx from "clsx";
import { BarChart3, CircleHelp, Film, Home, Menu, Shield, Upload, X } from "lucide-react";
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
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const latest = useLatestCompletedMatchId();
  const hasMatches = useStryde((s) => s.order.length > 0);

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
    { href: "/app/analyze", label: "Analyze", icon: Upload, match: (p: string) => p.startsWith("/app/analyze") },
    { href: "/app/matches", label: "Matches", icon: Film, match: (p: string) => p.startsWith("/app/matches") || (p.startsWith("/app/match/") && !p.includes("tab=team")) },
    {
      href: latest ? `/app/match/${latest}?tab=team` : "/app/team",
      label: "Teams",
      icon: BarChart3,
      match: (p: string) => p.startsWith("/app/team"),
    },
    { href: "/app/help", label: "Help", icon: CircleHelp, match: (p: string) => p.startsWith("/app/help") },
  ];

  const sidebar = (
    <nav aria-label="Primary" className="flex h-full flex-col border-r border-white/10 bg-navy-950 px-3 py-5 text-white">
      <Link href="/" className="px-1 pb-2" aria-label="Stryde home">
        <Logo mark="image" />
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
                  active ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <n.icon className={clsx("size-[18px] shrink-0", active ? "text-brand" : "text-white/55")} aria-hidden />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-page">
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[17rem] shadow-xl">
            {sidebar}
            <button className="absolute top-3.5 right-2.5 rounded p-1 text-white/80 hover:text-white" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <ModelStatusBar />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-card/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} className="rounded p-1 text-ink hover:bg-page" aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
            <Link href="/" aria-label="Stryde home">
              <Logo light={false} />
            </Link>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <Shield className="size-3.5 shrink-0" aria-hidden /> Private
          </p>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        <footer className="hidden border-t border-line bg-card/80 px-8 py-2.5 lg:block">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Shield className="size-3.5 shrink-0 text-brand" aria-hidden />
            Your video stays on this device — nothing is uploaded.
          </p>
        </footer>
      </div>
    </div>
  );
}
