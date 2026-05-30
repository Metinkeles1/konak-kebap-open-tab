"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deletePurchase } from "@/app/actions";
import { formatKurus } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { Money, Badge } from "@/components/ui";
import {
  EditPurchaseForm,
  type ListPurchase,
  type ProductOpt,
} from "./edit-purchase-form";

const field =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.toLocaleLowerCase("tr");

export function PurchaseList({
  purchases,
  suppliers,
  products,
}: {
  purchases: ListPurchase[];
  suppliers: { id: string; name: string }[];
  products: ProductOpt[];
}) {
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function remove(p: ListPurchase) {
    setDeletingId(p.id);
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("supplierId", p.supplierId);
    startTransition(async () => {
      try {
        await deletePurchase(fd);
      } finally {
        setDeletingId(null);
      }
    });
  }

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
          {filtered.map((p) => {
            const open = openId === p.id;
            const editing = editingId === p.id;
            return (
              <li key={p.id} className="px-5 py-3">
                {/* Daraltılmış satır — tıklayınca açılır */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(open ? null : p.id);
                      if (open) setEditingId(null);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="truncate font-medium text-ink">{p.supplierName}</span>
                    <span className="nums shrink-0 text-xs text-muted">{formatDateTime(p.date)}</span>
                    {p.documentNo && <Badge>{p.documentNo}</Badge>}
                    <span className="shrink-0 text-xs text-muted">
                      {p.items.length} kalem
                    </span>
                  </button>
                  <Money kurus={p.total} className="shrink-0 font-semibold" />
                </div>

                {/* Açık ve düzenlemiyor → kalemler + aksiyonlar */}
                {open && !editing && (
                  <div className="mt-3 pl-6">
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                      {p.items.map((i) => (
                        <li key={i.id}>
                          {i.productName}{" "}
                          <span className="text-muted">
                            · {i.unit} × {i.quantity} ({formatKurus(i.unitPrice)})
                          </span>
                        </li>
                      ))}
                    </ul>
                    {p.note && <p className="mt-2 text-sm text-muted">Not: {p.note}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(p.id)}
                        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
                      >
                        Düzenle
                      </button>
                      <Link
                        href={`/suppliers/${p.supplierId}`}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ember"
                      >
                        Cari ekstreyi gör
                      </Link>
                      {deletingId === p.id ? (
                        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                          Silinsin mi?
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            disabled={pending}
                            className="inline-flex items-center gap-1.5 rounded-md bg-debt px-2.5 py-1 font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
                          >
                            {deletingId === p.id && pending && (
                              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                            )}
                            {deletingId === p.id && pending ? "Siliniyor…" : "Evet, sil"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="rounded-md px-2 py-1 font-medium text-ink hover:bg-surface-2"
                          >
                            Vazgeç
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(p.id)}
                          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-debt-soft hover:text-debt"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Düzenleme formu */}
                {open && editing && (
                  <div className="mt-3 pl-6">
                    <EditPurchaseForm
                      purchase={p}
                      suppliers={suppliers}
                      products={products}
                      onDone={() => setEditingId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
