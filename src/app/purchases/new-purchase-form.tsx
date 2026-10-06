"use client";

import { useMemo, useState, useTransition } from "react";
import { createPurchase, type NewPurchaseItem } from "@/app/actions";
import { formatKurus, tlToKurus } from "@/lib/money";
import { isPackagingUnit } from "@/lib/units";
import { lineVat, vatBreakdown } from "@/lib/vat";
import { VatSelect, VatSummary } from "@/components/vat";
import { buildOrderText, WhatsAppButton, type OrderLine } from "@/components/whatsapp";
import { ReconciliationDialog } from "@/components/reconciliation";

type SupplierOpt = { id: string; name: string; phone: string | null };
type Unit = { packageId: string; unit: string; lastPrice: number | null };
export type CatalogProduct = { productId: string; name: string; vatRate: number; units: Unit[] };
type Catalog = Record<string, CatalogProduct[]>;

type Row = {
  query: string;
  productId: string | null; // mevcut ürün seçildiyse
  isNewProduct: boolean; // tamamen yeni ürün
  unitChoice: string; // "pkg:<id>" | "__new__" | ""
  unitText: string; // serbest birim adı (yeni birim/yeni ürün)
  baseCount: string; // yeni birim için: 1 paket kaç baz birim (1 koli = 24)
  quantity: string;
  price: string;
  vat: number; // KDV oranı (%) — ürün seçilince ürünün kayıtlı oranı gelir
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
  baseCount: "",
  quantity: "1",
  price: "",
  vat: 0,
  open: false,
});

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink sm:text-sm placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.trim().toLocaleLowerCase("tr");

const MAX_MATCHES = 50;

// Satır ızgarası: telefonda [ürün/birim/fiyat | adet/KDV | ✕], geniş ekranda tek satır.
const ROW_COLS =
  "grid-cols-[minmax(0,1fr)_5.5rem_28px] sm:grid-cols-[minmax(0,1fr)_130px_72px_110px_92px_28px]";

// Adet metnini sayıya çevir — kg için ondalık olabilir ("2,5" → 2.5)
const toQty = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// "1 koli = kaç baz birim" — pozitif tam sayı, yoksa undefined (sunucu 1 sayar)
const toBaseCount = (s: string) => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Yerel saate göre şimdi (yyyy-mm-ddTHH:mm) — input[type=datetime-local] için.
function nowLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function NewPurchaseForm({
  suppliers,
  catalog,
  allProducts,
}: {
  suppliers: SupplierOpt[];
  catalog: Catalog;
  allProducts: CatalogProduct[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(nowLocal());
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Kayıttan sonra açılan WhatsApp mutabakat penceresi.
  const [recon, setRecon] = useState<{ id: string; supplierName: string; note: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Varsayılan: yalnızca seçili toptancının ürünleri. "Tüm ürünleri göster"
  // açıksa, o toptancıya bağlı olmayan (sahipsiz / başka toptancı) ürünler de
  // listeye eklenir — global son fiyatlarıyla. Böylece yeni eklenen ürünler de
  // bulunabilir.
  const products = useMemo<CatalogProduct[]>(() => {
    if (!supplierId) return [];
    const scoped = catalog[supplierId] ?? [];
    if (!showAll) return scoped;
    const have = new Set(scoped.map((p) => p.productId));
    const extra = allProducts.filter((p) => !have.has(p.productId));
    return [...scoped, ...extra].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [supplierId, showAll, catalog, allProducts]);

  // Arama için küçük harfli adlar bir kez hesaplanır (her tuşta, her satırda
  // tüm ürünleri yeniden toLocaleLowerCase'e sokmak yerine).
  const searchIndex = useMemo(() => products.map((p) => ({ p, key: lc(p.name) })), [products]);

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

  // Kalem tutarları (KDV hariç) + her satırın kendi KDV oranı → orana göre döküm.
  const lines = rows.map((r) => {
    const price = rowPriceKurus(r);
    return { lineTotal: price != null ? Math.round(toQty(r.quantity) * price) : 0, vatRate: r.vat };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const vatLines = vatBreakdown(lines);
  const total = subtotal + lines.reduce((s, l) => s + lineVat(l.lineTotal, l.vatRate), 0);

  // WhatsApp sipariş mesajı — adedi girilmiş, ürünü belli kalemler (sayım moduyla aynı biçim).
  const supplier = suppliers.find((s) => s.id === supplierId);
  const orderLines: OrderLine[] = rows.flatMap((r) => {
    const qty = toQty(r.quantity);
    const name = r.query.trim();
    if (qty <= 0 || !name || (!r.productId && !r.isNewProduct)) return [];
    const unit = selectedPkg(r)?.unit ?? (r.unitText.trim() || "Adet");
    return [{ quantity: qty, unit, name, price: rowPriceKurus(r) }];
  });
  const orderText = buildOrderText({
    lines: orderLines,
    supplierName: supplier?.name ?? "",
    vatLines,
    total,
  });

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
      vat: product.vatRate, // ürünün kayıtlı KDV oranı; değiştirilirse ürüne de yazılır
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
        const unit = r.unitText.trim() || "Adet";
        if (!r.price.trim()) return setError(`'${r.query.trim()}' için fiyat girin.`);
        if (isPackagingUnit(unit) && !toBaseCount(r.baseCount))
          return setError(`'${r.query.trim()}' · ${unit}: 1 ${unit} kaç adet? girin.`);
        payload.push({ kind: "new", name: r.query.trim(), unit, quantity: qty, unitPriceTl: r.price, quantityInBase: toBaseCount(r.baseCount), vatRate: r.vat });
      } else if (r.productId) {
        if (r.unitChoice.startsWith("pkg:")) {
          payload.push({ kind: "existing", productPackageId: r.unitChoice.slice(4), quantity: qty, unitPriceTl: r.price, vatRate: r.vat });
        } else if (r.unitChoice === "__new__") {
          const unit = r.unitText.trim();
          if (!unit) return setError(`'${r.query}' için birim adı yazın (ör. Koli).`);
          if (!r.price.trim()) return setError(`'${r.query}' · ${unit} için fiyat girin.`);
          if (isPackagingUnit(unit) && !toBaseCount(r.baseCount))
            return setError(`'${r.query}' · ${unit}: 1 ${unit} kaç adet? girin.`);
          payload.push({ kind: "newUnit", productId: r.productId, unit, quantity: qty, unitPriceTl: r.price, quantityInBase: toBaseCount(r.baseCount), vatRate: r.vat });
        }
      }
    }
    if (!payload.length) return setError("En az bir kalem ekleyin.");

    startTransition(async () => {
      try {
        const res = await createPurchase({ supplierId, note, date, items: payload });
        if (!res.ok) return setError(res.error);
        const { id } = res.data;
        setRecon({
          id,
          supplierName: supplier?.name ?? "",
          note: `Alış kaydedildi · ${payload.length} kalem · ${formatKurus(total)}`,
        });
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

      <div className="space-y-4 p-4 sm:p-5">
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
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="accent-ember"
              />
              Tüm ürünleri göster
              <span className="text-muted/70">(bu toptancıya bağlı olmayanlar dahil)</span>
            </label>

            <div className={`hidden ${ROW_COLS} items-center gap-2 px-1 text-[11px] uppercase tracking-wider text-muted sm:grid`}>
              <span>Ürün</span>
              <span>Birim</span>
              <span>Adet</span>
              <span>Birim fiyat</span>
              <span>KDV</span>
              <span />
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => {
                const q = lc(row.query);
                // Açılır listede en çok MAX_MATCHES öneri çizilir; telefonda yüzlerce
                // düğmeyi her tuşta çizmek gecikme yaratıyordu. Daha fazlası için yazmaya devam.
                const matches: CatalogProduct[] = [];
                let exact = false;
                if (row.open) {
                  for (const { p, key } of searchIndex) {
                    if (key === q) exact = true;
                    if ((!q || key.includes(q)) && matches.length < MAX_MATCHES) matches.push(p);
                  }
                }
                const product = findProduct(row);
                const pkg = selectedPkg(row);
                const unitActive = row.isNewProduct || !!row.productId;
                const freeUnit = row.isNewProduct || row.unitChoice === "__new__";
                // Birim bir paketse (Koli/Kasa…) içindeki adet sorulur; tekil birimde (Adet/Kg) sorulmaz.
                const packaging = freeUnit && isPackagingUnit(row.unitText);
                // Yeni birim için canlı birim başı fiyat: 1 koli = N adet ise fiyat / N.
                const baseCount = toBaseCount(row.baseCount);
                const rowPrice = rowPriceKurus(row);
                const showPerBase = packaging && baseCount != null && baseCount > 1 && rowPrice != null;

                return (
                  <div key={idx} className="space-y-1">
                  <div className={`grid ${ROW_COLS} items-center gap-2 rounded-lg border border-line p-2 sm:border-0 sm:p-0`}>
                    {/* Ürün combobox */}
                    <div className="relative order-1 col-span-2 sm:col-span-1">
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
                                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2 active:bg-surface-2 sm:py-1.5"
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
                    <div className="order-3 min-w-0 sm:order-2">
                    {!unitActive ? (
                      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">—</div>
                    ) : freeUnit ? (
                      <div className="flex flex-col gap-1">
                        <input
                          list="unit-suggestions"
                          value={row.unitText}
                          onChange={(e) => patch(idx, { unitText: e.target.value })}
                          placeholder="Birim (Koli…)"
                          className={`${field} border-ember/60`}
                          title="Yeni birim adı"
                        />
                        {packaging && (
                          <input
                            inputMode="numeric"
                            value={row.baseCount}
                            onChange={(e) => patch(idx, { baseCount: e.target.value })}
                            placeholder={`1 ${row.unitText.trim()} = kaç adet? *`}
                            title="Bu paket kaç tek birim içerir (1 koli = 24 adet). Her ürünün kolisi farklı olabilir."
                            className={`${field} nums text-xs border-ember/60`}
                          />
                        )}
                      </div>
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
                    </div>

                    <input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => patch(idx, { quantity: e.target.value })}
                      placeholder="Adet"
                      title="Adet (kg için ondalık girebilirsiniz, ör. 2,5)"
                      className={`${field} nums order-4 col-span-2 sm:order-3 sm:col-span-1`}
                    />
                    <input
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => patch(idx, { price: e.target.value })}
                      placeholder={pkg?.lastPrice != null ? `son ${formatKurus(pkg.lastPrice)}` : freeUnit ? "Fiyat *" : "Fiyat"}
                      className={`${field} nums order-5 sm:order-4`}
                    />
                    <VatSelect
                      value={row.vat}
                      onChange={(v) => patch(idx, { vat: v })}
                      className="order-6 col-span-2 w-full sm:order-5 sm:col-span-1"
                    />
                    <button
                      type="button"
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== idx) : [newRow()]))}
                      className="order-2 grid h-9 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-debt-soft hover:text-debt sm:order-6"
                      title="Kalemi kaldır"
                    >
                      ✕
                    </button>
                  </div>
                  {showPerBase && (
                    <p className="px-1 text-[11px] text-muted">
                      1 {row.unitText.trim() || "paket"} = {baseCount} adet · birim başı{" "}
                      <span className="nums font-medium text-ink-soft">
                        {formatKurus(Math.round(rowPrice! / baseCount!))}
                      </span>
                    </p>
                  )}
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

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
              {/* KDV satır bazında seçilir (ürünün kayıtlı oranı gelir); burada orana göre döküm */}
              <VatSummary subtotal={subtotal} vatLines={vatLines} total={total} />

              <div className="grid grid-cols-1 gap-2 sm:flex">
                <WhatsAppButton phone={supplier?.phone} text={orderText} disabled={orderLines.length === 0} />
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60 sm:py-2"
                >
                  {pending && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                  )}
                  {pending ? "Kaydediliyor…" : "Alışı kaydet"}
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}
      </div>

      {recon && (
        <ReconciliationDialog
          source={{ type: "purchase", purchaseId: recon.id }}
          supplierName={recon.supplierName}
          savedNote={recon.note}
          onClose={() => setRecon(null)}
        />
      )}
    </div>
  );
}
