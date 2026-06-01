"use client";

import { useEffect } from "react";
import Link from "next/link";
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  addPackage,
  deleteProduct,
  updatePackagePrice,
  applyProportionalPrice,
} from "@/app/actions";
import { Badge, inputClass } from "@/components/ui";
import { TrendDelta } from "@/components/charts";
import { SubmitButton, DeleteButton } from "@/components/form";
import type { ProductDetail } from "./product-list";

export function ProductModal({
  product,
  onClose,
}: {
  product: ProductDetail;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} detayı`}
    >
      <div
        className="my-auto w-full max-w-3xl rounded-card border border-line bg-paper shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {product.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{product.baseUnit}</Badge>
              {product.defaultSupplierName && (
                <Badge tone="ember">Varsayılan: {product.defaultSupplierName}</Badge>
              )}
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

        <div className="space-y-6 p-6">
          {/* Toptancılarda fiyat */}
          <section className="rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-[13px] font-semibold tracking-tight text-ink">
                Toptancılarda fiyat
              </h3>
            </div>
            {suppliers.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">
                Henüz toptancı bazında fiyat yok. Bu ürünü bir alışa eklediğinde
                hangi toptancıda ne fiyata olduğu burada görünür.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-5 py-3 font-medium">Birim</th>
                      {suppliers.map((s) => (
                        <th key={s.id} className="px-5 py-3 text-right font-medium">
                          <Link
                            href={`/suppliers/${s.id}`}
                            className="transition-colors hover:text-ember"
                          >
                            {s.name}
                          </Link>
                          {s.isDefault && <span className="ml-1 text-ember">★</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {units.map((u) => {
                      const present = suppliers
                        .map((s) => u.cells[s.id]?.price)
                        .filter((v): v is number => v != null);
                      const cheapest = present.length ? Math.min(...present) : null;
                      return (
                        <tr key={u.packageId} className="align-top hover:bg-surface-2">
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-ink">{u.name}</span>
                            <span className="ml-1 text-xs text-muted">
                              · {u.quantityInBase} {product.baseUnit}
                            </span>
                          </td>
                          {suppliers.map((s) => {
                            const c = u.cells[s.id];
                            const isCheapest =
                              c != null &&
                              cheapest != null &&
                              c.price === cheapest &&
                              present.length > 1;
                            return (
                              <td key={s.id} className="px-5 py-3.5 text-right">
                                {c ? (
                                  <>
                                    <span
                                      className={`nums font-semibold ${isCheapest ? "text-credit" : "text-ink"}`}
                                    >
                                      {formatKurus(c.price)}
                                      {isCheapest && (
                                        <span className="ml-1 text-[10px] font-medium">
                                          en ucuz
                                        </span>
                                      )}
                                    </span>
                                    <span className="nums flex items-center justify-end gap-1.5 text-[11px] text-muted">
                                      {formatDate(c.date)}
                                      {c.source === "MANUAL" ? " · elle" : ""}
                                      {c.prevPrice != null && c.prevPrice > 0 && (
                                        <TrendDelta
                                          pct={((c.price - c.prevPrice) / c.prevPrice) * 100}
                                        />
                                      )}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Birimler & fiyat yönetimi */}
          <section className="rounded-card border border-line bg-surface p-5 shadow-card">
            <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-ink">
              Birimler & fiyat yönetimi
            </h3>
            {units.length > 0 && (
              <ul className="space-y-2">
                {units.map((u) => (
                  <li key={u.packageId} className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-ink">
                        {u.name}{" "}
                        <span className="text-muted">
                          · {u.quantityInBase} {product.baseUnit}
                        </span>
                      </span>
                      <form
                        action={updatePackagePrice}
                        className="flex shrink-0 items-center gap-1.5"
                      >
                        <input type="hidden" name="packageId" value={u.packageId} />
                        <input
                          name="price"
                          inputMode="decimal"
                          defaultValue={
                            u.lastUnitPrice != null
                              ? (u.lastUnitPrice / 100).toFixed(2).replace(".", ",")
                              : ""
                          }
                          placeholder="Fiyat"
                          aria-label={`${u.name} birim fiyatı (TL)`}
                          className="nums w-24 rounded-md border border-line bg-surface px-2 py-1 text-right text-ink outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15"
                        />
                        <span className="text-xs text-muted">₺</span>
                        <SubmitButton variant="ghost" className="px-2.5! py-1! text-xs!">
                          Kaydet
                        </SubmitButton>
                        {units.length > 1 && (
                          <button
                            type="submit"
                            formAction={applyProportionalPrice}
                            title="Bu fiyatı baz alıp diğer birimleri quantityInBase oranıyla güncelle"
                            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-ember-soft hover:text-ember"
                          >
                            Orantıla
                          </button>
                        )}
                      </form>
                    </div>

                    {u.history.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer select-none text-xs text-muted transition-colors hover:text-ember">
                          Fiyat geçmişi ({u.history.length})
                        </summary>
                        <ul className="mt-1.5 space-y-1 border-t border-line pt-1.5">
                          {u.history.map((h) => (
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
                                      : "bg-surface text-ink-soft"
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
                  </li>
                ))}
              </ul>
            )}

            <form
              action={addPackage}
              className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <input type="hidden" name="productId" value={product.id} />
              <input name="name" required placeholder="Birim (Koli…) *" className={inputClass} />
              <input
                name="quantityInBase"
                type="number"
                min="1"
                defaultValue="1"
                title="Kaç baz birime denk"
                className={inputClass}
              />
              <input name="lastUnitPrice" inputMode="decimal" placeholder="Fiyat (TL)" className={inputClass} />
              <SubmitButton variant="ghost">+ Birim</SubmitButton>
            </form>
          </section>

          {/* Tehlikeli: ürünü sil */}
          <div className="flex justify-end">
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
