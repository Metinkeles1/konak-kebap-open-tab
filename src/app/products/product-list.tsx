"use client";

import { useMemo, useState } from "react";
import { formatKurus } from "@/lib/money";
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

function priceLabel(p: ProductDetail): string {
  const prices = p.units
    .map((u) => u.lastUnitPrice)
    .filter((v): v is number => v != null);
  if (!prices.length) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatKurus(min) : `${formatKurus(min)} – ${formatKurus(max)}`;
}

export function ProductList({ products }: { products: ProductDetail[] }) {
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">Ürün</th>
                <th className="px-5 py-3 font-medium">Birimler</th>
                <th className="px-5 py-3 text-right font-medium">Toptancı</th>
                <th className="px-5 py-3 text-right font-medium">Fiyat</th>
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
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {p.units.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        p.units.map((u) => (
                          <span
                            key={u.packageId}
                            className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft"
                          >
                            {u.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="nums px-5 py-3.5 text-right text-ink-soft">
                    {p.suppliers.length || "—"}
                  </td>
                  <td className="nums px-5 py-3.5 text-right font-medium text-ink">
                    {priceLabel(p)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openProduct && (
        <ProductModal product={openProduct} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
