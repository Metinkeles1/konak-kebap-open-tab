"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/* Server action formlarında bekleme durumunu gösteren gönder butonu */
export function SubmitButton({
  children,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "accent" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary:
      "bg-ink text-paper hover:bg-ink-soft disabled:bg-ink-soft/60",
    accent:
      "bg-ember text-white hover:bg-ember-bright disabled:bg-ember/60",
    ghost:
      "border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-60",
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {pending && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/* Küçük tehlikeli "sil" butonu (formun içinde) */
export function DeleteButton({ label = "Sil" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-debt-soft hover:text-debt disabled:opacity-50"
      title={label}
    >
      {pending ? "…" : label}
    </button>
  );
}
