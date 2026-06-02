"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  addPackage,
  deleteProduct,
  updateSupplierPackagePrice,
  setDefaultSupplier,
} from "@/app/actions";
import { Badge, inputClass } from "@/components/ui";
import { SubmitButton, DeleteButton } from "@/components/form";
import type { ProductDetail } from "./product-list";

type Cell = { price: number; prevPrice: number | null; date: string; source: string };
type SupplierCol = { id: string; name: string; isDefault: boolean };

const kurusToInput = (k: number) => (k / 100).toFixed(2).replace(".", ",");
// Birim başı fiyat (kuruş): paket fiyatı / paketteki baz birim sayısı.
const perBaseKurus = (price: number, quantityInBase: number) =>
  price / (quantityInBase || 1);

// Bir toptancının bu birimdeki fiyatının önceki fiyata göre yönü.
function PriceTrend({ price, prevPrice }: { price: number; prevPrice: number | null }) {
  if (prevPrice == null || prevPrice <= 0)
    return <span className="text-muted">yeni fiyat</span>;
  if (price > prevPrice)
    return (
      <span className="text-debt">
        ▲ %{(((price - prevPrice) / prevPrice) * 100).toFixed(1)} zam
      </span>
    );
  if (price < prevPrice)
    return (
      <span className="text-credit">
        ▼ %{(((prevPrice - price) / prevPrice) * 100).toFixed(1)} indirim
      </span>
    );
  return <span className="text-muted">değişmedi</span>;
}

// Tek bir toptancının, tek bir birimdeki fiyat satırı. Fiyat doğrudan satırdaki
// input'tan düzenlenir; Kaydet ya da Enter yalnızca bu toptancıya yazar.
function SupplierPriceRow({
  packageId,
  supplier,
  cell,
  isCheapest,
  quantityInBase,
  baseUnit,
}: {
  packageId: string;
  supplier: SupplierCol;
  cell: Cell;
  isCheapest: boolean;
  quantityInBase: number;
  baseUnit: string;
}) {
  return (
    <form
      action={updateSupplierPackagePrice}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        isCheapest ? "bg-credit-soft/60" : "hover:bg-surface-2"
      }`}
    >
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="supplierId" value={supplier.id} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/suppliers/${supplier.id}`}
            className="truncate font-medium text-ink transition-colors hover:text-ember"
          >
            {supplier.name}
          </Link>
          {supplier.isDefault && (
            <span className="text-ember" title="Varsayılan toptancı">
              ★
            </span>
          )}
          {isCheapest && (
            <span className="rounded-full bg-credit-soft px-1.5 py-0.5 text-[10px] font-semibold text-credit">
              en ucuz
            </span>
          )}
        </div>
        <div className="nums mt-0.5 text-[10px] text-muted">
          {formatDate(cell.date)}
          {cell.source === "MANUAL" ? " · elle" : ""}
          {quantityInBase > 1 && (
            <>
              {" · "}
              <span className="font-medium text-ink-soft">
                {formatKurus(Math.round(perBaseKurus(cell.price, quantityInBase)))}/{baseUnit}
              </span>
            </>
          )}{" "}
          · <PriceTrend price={cell.price} prevPrice={cell.prevPrice} />
        </div>
      </div>

      <input
        name="price"
        inputMode="decimal"
        defaultValue={kurusToInput(cell.price)}
        aria-label={`${supplier.name} fiyatı (TL)`}
        className={`nums w-24 rounded-md border border-line bg-surface px-2 py-1 text-right font-semibold outline-none focus:border-ember focus:ring-2 focus:ring-ember/15 ${
          isCheapest ? "text-credit" : "text-ink"
        }`}
      />
      <span className="text-xs text-muted">₺</span>
      <SubmitButton variant="ghost" className="px-2.5! py-1! text-xs!">
        Kaydet
      </SubmitButton>
    </form>
  );
}

// Bu birimde henüz fiyatı olmayan bir toptancı için fiyat ekle.
function AddSupplierPrice({
  packageId,
  options,
}: {
  packageId: string;
  options: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-1.5 text-left text-xs font-medium text-ember transition-colors hover:bg-ember-soft"
      >
        + toptancı fiyatı ekle
      </button>
    );

  return (
    <form
      action={updateSupplierPackagePrice}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2"
    >
      <input type="hidden" name="packageId" value={packageId} />
      <select name="supplierId" required defaultValue="" className={`${inputClass} w-40`}>
        <option value="" disabled>
          Toptancı seç…
        </option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        name="price"
        inputMode="decimal"
        required
        placeholder="Fiyat"
        aria-label="Fiyat (TL)"
        className="nums w-24 rounded-md border border-line bg-surface px-2 py-1 text-right text-ink outline-none focus:border-ember focus:ring-2 focus:ring-ember/15"
      />
      <span className="text-xs text-muted">₺</span>
      <SubmitButton variant="ghost" className="px-2.5! py-1! text-xs!">
        Ekle
      </SubmitButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:text-ink"
        aria-label="Vazgeç"
      >
        ✕
      </button>
    </form>
  );
}

// Bir birim (paket) kartı: o birimi satan toptancılar fiyata göre sıralı,
// en ucuz üstte ve işaretli. Boş birim ya da hiç fiyatı olmayan birim için
// uygun boş durumlar gösterilir.
function UnitCard({
  unit,
  baseUnit,
  suppliers,
  allSuppliers,
}: {
  unit: ProductDetail["units"][number];
  baseUnit: string;
  suppliers: SupplierCol[];
  allSuppliers: { id: string; name: string }[];
}) {
  // Bu birimde fiyatı olan toptancılar (ucuzdan pahalıya).
  const priced = suppliers
    .map((s) => ({ supplier: s, cell: unit.cells[s.id] }))
    .filter((r): r is { supplier: SupplierCol; cell: Cell } => r.cell != null)
    .sort((a, b) => a.cell.price - b.cell.price);
  const cheapestPrice = priced.length ? priced[0].cell.price : null;
  const showCheapest = priced.length > 1;
  // Bu birimde henüz fiyatı olmayan toptancılar (eklenebilir).
  const unpriced = allSuppliers.filter((s) => !unit.cells[s.id]);

  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          {unit.name}
          <span className="ml-1.5 text-xs font-normal text-muted">
            {unit.quantityInBase} {baseUnit}
          </span>
        </h3>
        {cheapestPrice != null && showCheapest && (
          <span className="text-xs text-muted">
            en ucuz{" "}
            <span className="font-semibold text-credit">
              {formatKurus(cheapestPrice)}
            </span>{" "}
            · {priced[0].supplier.name}
          </span>
        )}
      </header>

      <div className="space-y-1 p-2">
        {priced.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs text-muted">
            Bu birim için henüz fiyat yok. Aşağıdan bir toptancı fiyatı ekleyin.
          </p>
        ) : (
          priced.map(({ supplier, cell }) => (
            <SupplierPriceRow
              key={supplier.id}
              packageId={unit.packageId}
              supplier={supplier}
              cell={cell}
              isCheapest={showCheapest && cell.price === cheapestPrice}
              quantityInBase={unit.quantityInBase}
              baseUnit={baseUnit}
            />
          ))
        )}
        <AddSupplierPrice packageId={unit.packageId} options={unpriced} />
      </div>

      {unit.history.length > 0 && (
        <details className="border-t border-line px-4 py-2">
          <summary className="cursor-pointer select-none text-xs text-muted transition-colors hover:text-ember">
            Fiyat geçmişi ({unit.history.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {unit.history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="nums">{formatDate(h.date)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      h.source === "MANUAL"
                        ? "bg-ember-soft text-ember"
                        : "bg-surface-2 text-ink-soft"
                    }`}
                  >
                    {h.source === "MANUAL" ? "elle" : "alış"}
                  </span>
                  {h.supplierName && <span>· {h.supplierName}</span>}
                </span>
                <span className="nums font-medium text-ink-soft">
                  {formatKurus(h.price)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function ProductModal({
  product,
  allSuppliers,
  onClose,
}: {
  product: ProductDetail;
  allSuppliers: { id: string; name: string }[];
  onClose: () => void;
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

  const { suppliers, units } = product;

  // Tüm birim/toptancı seçenekleri içinde EN UCUZ birim başı (₺/baz birim) hangisi?
  // Koli vs Adet gibi farklı paketleri adil kıyaslar; "neyi kimden alayım"ı yanıtlar.
  let best: { perBase: number; supplierName: string; unitName: string } | null = null;
  for (const u of units) {
    for (const s of suppliers) {
      const c = u.cells[s.id];
      if (!c) continue;
      const pb = perBaseKurus(c.price, u.quantityInBase);
      if (!best || pb < best.perBase) {
        best = { perBase: pb, supplierName: s.name, unitName: u.name };
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} detayı`}
    >
      <div
        className="my-auto w-full max-w-2xl rounded-card border border-line bg-paper shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {product.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{product.baseUnit}</Badge>
              <span className="text-xs text-muted">
                {units.length} birim · {suppliers.length} toptancı
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="space-y-5 p-6">
          {/* En ucuz birim başı seçenek — birim/toptancı farkı gözetmeden */}
          {best && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-credit/20 bg-credit-soft/60 px-4 py-2.5 text-sm">
              <span className="font-medium text-credit">En ucuz birim başı</span>
              <span className="nums text-base font-semibold text-credit">
                {formatKurus(Math.round(best.perBase))}/{product.baseUnit}
              </span>
              <span className="text-muted">
                · {best.supplierName} · {best.unitName}
              </span>
            </div>
          )}

          {/* Varsayılan toptancı: yeni alışta otomatik dolan fiyatın sahibi */}
          <form
            action={setDefaultSupplier}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm shadow-card"
          >
            <input type="hidden" name="productId" value={product.id} />
            <label htmlFor="defaultSupplier" className="text-xs font-medium text-muted">
              Varsayılan toptancı
            </label>
            <select
              id="defaultSupplier"
              name="supplierId"
              defaultValue={suppliers.find((s) => s.isDefault)?.id ?? ""}
              disabled={suppliers.length === 0}
              className={`${inputClass} w-48`}
            >
              <option value="">— Yok —</option>
              {/* Yalnızca bu ürünün fiyatı olan toptancılar varsayılan olabilir */}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <SubmitButton variant="ghost" className="px-3! py-1.5! text-xs!">
              Kaydet
            </SubmitButton>
            <span className="text-[11px] text-muted">
              ★ ile işaretlenir · alış formunda fiyatı öne çıkar
            </span>
          </form>

          {/* Birimler — her birim bir kart, içinde toptancılar fiyata göre sıralı */}
          {units.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
              Henüz birim yok. Aşağıdan bir alış birimi (Koli, Adet…) ekleyin.
            </p>
          ) : (
            <div className="space-y-4">
              {units.map((u) => (
                <UnitCard
                  key={u.packageId}
                  unit={u}
                  baseUnit={product.baseUnit}
                  suppliers={suppliers}
                  allSuppliers={allSuppliers}
                />
              ))}
            </div>
          )}

          {/* Yeni alış birimi ekle */}
          <form
            action={addPackage}
            className="grid grid-cols-1 gap-2 rounded-lg bg-surface p-3 shadow-card sm:grid-cols-[2fr_1fr_auto]"
          >
            <input type="hidden" name="productId" value={product.id} />
            <input
              name="name"
              required
              placeholder="Yeni birim (Koli, Adet…) *"
              className={inputClass}
            />
            <input
              name="quantityInBase"
              type="number"
              min="1"
              defaultValue="1"
              title={`Kaç ${product.baseUnit}'e denk`}
              aria-label={`Kaç ${product.baseUnit}`}
              className={inputClass}
            />
            <SubmitButton variant="ghost">+ Birim</SubmitButton>
          </form>

          {/* Tehlikeli: ürünü sil */}
          <div className="flex justify-end border-t border-line pt-4">
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <DeleteButton label="Ürünü sil" />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
