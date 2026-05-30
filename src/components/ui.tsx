import Link from "next/link";
import type { ReactNode } from "react";
import { formatKurus } from "@/lib/money";

/* Form alanları için ortak stil */
export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

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
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* Kart kabı */
export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(31,26,22,0.04),0_8px_24px_-12px_rgba(31,26,22,0.08)] ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName || "p-5"}>{children}</div>
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
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(31,26,22,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {label}
        </p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p
        className={`nums mt-3 font-display text-[28px] font-semibold leading-none ${valueColor}`}
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
