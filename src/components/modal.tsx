"use client";

import { useEffect, type ReactNode } from "react";

/* Ortak modal kabuğu: arka plan kararması, Esc ile kapanma, gövde kaydırma
   kilidi ve dışarı tıklayınca kapanma. İçerik `children` ile verilir. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  // Esc ile kapat + arka plan kaymasını kilitle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`my-auto w-full ${maxWidth} rounded-card border border-line bg-paper shadow-pop`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {subtitle && (
              <div className="mt-1.5 text-xs text-muted">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
