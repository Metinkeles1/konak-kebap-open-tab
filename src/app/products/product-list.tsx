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
            {/* Tek liste, iki düzen. Eskiden tablo + mobil liste İKİSİ BİRDEN
                render edilip biri CSS ile gizleniyordu (110 üründe ~3100 DOM
                düğümü). Şimdi tek satır: telefonda ad üstte, birimler altta;
                geniş ekranda ad | birim + fiyat | toptancı sayısı sütunları. */}
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_5rem] gap-6 border-b border-line px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
              <span>Ürün</span>
              <span className="flex justify-between">
                <span>Birimler</span>
                <span>Birim fiyatı</span>
              </span>
              <span className="text-right">Toptancı</span>
            </div>
            <ul className="divide-y divide-line text-sm">
              {filtered.map((p) => (
                <li key={p.id} className="cv-row">
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_5rem] sm:gap-x-6 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-ink transition-colors group-hover:text-ember">
                        {p.name}
                      </span>
                      {p.defaultSupplierName && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {p.defaultSupplierName}
                          {p.suppliers.length > 1 && (
                            <span className="sm:hidden"> · {p.suppliers.length} toptancı</span>
                          )}
                        </span>
                      )}
                    </span>

                    {/* Birim satırları: rozet solda, fiyat sağda — her zaman hizalı. */}
                    <span className="col-span-2 row-start-2 flex flex-col gap-1.5 sm:col-span-1 sm:row-start-auto sm:gap-1">
                      {p.units.length === 0 ? (
                        <span className="hidden text-muted sm:inline">—</span>
                      ) : (
                        p.units.map((u) => {
                          // Koli/Kasa gibi paket birimlerde içindeki adet görünsün
                          // (1 ise muhtemelen girilmemiş → fark edilsin).
                          const showQty = isPackagingUnit(u.name);
                          // Paket birden çok baz birim içeriyorsa adet başı fiyat.
                          const perBase =
                            u.lastUnitPrice != null && u.quantityInBase > 1
                              ? Math.round(u.lastUnitPrice / u.quantityInBase)
                              : null;
                          return (
                            <span key={u.packageId} className="flex items-center justify-between gap-3">
                              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft">
                                {u.name}
                                {showQty && (
                                  <span className="ml-1 text-muted">
                                    · {u.quantityInBase} {p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 flex-col items-end leading-tight">
                                <span className="nums text-xs font-medium text-ink sm:text-[11px]">
                                  {u.lastUnitPrice != null ? (
                                    formatKurus(u.lastUnitPrice)
                                  ) : (
                                    <span className="font-normal text-muted">—</span>
                                  )}
                                </span>
                                {perBase != null && (
                                  <span className="nums text-[10px] text-muted">
                                    {formatKurus(perBase)}/{p.baseUnit.toLocaleLowerCase("tr")}
                                  </span>
                                )}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </span>

                    <span className="col-start-2 row-start-1 flex items-start justify-end gap-2 text-ink-soft sm:col-start-auto sm:row-start-auto">
                      <span className="nums hidden sm:inline">{p.suppliers.length || "—"}</span>
                      <span className="text-muted sm:hidden" aria-hidden>
                        ›
                      </span>
                    </span>
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
