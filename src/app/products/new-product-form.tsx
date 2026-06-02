"use client";

import { useActionState, useRef, useState } from "react";
import { createProduct } from "@/app/actions";
import { inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { isPackagingUnit } from "@/lib/units";

// Alış birimi önerileri (sınırlayıcı değil — istediğini yazabilirsin)
const UNIT_SUGGESTIONS = ["Adet", "Koli", "Kasa", "Paket", "Balya", "Kg", "Gram", "Litre", "ML", "Çuval", "Teneke", "Rulo"];

type State = { error: string | null; ok: number };

export function NewProductForm({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [unit, setUnit] = useState(""); // alış birimi — paketse içindeki adet sorulur
  const [state, action] = useActionState(
    async (_prev: State, fd: FormData): Promise<State> => {
      try {
        await createProduct(fd);
        // Başarılı eklemede formu temizle (uncontrolled alanlar + birim state'i)
        formRef.current?.reset();
        setUnit("");
        return { error: null, ok: Date.now() };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Hata oluştu", ok: 0 };
      }
    },
    { error: null, ok: 0 },
  );

  const label = "flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted";

  return (
    <>
      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className={`${label} sm:min-w-45 sm:flex-2`}>
          Ürün adı
          <input name="name" required placeholder="ör. Dana Kıyma" className={inputClass} />
        </label>
        <label className={`${label} sm:min-w-35 sm:flex-1`}>
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
        <label className={`${label} sm:min-w-30 sm:flex-1`}>
          Alış birimi
          <input
            name="unit"
            list="unit-suggestions"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Koli, Kg, Balya…"
            className={inputClass}
          />
        </label>
        {/* İçindeki adet yalnızca Koli/Kasa gibi paket birimlerde sorulur */}
        {isPackagingUnit(unit) && (
          <label className={`${label} sm:min-w-30 sm:flex-1`}>
            1 {unit.trim()} = kaç adet?
            <input
              name="quantityInBase"
              type="number"
              min="1"
              placeholder="ör. 24"
              title="Bu paket kaç tek birim içerir. Her ürünün kolisi farklı olabilir. Boş = 1."
              className={inputClass}
            />
          </label>
        )}
        <label className={`${label} sm:min-w-28 sm:flex-1`}>
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
