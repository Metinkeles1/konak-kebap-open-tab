import Link from "next/link";
import type { ReactNode } from "react";
import { formatKurus } from "@/lib/money";

/* Form alanları için ortak stil.
   Mobilde 16px (text-base): iOS Safari 16px'ten küçük yazılı bir alana odaklanınca
   sayfayı zorla yakınlaştırıyor ve geri uzaklaştırmıyordu. Geniş ekranda 14px. */
export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink sm:text-sm placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

/* Sayfa başlığı + opsiyonel aksiyon */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[34px] sm:leading-none">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted sm:mt-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* Kart kabı */
export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Gövde sınıfı; verilmezse "p-5". "" = dolgusuz (içerik kendi dolgusunu taşır). */
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {action}
        </header>
      )}
      {/* `??`: boş metin "dolgusuz" demektir. Eskiden `||` kullanılıyordu ve ""
          yine p-5'e düşüyordu — tablolar/listeler her yandan 20px kayıp veriyordu. */}
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </section>
  );
}

/* KPI kartı */
export function Stat({
  label,
  value,
  hint,
  tone = "ink",
  icon,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "ink" | "debt" | "credit" | "ember";
  icon?: ReactNode;
}) {
  const valueColor =
    tone === "debt"
      ? "text-debt"
      : tone === "credit"
        ? "text-credit"
        : tone === "ember"
          ? "text-ember"
          : "text-ink";
  const accent =
    tone === "debt"
      ? "bg-debt/70"
      : tone === "credit"
        ? "bg-credit/70"
        : tone === "ember"
          ? "bg-ember/70"
          : "";
  // Değer kartın genişliğine sığacak şekilde küçülür (en çok 30px). Telefonda iki
  // sütunlu ızgarada "₺212.369,00" 30px'te kartın dışına taşıp kesiliyordu —
  // uygulamanın en önemli rakamı (toplam borç) okunmuyordu. 100cqi = kartın iç
  // genişliği; karakter başına ~0,64em (serif rakam + ₺) ile bölünür.
  const fitSize = `min(30px, calc(100cqi / ${(Math.max(value.length, 4) * 0.64).toFixed(2)}))`;
  return (
    <div className="@container relative overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card hover-lift sm:p-5">
      {accent && <span className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted sm:text-[11px] sm:tracking-[0.14em]">
          {label}
        </p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p
        // text-[18px] sm:text-[24px]: `cqi` desteklemeyen eski tarayıcılar (iOS < 16)
        // satır içi stili yok sayar; o zaman bu güvenli boyut kullanılır.
        className={`nums mt-2.5 whitespace-nowrap font-display text-[18px] font-semibold leading-none sm:mt-3 sm:text-[24px] ${valueColor}`}
        style={{ fontSize: fitSize }}
      >
        {value}
      </p>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/* Para — kuruş → ₺, işarete göre renk */
export function Money({
  kurus,
  colored = false,
  className = "",
}: {
  kurus: number;
  colored?: boolean;
  className?: string;
}) {
  const color = !colored
    ? "text-ink"
    : kurus > 0
      ? "text-debt"
      : kurus < 0
        ? "text-credit"
        : "text-muted";
  return (
    <span className={`nums font-medium ${color} ${className}`}>
      {formatKurus(kurus)}
    </span>
  );
}

/* Rozet */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "debt" | "credit" | "ember";
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-soft border-line",
    debt: "bg-debt-soft text-debt border-debt/20",
    credit: "bg-credit-soft text-credit border-credit/20",
    ember: "bg-ember-soft text-ember border-ember/20",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* Boş durum */
export function EmptyState({
  title,
  hint,
  cta,
}: {
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-display text-base text-ink-soft">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ember-bright"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
