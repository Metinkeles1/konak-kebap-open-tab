"use client";

import { useId, useRef, useState } from "react";
import { createPayment } from "@/app/actions";
import { formatKurus, kurusToInput } from "@/lib/money";
import { inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";

/* Başlıktaki "Ödeme ekle" düğmesi + açılır pencere (telefonda alttan çekmece) */
export function PaymentDialog({
  supplierId,
  supplierName,
  balance,
}: {
  supplierId: string;
  supplierName: string;
  balance: number; // kuruş
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const amountId = useId();
  const [error, setError] = useState<string | null>(null);

  function open() {
    formRef.current?.reset();
    setError(null);
    dialogRef.current?.showModal();
    amountRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function submit(fd: FormData) {
    // Hata fırlatılmaz, değer olarak döner (bkz. actions.ts ActionResult) —
    // geçersiz tutarda sebebi pencerede gösterilir.
    const res = await createPayment(fd);
    if (res.ok) close();
    else setError(`${res.error} — örnek: 1500 veya 1500,50`);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ember px-4 py-2.5 text-sm font-medium text-white shadow-card transition-colors hover:bg-ember-bright active:bg-ember-bright sm:py-2"
      >
        <span className="text-base leading-none">+</span> Ödeme ekle
      </button>

      <dialog
        ref={dialogRef}
        // Arka plana tıklayınca kapat
        onClick={(e) => e.target === dialogRef.current && close()}
        className="m-0 mt-auto w-full max-w-none rounded-t-card border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-espresso/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-md sm:rounded-card"
      >
        <form ref={formRef} action={submit}>
          <input type="hidden" name="supplierId" value={supplierId} />

          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Ödeme ekle</h2>
              <p className="mt-0.5 text-xs text-muted">{supplierName}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Kapat"
              className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink"
            >
              ×
            </button>
          </header>

          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3 text-sm">
              <span className="text-muted">Kalan borç</span>
              <span className={`nums font-semibold ${balance > 0 ? "text-debt" : "text-credit"}`}>
                {formatKurus(balance)}
              </span>
            </div>

            {/* label yalnızca metni sarar; içine düğme koyarsak label o düğmeye bağlanır */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-soft">
                <label htmlFor={amountId}>Tutar (TL) *</label>
                {balance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (amountRef.current) amountRef.current.value = kurusToInput(balance);
                    }}
                    className="font-medium text-ember hover:text-ember-bright"
                  >
                    Borcun tamamı
                  </button>
                )}
              </div>
              <input
                ref={amountRef}
                id={amountId}
                name="amount"
                required
                inputMode="decimal"
                placeholder="0,00"
                className={`${inputClass} nums py-3 text-lg`}
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink-soft">Ödeme yöntemi</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[
                  ["NAKIT", "Nakit"],
                  ["HAVALE", "Havale"],
                  ["KART", "Kart"],
                  ["CEK", "Çek"],
                  ["DIGER", "Diğer"],
                ].map(([value, label]) => (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="method"
                      value={value}
                      defaultChecked={value === "NAKIT"}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg border border-line px-2 py-2 text-center text-sm text-ink-soft transition-colors hover:bg-surface-2 peer-checked:border-ember peer-checked:bg-ember-soft peer-checked:font-medium peer-checked:text-ember peer-focus-visible:ring-2 peer-focus-visible:ring-ember/30">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-soft">Not</span>
              <input name="note" placeholder="İsteğe bağlı" className={inputClass} />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">
                {error}
              </p>
            )}
          </div>

          <footer className="flex gap-3 border-t border-line px-5 py-4">
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
            >
              Vazgeç
            </button>
            <SubmitButton variant="accent" className="flex-2">
              Ödemeyi kaydet
            </SubmitButton>
          </footer>
        </form>
      </dialog>
    </>
  );
}
