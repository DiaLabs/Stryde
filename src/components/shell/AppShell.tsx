"use client";

import clsx from "clsx";
import { BarChart3, CircleHelp, Film, LayoutDashboard, Menu, ShieldCheck, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { ModelStatusBar } from "@/components/shell/ModelStatusBar";
import { preloadAllModels } from "@/lib/models/cache";
import { useStryde } from "@/lib/store";

function useNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const latest = useStryde((s) => s.order.find((id) => s.matches[id]?.result));
  const matchCount = useStryde((s) => s.order.length);
  const inMatch = pathname.startsWith("/app/match/");
  return [
    { href: "/app", label: "Home", icon: LayoutDashboard, active: pathname === "/app" },
    { href: "/app/matches", label: "Matches", icon: Film, active: pathname.startsWith("/app/matches") || (inMatch && tab !== "team"), count: matchCount || undefined },
    { href: "/app/analyze", label: "Upload match", icon: Upload, active: pathname.startsWith("/app/analyze") },
    {
      href: latest ? `/app/match/${latest}?tab=team` : "/app/team",
      label: "Team analysis",
      icon: BarChart3,
      active: pathname.startsWith("/app/team") || (inMatch && tab === "team"),
    },
    { href: "/app/help", label: "Help", icon: CircleHelp, active: pathname.startsWith("/app/help") },
  ];
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav();
  return (
    <ul className="space-y-0.5">
      {nav.map((n) => (
        <li key={n.label}>
          <Link
            href={n.href}
            onClick={onNavigate}
            aria-current={n.active ? "page" : undefined}
            className={clsx(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              n.active ? "bg-white/[0.08] font-semibold text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            {n.active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand" aria-hidden />}
            <n.icon className={clsx("size-[18px] shrink-0", n.active ? "text-brand" : "text-white/45 group-hover:text-white/70")} aria-hidden />
            <span className="flex-1">{n.label}</span>
            {n.count !== undefined && <span className="rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-white/70 tabular">{n.count}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SidebarFooter() {
  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <ModelStatusBar dark />
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-white/55">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand" aria-hidden />
        Videos are analyzed on this device and never uploaded.
      </p>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="relative flex h-full flex-col overflow-hidden bg-navy-950 px-3 py-5 text-white">
      {/* faint pitch markings: centre circle and halfway line behind the nav */}
      <svg className="pointer-events-none absolute -right-24 bottom-24 size-72 text-white/[0.035]" viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="100" y1="0" x2="100" y2="200" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="4" fill="currentColor" />
      </svg>
      <Link href="/" className="relative rounded-lg px-1.5 pb-1" aria-label="Stryde home" onClick={onNavigate}>
        <Logo />
      </Link>
      <div className="relative mt-8 flex-1">
        <Suspense>
          <NavList onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="relative">
        <SidebarFooter />
      </div>
    </nav>
  );
}

function MobileNav() {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="rounded-lg p-2 text-ink hover:bg-ink/5" aria-label="Open navigation">
        <Menu className="size-5" aria-hidden />
      </button>
      {/* native dialog: focus trap, Escape to close, focus returns to the button */}
      <dialog
        ref={ref}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-none w-[17rem] max-w-[85vw] bg-transparent p-0 backdrop:bg-navy-950/60"
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        <div className="relative h-full">
          <Sidebar onNavigate={() => ref.current?.close()} />
          <button type="button" onClick={() => ref.current?.close()} className="absolute top-5 right-3 rounded-lg p-1.5 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hasMatches = useStryde((s) => s.order.length > 0);

  useEffect(() => {
    preloadAllModels();
  }, []);

  // results live only in this tab: warn before a reload or close throws them away
  useEffect(() => {
    if (!hasMatches) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasMatches]);

  return (
    <div className="flex min-h-dvh bg-page">
      <a href="#main" className="sr-only z-50 rounded-lg bg-brand px-3 py-2 font-semibold text-navy-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-card/95 px-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-1.5">
            <MobileNav />
            <Link href="/" aria-label="Stryde home" className="rounded-lg">
              <Logo light={false} />
            </Link>
          </div>
          <ModelStatusBar compact />
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
