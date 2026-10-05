"use client";

import { useEffect, type ReactNode } from "react";

/* Ortak modal kabuğu: arka plan kararması, Esc ile kapanma, gövde kaydırma
   kilidi ve dışarı tıklayınca kapanma. İçerik `children` ile verilir.
   Telefonda alttan açılan sayfa (bottom sheet): başparmağa yakın, tam genişlik;
   başlık + ✕ uzun içerikte kaydırırken de üstte kalır. Geniş ekranda ortada kart.
   `title` metinse başlık olarak yazılır; düğüm verilirse (ör. ad düzenleme formu)
   olduğu gibi yerleştirilir. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-2xl",
  label,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  /** Ekran okuyucu başlığı — title metin değilse verin. */
  label?: string;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/55 pt-12 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
    >
      <div
        className={`mt-auto w-full ${maxWidth} rounded-t-card border border-b-0 border-line bg-paper pb-[env(safe-area-inset-bottom)] shadow-pop sm:my-auto sm:rounded-card sm:border-b sm:pb-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-card border-b border-line bg-paper px-4 py-3.5 sm:static sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? (
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                {title}
              </h2>
            ) : (
              title
            )}
            {subtitle && <div className="mt-1.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2"
          >
            ✕
          </button>
        </header>

        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
