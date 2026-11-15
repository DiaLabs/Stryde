"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./primitives";

/**
 * Modal confirmation on the native <dialog> (focus trap, Escape and inert background for free).
 * Focus starts on the safe choice, so pressing Enter twice never destroys work.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Keep working",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-xl border border-line bg-card p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-navy-950/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-2 text-sm leading-relaxed text-ink-2">
            {children}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-page/60 px-5 py-3">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
