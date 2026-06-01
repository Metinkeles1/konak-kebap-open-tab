"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProduct } from "@/app/actions";
import { inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";

// Alış birimi önerileri (sınırlayıcı değil — istediğini yazabilirsin)
const UNIT_SUGGESTIONS = ["Adet", "Koli", "Kasa", "Paket", "Balya", "Kg", "Gram", "Litre", "ML", "Çuval", "Teneke", "Rulo"];

type State = { error: string | null; ok: number };

export function NewProductForm({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    async (_prev: State, fd: FormData): Promise<State> => {
      try {
        await createProduct(fd);
        return { error: null, ok: Date.now() };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Hata oluştu", ok: 0 };
      }
    },
    { error: null, ok: 0 },
  );

  // Başarılı eklemede formu temizle
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const label = "flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted";

  return (
    <>
      <form
        ref={formRef}
        action={action}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1.3fr_1fr_auto] lg:items-end"
      >
        <label className={label}>
          Ürün adı
          <input name="name" required placeholder="ör. Dana Kıyma" className={inputClass} />
        </label>
        <label className={label}>
          Toptancı
          <select name="supplierId" defaultValue="" className={inputClass}>
            <option value="">Opsiyonel</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Alış birimi
          <input name="unit" list="unit-suggestions" placeholder="Koli, Kg, Balya…" className={inputClass} />
        </label>
        <label className={label}>
          Fiyat (TL)
          <input name="price" inputMode="decimal" placeholder="Opsiyonel" className={inputClass} />
        </label>
        <SubmitButton variant="accent">Ürün ekle</SubmitButton>
        <datalist id="unit-suggestions">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </form>

      {state.error && (
        <p className="mt-2.5 rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">{state.error}</p>
      )}

      <p className="mt-2.5 text-xs text-muted">
        Alış birimi = ürünü nasıl satın aldığın (Koli, Kg, Balya…). Aynı ürünü <strong>farklı bir
        toptancı</strong> seçip tekrar eklersen, o toptancının fiyatı da ürünün karşılaştırmasına eklenir
        (aynı toptancıda tekrar eklenemez).
      </p>
    </>
  );
}
