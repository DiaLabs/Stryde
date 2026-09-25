import clsx from "clsx";
import Image from "next/image";
import logo from "@/app/logo.png";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#20C785" />
      <path
        d="M21.5 9.5c-1.2-1-3-1.6-5-1.6-3.3 0-5.6 1.7-5.6 4.2 0 2.3 1.8 3.3 4.7 4l1.6.4c1.9.5 2.6 1 2.6 1.9 0 1.1-1.2 1.8-3.1 1.8-1.9 0-3.4-.7-4.4-1.8l-2 2.3c1.4 1.5 3.7 2.4 6.3 2.4 3.6 0 6-1.8 6-4.5 0-2.3-1.6-3.5-4.9-4.3l-1.6-.4c-1.6-.4-2.4-.8-2.4-1.7 0-1 1-1.6 2.7-1.6 1.4 0 2.6.4 3.5 1.2l1.6-2.3z"
        fill="#07131D"
      />
    </svg>
  );
}

export function Logo({ className, light = true, mark = "image" }: { className?: string; light?: boolean; mark?: "s" | "image" }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      {mark === "image" ? (
        <Image src={logo} alt="" width={40} height={40} className="size-10 object-contain" />
      ) : (
        <LogoMark />
      )}
      <span className={clsx("text-lg font-extrabold tracking-[0.14em]", light ? "text-white" : "text-ink")}>STRYDE</span>
    </span>
  );
}
