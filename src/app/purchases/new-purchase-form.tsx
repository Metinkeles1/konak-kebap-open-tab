"use client";

import { useState, useTransition } from "react";
import { createPurchase, type NewPurchaseItem } from "@/app/actions";
import { formatKurus, tlToKurus } from "@/lib/money";

type SupplierOpt = { id: string; name: string };
type Unit = { packageId: string; unit: string; lastPrice: number | null };
export type CatalogProduct = { productId: string; name: string; units: Unit[] };
type Catalog = Record<string, CatalogProduct[]>;

type Row = {
  query: string;
  productId: string | null; // mevcut ürün seçildiyse
  isNewProduct: boolean; // tamamen yeni ürün
  unitChoice: string; // "pkg:<id>" | "__new__" | ""
  unitText: string; // serbest birim adı (yeni birim/yeni ürün)
  quantity: string;
  price: string;
  open: boolean;
};

// Sadece öneri (datalist) — sınırlayıcı değil, istediğin birimi yazabilirsin.
const UNIT_SUGGESTIONS = ["Adet", "Koli", "Kasa", "Paket", "Balya", "Kg", "Gram", "Litre", "ML", "Çuval", "Teneke", "Rulo"];

const newRow = (): Row => ({
  query: "",
  productId: null,
  isNewProduct: false,
  unitChoice: "",
  unitText: "",
  quantity: "1",
  price: "",
  open: false,
});

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.trim().toLocaleLowerCase("tr");

// Adet metnini sayıya çevir — kg için ondalık olabilir ("2,5" → 2.5)
const toQty = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Yerel saate göre şimdi (yyyy-mm-ddTHH:mm) — input[type=datetime-local] için.
function nowLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function NewPurchaseForm({
  suppliers,
  catalog,
}: {
  suppliers: SupplierOpt[];
  catalog: Catalog;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(nowLocal());
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const products = supplierId ? catalog[supplierId] ?? [] : [];

  const findProduct = (row: Row) => products.find((p) => p.productId === row.productId);
  function selectedPkg(row: Row): Unit | undefined {
    if (!row.unitChoice.startsWith("pkg:")) return undefined;
    return findProduct(row)?.units.find((u) => `pkg:${u.packageId}` === row.unitChoice);
  }
  function rowPriceKurus(row: Row): number | null {
    if (row.price.trim()) {
      try {
        return tlToKurus(row.price);
      } catch {
        return null;
      }
    }
    return selectedPkg(row)?.lastPrice ?? null;
  }

  const total = rows.reduce((sum, r) => {
    const qty = toQty(r.quantity);
    const price = rowPriceKurus(r);
    return sum + (price != null ? qty * price : 0);
  }, 0);

  function patch(idx: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  }

  function changeSupplier(id: string) {
    setSupplierId(id);
    setRows([newRow()]);
    setError(null);
  }

  function pickProduct(idx: number, product: CatalogProduct) {
    patch(idx, {
      productId: product.productId,
      query: product.name,
      isNewProduct: false,
      unitChoice: product.units[0] ? `pkg:${product.units[0].packageId}` : "__new__",
      unitText: "",
      open: false,
      price: "",
    });
  }
  function pickNewProduct(idx: number) {
    patch(idx, { isNewProduct: true, productId: null, unitChoice: "", unitText: "", open: false, price: "" });
  }

  function submit() {
    setError(null);
    if (!supplierId) return setError("Önce toptancı seçin.");

    const payload: NewPurchaseItem[] = [];
    for (const r of rows) {
      const qty = toQty(r.quantity);
      if (qty <= 0) continue;

      if (r.isNewProduct) {
        if (!r.query.trim()) continue;
        if (!r.price.trim()) return setError(`'${r.query.trim()}' için fiyat girin.`);
        payload.push({ kind: "new", name: r.query.trim(), unit: r.unitText.trim() || "Adet", quantity: qty, unitPriceTl: r.price });
      } else if (r.productId) {
        if (r.unitChoice.startsWith("pkg:")) {
          payload.push({ kind: "existing", productPackageId: r.unitChoice.slice(4), quantity: qty, unitPriceTl: r.price });
        } else if (r.unitChoice === "__new__") {
          if (!r.unitText.trim()) return setError(`'${r.query}' için birim adı yazın (ör. Koli).`);
          if (!r.price.trim()) return setError(`'${r.query}' · ${r.unitText.trim()} için fiyat girin.`);
          payload.push({ kind: "newUnit", productId: r.productId, unit: r.unitText.trim(), quantity: qty, unitPriceTl: r.price });
        }
      }
    }
    if (!payload.length) return setError("En az bir kalem ekleyin.");

    startTransition(async () => {
      try {
        await createPurchase({ supplierId, note, date, items: payload });
        setRows([newRow()]);
        setNote("");
        setDate(nowLocal());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata oluştu");
      }
    });
  }

  return (
    <div className="rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(31,26,22,0.04),0_8px_24px_-12px_rgba(31,26,22,0.08)]">
      <header className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Yeni alış</h2>
      </header>

      <datalist id="unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="space-y-4 p-5">
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
          Toptancı
          <select value={supplierId} onChange={(e) => changeSupplier(e.target.value)} className={field}>
            <option value="">Toptancı seçin…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* Alış tarihi (dakikasına kadar) ve not yan yana. Fatura no otomatik atanır. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Alış tarihi
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${field} nums`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Not
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opsiyonel"
              className={field}
            />
          </label>
        </div>

        {!supplierId ? (
          <p className="rounded-lg bg-surface-2 px-3 py-6 text-center text-sm text-muted">
            Kalem eklemek için önce toptancı seçin.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_140px_72px_120px_28px] items-center gap-2 px-1 text-[11px] uppercase tracking-wider text-muted">
              <span>Ürün</span>
              <span>Birim</span>
              <span>Adet</span>
              <span>Birim fiyat</span>
              <span />
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => {
                const q = lc(row.query);
                const matches = q ? products.filter((p) => lc(p.name).includes(q)) : products;
                const exact = products.some((p) => lc(p.name) === q);
                const product = findProduct(row);
                const pkg = selectedPkg(row);
                const unitActive = row.isNewProduct || !!row.productId;
                const freeUnit = row.isNewProduct || row.unitChoice === "__new__";

                return (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_140px_72px_120px_28px] items-center gap-2">
                    {/* Ürün combobox */}
                    <div className="relative">
                      <input
                        value={row.query}
                        onChange={(e) =>
                          patch(idx, { query: e.target.value, productId: null, isNewProduct: false, unitChoice: "", open: true })
                        }
                        onFocus={() => patch(idx, { open: true })}
                        onBlur={() => setTimeout(() => patch(idx, { open: false }), 150)}
                        placeholder="Ürün ara veya yaz…"
                        className={`${field} ${row.isNewProduct ? "border-ember ring-2 ring-ember/15" : ""}`}
                      />
                      {row.isNewProduct && (
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-ember-soft px-1.5 py-0.5 text-[10px] font-medium text-ember">
                          yeni
                        </span>
                      )}

                      {row.open && (
                        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
                          {matches.map((p) => (
                            <li key={p.productId}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickProduct(idx, p)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                              >
                                <span className="truncate text-ink">{p.name}</span>
                                <span className="shrink-0 text-xs text-muted">{p.units.map((u) => u.unit).join(", ")}</span>
                              </button>
                            </li>
                          ))}
                          {row.query.trim() && !exact && (
                            <li className="border-t border-line">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => pickNewProduct(idx)}
                                className="w-full px-3 py-2 text-left text-sm font-medium text-ember hover:bg-ember-soft"
                              >
                                + “{row.query.trim()}” yeni ürün
                              </button>
                            </li>
                          )}
                          {!products.length && (
                            <li className="px-3 py-2 text-xs text-muted">
                              Bu toptancıda kayıtlı ürün yok — yazıp ekleyin.
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    {/* Birim — mevcut birimi seç ya da "+ Yeni birim…" ile serbest yaz */}
                    {!unitActive ? (
                      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">—</div>
                    ) : freeUnit ? (
                      <input
                        list="unit-suggestions"
                        value={row.unitText}
                        onChange={(e) => patch(idx, { unitText: e.target.value })}
                        placeholder="Birim (Koli…)"
                        className={`${field} border-ember/60`}
                        title="Yeni birim adı"
                      />
                    ) : (
                      <select
                        value={row.unitChoice}
                        onChange={(e) =>
                          patch(idx, {
                            unitChoice: e.target.value,
                            unitText: "",
                            price: "",
                          })
                        }
                        className={field}
                        title="Alış birimi"
                      >
                        {product?.units.map((u) => (
                          <option key={u.packageId} value={`pkg:${u.packageId}`}>
                            {u.unit}
                          </option>
                        ))}
                        <option value="__new__">+ Yeni birim…</option>
                      </select>
                    )}

                    <input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => patch(idx, { quantity: e.target.value })}
                      placeholder="Adet"
                      title="Adet (kg için ondalık girebilirsiniz, ör. 2,5)"
                      className={`${field} nums`}
                    />
                    <input
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => patch(idx, { price: e.target.value })}
                      placeholder={pkg?.lastPrice != null ? `son ${formatKurus(pkg.lastPrice)}` : freeUnit ? "Fiyat *" : "Fiyat"}
                      className={`${field} nums`}
                    />
                    <button
                      type="button"
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : [newRow()]))}
                      className="grid h-9 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-debt-soft hover:text-debt"
                      title="Kalemi kaldır"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, newRow()])}
              className="text-sm font-medium text-ember transition-colors hover:text-ember-bright"
            >
              + Kalem ekle
            </button>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <div className="text-sm text-muted">
                Toplam <span className="nums ml-1 text-lg font-semibold text-ink">{formatKurus(total)}</span>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                )}
                {pending ? "Kaydediliyor…" : "Alışı kaydet"}
              </button>
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}
      </div>
    </div>
  );
}
