"use client";

import clsx from "clsx";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { href: "#features", label: "Features", section: "features" },
  { href: "#workflow", label: "How it works", section: "workflow" },
  { href: "/app/help", label: "Help" },
];

/**
 * Floating pill navigation for the landing page.
 * - slides in on load, tightens and darkens once the page is scrolled
 * - a highlight pill glides to the hovered/focused link and otherwise rests on the section in view
 * - on phones the pill opens an animated menu panel (Escape or a link closes it)
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeSectionRef = useRef<string | null>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // which in-page section is in view
  useEffect(() => {
    const ids = LINKS.flatMap((l) => (l.section ? [l.section] : []));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
          else if (e.target.id === activeSectionRef.current) setActiveSection(null);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  // move the highlight to the hovered link, else to the active section's link
  useEffect(() => {
    const target = hover ?? LINKS.findIndex((l) => l.section && l.section === activeSection);
    const el = target !== null && target >= 0 ? linkRefs.current[target] : null;
    const list = listRef.current;
    const raf = requestAnimationFrame(() => {
      if (!el || !list) setIndicator(null);
      else {
        // measure against the list, which the highlight is positioned in
        const a = el.getBoundingClientRect();
        const b = list.getBoundingClientRect();
        setIndicator({ left: a.left - b.left, width: a.width });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [hover, activeSection, scrolled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-4">
      <div className={clsx("nav-in pointer-events-auto relative w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]", scrolled ? "max-w-[980px]" : "max-w-[1120px]")}>
        <nav
          aria-label="Main"
          className={clsx(
            "flex h-14 items-center gap-2 rounded-full border pr-2 pl-4 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 sm:pl-5",
            scrolled || open
              ? "border-white/12 bg-navy-950/85 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
              : "border-white/10 bg-navy-950/45 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.5)]"
          )}
        >
          <Link href="/" aria-label="Stryde home" className="shrink-0 rounded-full">
            <Logo />
          </Link>

          <ul ref={listRef} className="relative mx-auto hidden items-center md:flex" onMouseLeave={() => setHover(null)}>
            <span
              aria-hidden
              className="absolute inset-y-0 rounded-full bg-white/[0.09] transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              style={{ width: indicator?.width ?? 0, transform: `translateX(${indicator?.left ?? 0}px)`, opacity: indicator ? 1 : 0, left: 0 }}
            />
            {LINKS.map((l, i) => {
              const current = l.section && l.section === activeSection;
              return (
                <li key={l.label}>
                  <a
                    ref={(el) => {
                      linkRefs.current[i] = el;
                    }}
                    href={l.href}
                    aria-current={current ? "true" : undefined}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className={clsx("relative block rounded-full px-4 py-2 text-sm font-medium transition-colors", current || hover === i ? "text-white" : "text-white/65")}
                  >
                    {l.label}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <Link href="/app" className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex">
              Open app
            </Link>
            <Link
              href="/app/analyze"
              className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-navy-950 shadow-[0_6px_20px_-6px_rgba(32,199,133,0.7)] transition-[background-color,transform] hover:-translate-y-px hover:bg-brand-hover"
            >
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-nav-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid size-10 place-items-center rounded-full text-white transition-colors hover:bg-white/10 md:hidden"
            >
              <span className="relative size-5">
                <Menu className={clsx("absolute inset-0 size-5 transition-all duration-300", open ? "scale-50 rotate-90 opacity-0" : "opacity-100")} aria-hidden />
                <X className={clsx("absolute inset-0 size-5 transition-all duration-300", open ? "opacity-100" : "scale-50 -rotate-90 opacity-0")} aria-hidden />
              </span>
            </button>
          </div>
        </nav>

        <div
          id="site-nav-menu"
          className={clsx(
            "absolute inset-x-0 top-full mt-2 origin-top rounded-3xl border border-white/12 bg-navy-950/95 p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] md:hidden",
            open ? "scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-[0.97] opacity-0"
          )}
          inert={!open}
        >
          <ul>
            {[...LINKS, { href: "/app", label: "Open app" }].map((l) => (
              <li key={l.label}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-[15px] font-medium text-white/85 hover:bg-white/[0.07] hover:text-white">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
}
