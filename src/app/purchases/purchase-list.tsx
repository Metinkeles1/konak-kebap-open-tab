"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { Money, Badge } from "@/components/ui";
import { PurchaseModal } from "./purchase-modal";
import { type ListPurchase, type ProductOpt } from "./edit-purchase-form";

const field =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.toLocaleLowerCase("tr");

export function PurchaseList({
  purchases,
  suppliers,
  products,
  catalog,
}: {
  purchases: ListPurchase[];
  suppliers: { id: string; name: string }[];
  products: ProductOpt[];
  catalog: Record<string, ProductOpt[]>;
}) {
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = lc(query.trim());
    return purchases.filter((p) => {
      if (supplierFilter && p.supplierId !== supplierFilter) return false;
      if (!q) return true;
      const hay = lc(
        [
          p.supplierName,
          p.documentNo ?? "",
          p.note ?? "",
          ...p.items.map((i) => `${i.productName} ${i.unit}`),
        ].join(" "),
      );
      return hay.includes(q);
    });
  }, [purchases, query, supplierFilter]);

  // Açık alış silinince (liste tazelenince) bulunamaz → modal kendiliğinden kapanır.
  const openPurchase = openId ? purchases.find((p) => p.id === openId) ?? null : null;

  return (
    <section className="rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(31,26,22,0.04),0_8px_24px_-12px_rgba(31,26,22,0.08)]">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-ink">
          Son alışlar
          <span className="ml-2 font-normal text-muted">({filtered.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className={field}
            title="Toptancıya göre filtrele"
          >
            <option value="">Tüm toptancılar</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ara: ürün, fatura no, not…"
            className={`${field} w-56`}
          />
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {purchases.length === 0 ? "Henüz alış yok." : "Eşleşen alış yok."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((p) => (
            <li key={p.id}>
              {/* Satıra tıklayınca detay modal'da açılır */}
              <button
                type="button"
                onClick={() => setOpenId(p.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="truncate font-medium text-ink">{p.supplierName}</span>
                <span className="nums shrink-0 text-xs text-muted">
                  {formatDateTime(p.date)}
                </span>
                {p.documentNo && <Badge>{p.documentNo}</Badge>}
                <span className="shrink-0 text-xs text-muted">{p.items.length} kalem</span>
                <Money kurus={p.total} className="ml-auto shrink-0 font-semibold" />
                <span className="shrink-0 text-muted" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openPurchase && (
        <PurchaseModal
          purchase={openPurchase}
          suppliers={suppliers}
          products={products}
          catalog={catalog}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
