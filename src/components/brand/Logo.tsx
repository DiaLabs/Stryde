import clsx from "clsx";
import Image from "next/image";
import logo from "@/app/logo.png";

/**
 * The Stryde logo (src/app/logo.png). The artwork sits on black, so on dark surfaces it is
 * composited with `mix-blend-mode: screen` (black drops out and only the mark and its glow
 * remain); on light surfaces it is shown inside a small navy tile.
 */
export function LogoMark({ className, onLight = false }: { className?: string; onLight?: boolean }) {
  const img = <Image src={logo} alt="" width={60} height={40} priority className="h-full w-auto object-contain mix-blend-screen" />;
  if (!onLight) return <span className={clsx("inline-flex h-9 items-center", className)}>{img}</span>;
  return <span className={clsx("inline-flex h-9 items-center rounded-lg bg-navy-950 px-0.5", className)}>{img}</span>;
}

export function Logo({ className, light = true }: { className?: string; light?: boolean; mark?: "s" | "image" }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark onLight={!light} />
      <span className={clsx("text-[1.05rem] font-extrabold tracking-[0.16em]", light ? "text-white" : "text-ink")}>STRYDE</span>
    </span>
  );
}
