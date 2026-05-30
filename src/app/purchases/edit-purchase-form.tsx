"use client";

import { useState, useTransition } from "react";
import { updatePurchase, type EditPurchaseItem } from "@/app/actions";
import { formatKurus, tlToKurus } from "@/lib/money";

export type ProductOpt = {
  productId: string;
  name: string;
  units: { packageId: string; unit: string; lastPrice: number | null }[];
};

export type ListItem = {
  id: string;
  productId: string;
  productName: string;
  packageId: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

export type ListPurchase = {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string; // ISO
  documentNo: string | null;
  note: string | null;
  items: ListItem[];
  total: number;
};

type Row = {
  key: string;
  id?: string; // mevcut kalem
  productId: string; // yeni kalemde seçilen ürün
  packageId: string; // seçilen alış birimi
  // mevcut kalemlerde okunur etiket
  label?: string;
  quantity: string;
  price: string; // TL metni (boş = birimin/last fiyatı)
};

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

let rowSeq = 0;
const nextKey = () => `r${rowSeq++}`;

// kuruş → "12,50" (input için)
function kurusToInput(kurus: number): string {
  return (kurus / 100).toFixed(2).replace(".", ",");
}

// Adet metnini sayıya çevir — kg için ondalık olabilir ("2,5" → 2.5)
function toQty(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ISO → yerel datetime-local (yyyy-mm-ddTHH:mm)
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function EditPurchaseForm({
  purchase,
  suppliers,
  products,
  onDone,
}: {
  purchase: ListPurchase;
  suppliers: { id: string; name: string }[];
  products: ProductOpt[];
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState(purchase.supplierId);
  const [date, setDate] = useState(isoToLocal(purchase.date));
  const [note, setNote] = useState(purchase.note ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    purchase.items.map((it) => ({
      key: nextKey(),
      id: it.id,
      productId: it.productId,
      packageId: it.packageId,
      label: `${it.productName} · ${it.unit}`,
      quantity: String(it.quantity),
      price: kurusToInput(it.unitPrice),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.productId, p]));

  function patch(key: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      { key: nextKey(), productId: "", packageId: "", quantity: "1", price: "" },
    ]);
  }

  function unitsOf(productId: string) {
    return productById.get(productId)?.units ?? [];
  }
  function lastPriceOf(packageId: string, productId: string): number | null {
    return unitsOf(productId).find((u) => u.packageId === packageId)?.lastPrice ?? null;
  }

  // Satır birim fiyatı (kuruş) — toplam için
  function rowPrice(r: Row): number | null {
    if (r.price.trim()) {
      try {
        return tlToKurus(r.price);
      } catch {
        return null;
      }
    }
    return lastPriceOf(r.packageId, r.productId);
  }

  const total = rows.reduce((s, r) => {
    const q = toQty(r.quantity);
    const p = rowPrice(r);
    return s + (p != null ? q * p : 0);
  }, 0);

  function save() {
    setError(null);
    if (!supplierId) return setError("Toptancı seçin.");

    const items: EditPurchaseItem[] = [];
    for (const r of rows) {
      const q = toQty(r.quantity);
      if (q <= 0) continue;
      if (!r.packageId) return setError("Her kalem için ürün ve birim seçin.");
      items.push({
        id: r.id,
        productPackageId: r.packageId,
        quantity: q,
        unitPriceTl: r.price,
      });
    }
    if (!items.length) return setError("En az bir kalem gerekli.");

    startTransition(async () => {
      try {
        await updatePurchase({ id: purchase.id, supplierId, date, note, items });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata oluştu");
      }
    });
  }

  return (
    <div className="rounded-lg border border-ember/30 bg-ember-soft/40 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
          Toptancı
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
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
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (opsiyonel)" className={field} />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_140px_72px_120px_28px] items-center gap-2 px-1 text-[11px] uppercase tracking-wider text-muted">
        <span>Ürün</span>
        <span>Birim</span>
        <span>Adet</span>
        <span>Birim fiyat</span>
        <span />
      </div>

      <div className="mt-1 space-y-2">
        {rows.map((row) => {
          const isNew = !row.id;
          const lp = lastPriceOf(row.packageId, row.productId);
          return (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_140px_72px_120px_28px] items-center gap-2">
              {/* Ürün: mevcut kalemde etiket, yeni kalemde seçim */}
              {isNew ? (
                <select
                  value={row.productId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const first = unitsOf(pid)[0];
                    patch(row.key, { productId: pid, packageId: first?.packageId ?? "", price: "" });
                  }}
                  className={field}
                >
                  <option value="">Ürün seç…</option>
                  {products.map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="truncate rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" title={row.label}>
                  {row.label}
                </div>
              )}

              {/* Birim: yeni kalemde seçim, mevcut kalemde sabit etiket */}
              {isNew ? (
                <select
                  value={row.packageId}
                  onChange={(e) => patch(row.key, { packageId: e.target.value, price: "" })}
                  className={field}
                  disabled={!row.productId}
                >
                  {!row.productId && <option value="">—</option>}
                  {unitsOf(row.productId).map((u) => (
                    <option key={u.packageId} value={u.packageId}>
                      {u.unit}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
                  {row.label?.split(" · ")[1] ?? "—"}
                </div>
              )}

              <input
                inputMode="decimal"
                value={row.quantity}
                onChange={(e) => patch(row.key, { quantity: e.target.value })}
                placeholder="Adet"
                title="Adet (kg için ondalık girebilirsiniz, ör. 2,5)"
                className={`${field} nums`}
              />
              <input
                inputMode="decimal"
                value={row.price}
                onChange={(e) => patch(row.key, { price: e.target.value })}
                placeholder={lp != null ? `son ${formatKurus(lp)}` : "Fiyat"}
                className={`${field} nums`}
              />
              <button
                type="button"
                onClick={() => removeRow(row.key)}
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
        onClick={addRow}
        className="mt-2 text-sm font-medium text-ember transition-colors hover:text-ember-bright"
      >
        + Kalem ekle
      </button>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <div className="text-sm text-muted">
          Toplam <span className="nums ml-1 text-base font-semibold text-ink">{formatKurus(total)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            )}
            {pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}
    </div>
  );
}
