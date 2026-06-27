"use client";

import { useMemo, useState } from "react";
import { formatKurus } from "@/lib/money";
import { isPackagingUnit } from "@/lib/units";
import { inputClass, EmptyState } from "@/components/ui";
import { ProductModal } from "./product-modal";

export type ProductDetail = {
  id: string;
  name: string;
  baseUnit: string;
  defaultSupplierName: string | null;
  suppliers: { id: string; name: string; isDefault: boolean }[];
  units: {
    packageId: string;
    name: string;
    quantityInBase: number;
    lastUnitPrice: number | null;
    cells: Record<
      string,
      { price: number; prevPrice: number | null; date: string; source: string }
    >;
    history: {
      id: string;
      date: string;
      price: number;
      source: string;
      supplierName: string | null;
    }[];
  }[];
};

const lc = (s: string) => s.trim().toLocaleLowerCase("tr");

export function ProductList({
  products,
  allSuppliers,
}: {
  products: ProductDetail[];
  allSuppliers: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = lc(q);
    if (!needle) return products;
    return products.filter(
      (p) =>
        lc(p.name).includes(needle) ||
        p.units.some((u) => lc(u.name).includes(needle)) ||
        (p.defaultSupplierName && lc(p.defaultSupplierName).includes(needle)),
    );
  }, [products, q]);

  // Açık ürün silinince (liste tazelenince) bulunamaz → modal render edilmez,
  // yani kendiliğinden kapanır. Ayrı bir "kapat" effect'ine gerek yok.
  const openProduct = openId ? products.find((p) => p.id === openId) ?? null : null;

  if (products.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card">
        <EmptyState
          title="Henüz ürün yok."
          hint="Yukarıdan ya da alış ekranından ürün ekleyin."
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-card border border-line bg-surface shadow-card">
        {/* Arama */}
        <div className="border-b border-line p-4">
          <div className="relative max-w-sm">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              ⌕
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ürün, birim veya toptancı ara…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            “{q}” için sonuç yok.
          </p>
        ) : (
          <>
            {/* Masaüstü: tam tablo. Mobilde yatay taşmayı önlemek için gizlenir. */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">Ürün</th>
                  <th className="px-5 py-3 font-medium">Birimler</th>
                  <th className="px-5 py-3 text-right font-medium">Birim fiyatı</th>
                  <th className="px-5 py-3 text-right font-medium">Toptancı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="group cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ink transition-colors group-hover:text-ember">
                        {p.name}
                      </span>
                      {p.defaultSupplierName && (
                        <span className="ml-2 text-xs text-muted">
                          · {p.defaultSupplierName}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      {p.units.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          {p.units.map((u) => {
                            // Koli/Kasa gibi paket birimlerde içindeki adet listede
                            // doğrudan görünsün (1 ise muhtemelen girilmemiş → fark edilsin).
                            const showQty = isPackagingUnit(u.name);
                            return (
                              <span
                                key={u.packageId}
                                className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft"
                              >
                                {u.name}
                                {showQty && (
                                  <span className="ml-1 text-muted">
                                    · {u.quantityInBase}{" "}
                                    {p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    {/* Fiyatlar Birimler sütunuyla satır satır hizalı; birim adı
                        tekrar edilmez, yalnızca tutar gösterilir. */}
                    <td className="px-5 py-3.5 text-right align-top">
                      {p.units.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {p.units.map((u) => {
                            // Paket fiyatı (1 Koli/Paket alış fiyatı) + paket birden çok
                            // baz birim içeriyorsa adet başı fiyat (paket / içindeki adet).
                            const perBase =
                              u.lastUnitPrice != null && u.quantityInBase > 1
                                ? Math.round(u.lastUnitPrice / u.quantityInBase)
                                : null;
                            return (
                              <span
                                key={u.packageId}
                                className="flex flex-col items-end border border-transparent py-0.5 leading-tight"
                              >
                                <span className="nums text-[11px] font-medium text-ink">
                                  {u.lastUnitPrice != null ? (
                                    formatKurus(u.lastUnitPrice)
                                  ) : (
                                    <span className="font-normal text-muted">—</span>
                                  )}
                                </span>
                                {perBase != null && (
                                  <span className="nums text-[10px] text-muted">
                                    {formatKurus(perBase)}/
                                    {p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="nums px-5 py-3.5 text-right text-ink-soft">
                      {p.suppliers.length || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobil: her ürün dikey bir kart. Tablo yerine yığılmış düzen. */}
            <ul className="divide-y divide-line sm:hidden">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors active:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-ink">{p.name}</span>
                        {p.defaultSupplierName && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {p.defaultSupplierName}
                            {p.suppliers.length > 1 && (
                              <span> · {p.suppliers.length} toptancı</span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 shrink-0 text-muted" aria-hidden>
                        ›
                      </span>
                    </div>

                    {p.units.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {p.units.map((u) => {
                          const showQty = isPackagingUnit(u.name);
                          const perBase =
                            u.lastUnitPrice != null && u.quantityInBase > 1
                              ? Math.round(u.lastUnitPrice / u.quantityInBase)
                              : null;
                          return (
                            <div
                              key={u.packageId}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft">
                                {u.name}
                                {showQty && (
                                  <span className="ml-1 text-muted">
                                    · {u.quantityInBase}{" "}
                                    {p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 flex-col items-end leading-tight">
                                <span className="nums text-xs font-medium text-ink">
                                  {u.lastUnitPrice != null ? (
                                    formatKurus(u.lastUnitPrice)
                                  ) : (
                                    <span className="font-normal text-muted">—</span>
                                  )}
                                </span>
                                {perBase != null && (
                                  <span className="nums text-[10px] text-muted">
                                    {formatKurus(perBase)}/
                                    {p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {openProduct && (
        <ProductModal
          product={openProduct}
          allSuppliers={allSuppliers}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
