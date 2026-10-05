"use client";

import { useId, useState, type ReactNode } from "react";

/* Telefonda kapalı başlayan, geniş ekranda her zaman açık kart.
   "Yeni ürün / Yeni toptancı" gibi formlar telefonda ilk ekranın tamamını
   kaplıyor, asıl listeyi ekranın altına itiyordu. Telefonda tek dokunuşluk
   başlık olarak durur; dokununca açılır. Masaüstünde normal Card gibi görünür. */
export function MobileCollapsible({
  title,
  children,
  className = "",
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  /** Telefonda açık başlasın mı (ör. liste boşken form tek iş). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      {/* Telefon: başlığın tamamı düğme */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-surface-2 sm:hidden ${
          open ? "border-b border-line" : "rounded-card"
        }`}
      >
        <span className="text-[13px] font-semibold tracking-tight text-ink">
          <span className="mr-1.5 text-ember">{open ? "−" : "+"}</span>
          {title}
        </span>
        <span className="text-xs text-muted">{open ? "Kapat" : "Aç"}</span>
      </button>
      {/* Geniş ekran: normal kart başlığı */}
      <header className="hidden items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:flex">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
      </header>
      <div id={bodyId} className={`${open ? "block" : "hidden"} p-4 sm:block sm:p-5`}>
        {children}
      </div>
    </section>
  );
}
