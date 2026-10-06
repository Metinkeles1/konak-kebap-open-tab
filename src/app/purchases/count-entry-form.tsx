"use client";

// Sayım modu giriş formu — tedarikçinin ürünleri hazır liste; kullanıcı yalnızca
// adet (ve gerekirse fiyat) yazar. Gerçek `createPurchase` action'ına bağlıdır.
//  • Katalog satırı = mevcut alış birimi → kind:"existing"
//  • Listede olmayan ürün → "+ Yeni ürün" → kind:"new"
//  • İrsaliye toplamı çapraz-kontrolü ile yanlış okuma yakalanır.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchase, type NewPurchaseItem } from "@/app/actions";
import { formatKurus, tlToKurus } from "@/lib/money";
import { isPackagingUnit } from "@/lib/units";
import { buildOrderText, fmtQty, WhatsAppButton } from "@/components/whatsapp";
import { ReconciliationDialog } from "@/components/reconciliation";
import { lineVat, vatBreakdown } from "@/lib/vat";
import { VatSelect, VatSummary } from "@/components/vat";

export type CountPackage = {
  packageId: string;
  productId: string;
  productName: string;
  unit: string;
  baseCount: number;
  lastPrice: number | null;
  vatRate: number; // ürünün kayıtlı KDV oranı (%)
  freq: boolean;
};
type SupplierOpt = { id: string; name: string; phone: string | null };
type Catalog = Record<string, CountPackage[]>;

// price boş = son fiyatı kullan; vat yoksa ürünün kayıtlı oranı (değiştirilirse ürüne de yazılır)
type RowState = { qty: string; price: string; vat?: number };
type NewRow = { name: string; unit: string; baseCount: string; qty: string; price: string; vat: number };

const UNIT_SUGGESTIONS = ["Adet", "Koli", "Kasa", "Paket", "Balya", "Kg", "Gram", "Litre", "ML", "Çuval", "Teneke", "Rulo"];

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink sm:text-sm placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.trim().toLocaleLowerCase("tr");
const toQty = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toBaseCount = (s: string) => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
function nowLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const newNewRow = (): NewRow => ({ name: "", unit: "", baseCount: "", qty: "1", price: "", vat: 0 });

const EMPTY_ROW: RowState = { qty: "", price: "" };

// Sayım satırı ızgarası (geniş ekran): ürün | fiyat | KDV | adet | tutar
const COUNT_COLS = "sm:grid-cols-[minmax(0,1fr)_120px_92px_76px_104px]";

// Satırın geçerli birim fiyatı (kuruş): yazılan fiyat, yoksa/okunamazsa son fiyat.
function priceKurus(r: RowState | undefined, p: CountPackage): number | null {
  if (r?.price.trim()) {
    try { return tlToKurus(r.price); } catch { return p.lastPrice; }
  }
  return p.lastPrice;
}

// Satırın KDV oranı: satırda seçilen, yoksa ürünün kayıtlı oranı.
const rowVat = (r: RowState | undefined, p: CountPackage) => r?.vat ?? p.vatRate;

// Yazılan fiyat son fiyattan %10+ farklıysa — irsaliyeyi yanlış okumuş olabilir.
function isOutlier(r: RowState | undefined, p: CountPackage): boolean {
  if (!r?.price.trim() || p.lastPrice == null || p.lastPrice <= 0) return false;
  let v: number;
  try { v = tlToKurus(r.price); } catch { return false; }
  return Math.abs(v - p.lastPrice) / p.lastPrice >= 0.1;
}

const fmtBase = (p: CountPackage) =>
  p.baseCount > 1 && p.lastPrice != null
    ? `1 ${p.unit} = ${p.baseCount} adet · birim başı ${formatKurus(Math.round(p.lastPrice / p.baseCount))}`
    : `birim: ${p.unit}`;

// Tek sayım satırı. memo + kararlı callback'ler sayesinde bir adete yazınca
// YALNIZCA o satır yeniden çizilir. Eskiden her tuşta tüm liste (yüzlerce satır,
// her birinde birkaç para biçimlendirme) yeniden render ediliyor, telefonda
// yazarken belirgin gecikme oluyordu.
// Not: modül düzeyinde tanımlı — bileşen içinde tanımlansaydı her render'da yeni
// tip oluşur, satır remount edilir ve input odağı her tuşta kaybolurdu.
const CountRow = memo(function CountRow({
  p,
  row,
  onPatch,
  onEnter,
  registerQty,
}: {
  p: CountPackage;
  row: RowState | undefined;
  onPatch: (id: string, patch: Partial<RowState>) => void;
  onEnter: (id: string) => void;
  registerQty: (id: string, el: HTMLInputElement | null) => void;
}) {
  const r = row ?? EMPTY_ROW;
  const qty = toQty(r.qty);
  const on = qty > 0;
  const line = Math.round((priceKurus(r, p) ?? 0) * qty);
  const outlier = isOutlier(r, p);
  const vat = rowVat(r, p);
  const pricePlaceholder = p.lastPrice != null ? formatKurus(p.lastPrice).replace("₺", "").trim() : "fiyat";
  return (
    <div
      className={`cv-row grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 rounded-lg border px-2.5 py-2 transition ${COUNT_COLS} sm:px-3 ${
        on ? "border-ember/40 bg-ember-soft/50" : "border-transparent hover:bg-surface-2"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{p.productName}</span>
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{p.unit}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {fmtBase(p)}
          {vat > 0 && <span className="nums"> · KDV %{vat}</span>}
        </p>

        {/* Mobil: satır aktifken kompakt fiyat + tutar (masaüstünde ayrı sütunlar) */}
        {on && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            <input
              inputMode="decimal"
              value={r.price}
              onChange={(e) => onPatch(p.packageId, { price: e.target.value })}
              placeholder={pricePlaceholder}
              title="Son fiyat ön-dolu. Değişmediyse boş bırak."
              className={`nums w-24 rounded-md border bg-surface px-2 py-1 text-right text-base text-ink outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15 ${
                outlier ? "border-debt/60 ring-2 ring-debt/15" : "border-line"
              }`}
            />
            <span className="text-[11px] text-muted">× {fmtQty(qty)} =</span>
            <span className="nums text-xs font-semibold text-ink">{formatKurus(line)}</span>
            {outlier && (
              <span title="Son fiyattan %10+ farklı" className="text-[11px] font-bold text-debt">?</span>
            )}
            <VatSelect size="sm" value={vat} onChange={(v) => onPatch(p.packageId, { vat: v })} />
          </div>
        )}
      </div>

      {/* Fiyat — son fiyat ön-dolu (masaüstü sütunu) */}
      <div className="relative hidden sm:block">
        <input
          inputMode="decimal"
          value={r.price}
          onChange={(e) => onPatch(p.packageId, { price: e.target.value })}
          placeholder={pricePlaceholder}
          title="Son fiyat ön-dolu. Değişmediyse boş bırak."
          className={`${field} nums text-right ${outlier ? "border-debt/60 ring-2 ring-debt/15" : ""}`}
        />
        {outlier && (
          <span
            title="Son fiyattan %10+ farklı — yanlış okumuş olabilir misin?"
            className="pointer-events-none absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-debt text-[10px] font-bold text-white"
          >
            ?
          </span>
        )}
      </div>

      {/* KDV — masaüstü sütunu; yalnızca adet girilen satırda seçilebilir */}
      <div className="hidden sm:block">
        {on ? (
          <VatSelect size="sm" value={vat} onChange={(v) => onPatch(p.packageId, { vat: v })} className="w-full" />
        ) : (
          <span className="nums block text-center text-xs text-muted/70">{vat > 0 ? `%${vat}` : "—"}</span>
        )}
      </div>

      {/* Adet — asıl alan. enterKeyHint: telefon klavyesinde "İleri" tuşu. */}
      <input
        ref={(el) => registerQty(p.packageId, el)}
        inputMode="decimal"
        enterKeyHint="next"
        value={r.qty}
        onChange={(e) => onPatch(p.packageId, { qty: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(p.packageId); } }}
        onFocus={(e) => e.currentTarget.select()}
        placeholder="0"
        aria-label={`${p.productName} · ${p.unit} adet`}
        className={`${field} nums self-start text-center text-base font-semibold sm:self-auto ${on ? "border-ember/50" : ""}`}
      />

      {/* Tutar — geniş ekranda */}
      <div className="hidden text-right sm:block">
        {on ? (
          <span className="nums text-sm font-semibold text-ink">{formatKurus(line)}</span>
        ) : (
          <span className="text-sm text-muted/50">—</span>
        )}
      </div>
    </div>
  );
});

export function CountEntryForm({
  suppliers,
  catalog,
  unitless,
}: {
  suppliers: SupplierOpt[];
  catalog: Catalog;
  unitless: Record<string, string[]>; // toptancı → birimi tanımlanmamış ürün adları
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [date, setDate] = useState(nowLocal());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [filter, setFilter] = useState("");
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Kayıttan sonra açılan WhatsApp mutabakat penceresi.
  const [recon, setRecon] = useState<{ id: string; supplierName: string; note: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Telefonda alt paneldeki KDV / irsaliye / WhatsApp bölümü açık mı?
  const [checksOpen, setChecksOpen] = useState(false);
  const checksId = useId();

  const products = useMemo(() => (supplierId ? catalog[supplierId] ?? [] : []), [supplierId, catalog]);
  // Birimi olmayan ürünler: satır olarak listelenemez, tıklayınca adı dolu
  // "yeni ürün" satırı açılır (sunucu aynı isimli ürünü bulup birimi ona ekler).
  const pendingUnitless = (supplierId ? unitless[supplierId] ?? [] : []).filter(
    (name) => !newRows.some((r) => lc(r.name) === lc(name)) && (!filter || lc(name).includes(lc(filter))),
  );

  const visible = useMemo(() => {
    const q = lc(filter);
    return q ? products.filter((p) => lc(p.productName).includes(q) || lc(p.unit).includes(q)) : products;
  }, [filter, products]);
  const freqRows = visible.filter((p) => p.freq);
  const otherRows = visible.filter((p) => !p.freq);

  // Klavye: görünür satırların adet inputları. Satırlara verilen callback'ler
  // kararlı (useCallback) olmalı ki memo'lu CountRow gereksiz yere çizilmesin;
  // güncel görünür liste bu yüzden ref üzerinden okunur.
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const focusNext = useCallback((currentId: string) => {
    const list = visibleRef.current;
    const idx = list.findIndex((p) => p.packageId === currentId);
    for (let i = idx + 1; i < list.length; i++) {
      const el = qtyRefs.current[list[i].packageId];
      if (el) { el.focus(); el.select(); return; }
    }
  }, []);

  const registerQty = useCallback((id: string, el: HTMLInputElement | null) => {
    qtyRefs.current[id] = el;
  }, []);

  // Yalnızca değişen satırın nesnesi yenilenir; diğerleri aynı referansla kalır.
  const patch = useCallback(
    (id: string, p: Partial<RowState>) =>
      setRows((rs) => ({ ...rs, [id]: { ...(rs[id] ?? EMPTY_ROW), ...p } })),
    [],
  );

  function changeSupplier(id: string) {
    setSupplierId(id);
    setRows({});
    setNewRows([]);
    setFilter("");
    setInvoiceTotal("");
    setError(null);
    setOk(null);
  }

  // Aktif katalog kalemleri + yeni kalemler
  const activeCatalog = products.filter((p) => toQty(rows[p.packageId]?.qty ?? "") > 0);
  // Kalem tutarları (KDV hariç) + her kalemin kendi KDV oranı (ürün bazlı).
  const lines = [
    ...activeCatalog.map((p) => ({
      lineTotal: Math.round((priceKurus(rows[p.packageId], p) ?? 0) * toQty(rows[p.packageId].qty)),
      vatRate: rowVat(rows[p.packageId], p),
    })),
    ...newRows.map((r) => {
      const q = toQty(r.qty);
      let lineTotal = 0;
      if (q && r.price.trim()) {
        try { lineTotal = Math.round(tlToKurus(r.price) * q); } catch { lineTotal = 0; }
      }
      return { lineTotal, vatRate: r.vat };
    }),
  ];
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const vatLines = vatBreakdown(lines);
  const vatAmount = lines.reduce((s, l) => s + lineVat(l.lineTotal, l.vatRate), 0);
  // İrsaliye toplamı KDV dahil olduğundan çapraz-kontrol genel toplam üzerinden yapılır.
  const total = subtotal + vatAmount;
  const itemCount = activeCatalog.length + newRows.filter((r) => toQty(r.qty) > 0 && r.name.trim()).length;

  // İrsaliye çapraz-kontrolü
  const invKurus = invoiceTotal.trim()
    ? (() => { try { return tlToKurus(invoiceTotal); } catch { return null; } })()
    : null;
  const diff = invKurus != null ? total - invKurus : null;
  const matched = diff === 0;

  // WhatsApp sipariş mesajı — girilen kalemler: ürün + adet + son bilinen fiyat.
  const supplier = suppliers.find((s) => s.id === supplierId);
  const orderText = buildOrderText({
    lines: [
      ...products.flatMap((p) => {
        const r = rows[p.packageId];
        const qty = toQty(r?.qty ?? "");
        return qty > 0 ? [{ quantity: qty, unit: p.unit, name: p.productName, price: priceKurus(r, p) }] : [];
      }),
      ...newRows.flatMap((r) => {
        const qty = toQty(r.qty);
        if (qty <= 0 || !r.name.trim()) return [];
        let price: number | null = null;
        try { price = r.price.trim() ? tlToKurus(r.price) : null; } catch { price = null; }
        return [{ quantity: qty, unit: r.unit.trim() || "Adet", name: r.name.trim(), price }];
      }),
    ],
    supplierName: supplier?.name ?? "",
    vatLines,
    total,
  });

  function submit() {
    setError(null);
    setOk(null);
    if (!supplierId) return setError("Önce toptancı seçin.");

    const items: NewPurchaseItem[] = [];
    // Katalogdan girilenler
    for (const p of products) {
      const r = rows[p.packageId];
      const qty = toQty(r?.qty ?? "");
      if (qty <= 0) continue;
      if (p.lastPrice == null && !r.price.trim()) {
        return setError(`'${p.productName} · ${p.unit}' için fiyat girin (kayıtlı son fiyat yok).`);
      }
      items.push({
        kind: "existing",
        productPackageId: p.packageId,
        quantity: qty,
        unitPriceTl: r.price.trim() || undefined,
        vatRate: rowVat(r, p),
      });
    }
    // Yeni ürünler
    for (const r of newRows) {
      const qty = toQty(r.qty);
      if (qty <= 0 || !r.name.trim()) continue;
      const unit = r.unit.trim() || "Adet";
      if (!r.price.trim()) return setError(`'${r.name.trim()}' için fiyat girin.`);
      if (isPackagingUnit(unit) && !toBaseCount(r.baseCount))
        return setError(`'${r.name.trim()}' · ${unit}: 1 ${unit} kaç adet? girin.`);
      items.push({
        kind: "new",
        name: r.name.trim(),
        unit,
        quantity: qty,
        unitPriceTl: r.price,
        quantityInBase: toBaseCount(r.baseCount),
        vatRate: r.vat,
      });
    }
    if (!items.length) return setError("En az bir kalem girin (adet yazın).");

    startTransition(async () => {
      try {
        const res = await createPurchase({ supplierId, note, date, items });
        if (!res.ok) return setError(res.error);
        const { id } = res.data;
        setRows({});
        setNewRows([]);
        setInvoiceTotal("");
        setNote("");
        setDate(nowLocal());
        setFilter("");
        const savedNote = `Alış kaydedildi · ${items.length} kalem · ${formatKurus(total)}`;
        setOk(savedNote);
        setRecon({ id, supplierName: supplier?.name ?? "", note: savedNote });
        router.refresh(); // yeni ürünler katalogda görünsün
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata oluştu");
      }
    });
  }

  // Kaydet düğmesi iki yerde: telefonda alt panelin ilk satırında, geniş ekranda
  // aksiyonların sonunda (biri her zaman gizli). `display` sınıfını (inline-flex /
  // hidden) çağıran verir — tabanda olsaydı `hidden` ile çakışır, ikisi de görünürdü.
  const saveButton = (className: string) => (
    <button
      type="button"
      onClick={submit}
      disabled={pending || itemCount === 0}
      className={`items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-soft active:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2 ${className}`}
    >
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />}
      {pending ? "Kaydediliyor…" : (
        <>
          <span className="sm:hidden">Kaydet</span>
          <span className="hidden sm:inline">Alışı kaydet</span>
        </>
      )}
    </button>
  );

  return (
    <div>
      <datalist id="count-unit-suggestions">
        {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
      </datalist>

      <section className="rounded-card border border-line bg-surface shadow-card">
        {/* Üst: toptancı + tarih + not */}
        <div className="grid grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-3 sm:p-5">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Toptancı
            <select value={supplierId} onChange={(e) => changeSupplier(e.target.value)} className={field}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Alış tarihi
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} nums`} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Not
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsiyonel" className={field} />
          </label>
        </div>

        {/* Arama */}
        <div className="border-b border-line p-4 sm:p-5">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-muted">
            Ürün ara (yaz → Enter ile ilk satıra atla)
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visible[0]) {
                  e.preventDefault();
                  const el = qtyRefs.current[visible[0].packageId];
                  el?.focus(); el?.select();
                }
              }}
              placeholder="ör. peçete, kutu, sabun…"
              className={field}
            />
          </label>
        </div>

        {/* Liste başlığı (geniş ekran) */}
        <div className={`hidden ${COUNT_COLS} items-center gap-2 px-5 pt-4 text-[11px] uppercase tracking-wider text-muted sm:grid`}>
          <span>Ürün</span>
          <span className="text-right">Fiyat (ön-dolu)</span>
          <span className="text-center">KDV</span>
          <span className="text-center">Adet</span>
          <span className="text-right">Tutar</span>
        </div>

        <div className="space-y-1 p-3">
          {products.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Bu toptancıda kayıtlı ürün yok — aşağıdan “Yeni ürün” ekleyin.
            </p>
          )}
          {freqRows.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ember/80">Sık alınanlar</p>
              {freqRows.map((p) => (
                <CountRow key={p.packageId} p={p} row={rows[p.packageId]} onPatch={patch} onEnter={focusNext} registerQty={registerQty} />
              ))}
            </>
          )}
          {otherRows.length > 0 && (
            <>
              {freqRows.length > 0 && (
                <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Diğer ürünler</p>
              )}
              {otherRows.map((p) => (
                <CountRow key={p.packageId} p={p} row={rows[p.packageId]} onPatch={patch} onEnter={focusNext} registerQty={registerQty} />
              ))}
            </>
          )}
          {products.length > 0 && visible.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">“{filter}” bulunamadı.</p>
          )}
        </div>

        {/* Yeni ürünler (listede olmayan) */}
        <div className="border-t border-line p-4 sm:p-5">
          {newRows.length > 0 && (
            <div className="mb-3 space-y-2">
              {newRows.map((r, idx) => {
                const packaging = isPackagingUnit(r.unit);
                return (
                  <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg border border-ember/30 bg-ember-soft/30 p-2.5 sm:grid-cols-[minmax(0,1fr)_120px_76px_104px_92px_28px] sm:items-start">
                    <input
                      value={r.name}
                      onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                      placeholder="Yeni ürün adı"
                      className={`${field} col-span-2 border-ember/50 sm:col-span-1`}
                    />
                    <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                      <input
                        list="count-unit-suggestions"
                        value={r.unit}
                        onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))}
                        placeholder="Birim (Koli…)"
                        className={`${field} border-ember/40`}
                      />
                      {packaging && (
                        <input
                          inputMode="numeric"
                          value={r.baseCount}
                          onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, baseCount: e.target.value } : x)))}
                          placeholder={`1 ${r.unit.trim()} = kaç adet? *`}
                          className={`${field} nums border-ember/40 text-xs`}
                        />
                      )}
                    </div>
                    <input
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                      placeholder="Adet"
                      className={`${field} nums text-center`}
                    />
                    <input
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))}
                      placeholder="Fiyat *"
                      className={`${field} nums text-right`}
                    />
                    <VatSelect
                      value={r.vat}
                      onChange={(v) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, vat: v } : x)))}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setNewRows((rs) => rs.filter((_, i) => i !== idx))}
                      className="grid h-9 w-7 place-items-center justify-self-end rounded-lg text-muted transition-colors hover:bg-debt-soft hover:text-debt"
                      title="Kaldır"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {pendingUnitless.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] text-muted">
                Birimi tanımlanmamış ürünler — girmek için tıklayıp birim yazın:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pendingUnitless.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setNewRows((rs) => [...rs, { ...newNewRow(), name }])}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-ember/50 hover:text-ember"
                  >
                    + {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setNewRows((rs) => [...rs, newNewRow()])}
            className="text-sm font-medium text-ember transition-colors hover:text-ember-bright"
          >
            + Listede yok? Yeni ürün ekle
          </button>
        </div>
      </section>

      {error && <p className="mt-4 rounded-lg bg-debt-soft px-3 py-2 text-sm text-debt">{error}</p>}
      {ok && <p className="mt-4 rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{ok}</p>}

      {/* Alt özet + çapraz-kontrol.
          Telefonda tek ince satır: kalem · toplam · [Kontrol] · [Kaydet]. KDV,
          irsaliye ve WhatsApp "Kontrol" ile açılır — eskiden panel boşken bile
          ekranın ~%35'ini kaplıyor, klavye açıkken listeye yer kalmıyordu.
          İrsaliye girildiyse "tutuyor / fark" rozeti kapalıyken de görünür.
          Geniş ekranda her şey tek satırda, her zaman açık. */}
      <div className="sticky bottom-0 z-30 mt-4 rounded-card border border-line bg-surface shadow-pop">
        <div className="p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3 sm:p-4 sm:px-5">
          {/* Satır 1 — telefonda toplam + düğmeler; geniş ekranda `contents` ile akışa katılır */}
          <div className="flex items-center gap-2 sm:contents">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 sm:flex-none">
              <span className="text-xs text-muted sm:text-sm">
                <span className="nums font-semibold text-ink">{itemCount}</span> kalem
              </span>
              <span className="hidden text-sm text-muted sm:inline">·</span>
              <span className="hidden text-sm text-muted sm:inline">{vatAmount > 0 ? "Genel toplam" : "Toplam"}</span>
              <span className="nums text-lg font-semibold text-ink sm:text-xl">{formatKurus(total)}</span>
              {vatAmount > 0 && (
                <span className="nums hidden text-[11px] text-muted sm:inline">
                  ({formatKurus(subtotal)} +{" "}
                  {vatLines.map((v) => `KDV %${v.rate} ${formatKurus(v.amount)}`).join(" + ")})
                </span>
              )}
              {invKurus != null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium sm:hidden ${
                    matched ? "bg-credit-soft text-credit" : "bg-debt-soft text-debt"
                  }`}
                >
                  {matched ? "✓ irsaliye" : `Fark ${formatKurus(Math.abs(diff!))}`}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setChecksOpen((v) => !v)}
              aria-expanded={checksOpen}
              aria-controls={checksId}
              className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-ink-soft active:bg-surface-2 sm:hidden"
            >
              Kontrol
              <span aria-hidden className={`text-xs transition-transform ${checksOpen ? "rotate-180" : ""}`}>
                ▴
              </span>
            </button>
            {saveButton("inline-flex h-10 shrink-0 sm:hidden")}
          </div>

          {/* Açılır bölüm (telefon) / her zaman açık (geniş ekran) */}
          <div
            id={checksId}
            className={`${checksOpen ? "mt-3 grid" : "hidden"} gap-3 border-t border-line pt-3 sm:ml-auto sm:mt-0 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:border-0 sm:pt-0`}
          >
            {/* KDV satır bazında (ürünün oranı); burada yalnızca döküm — telefonda */}
            {vatLines.length > 0 && (
              <VatSummary subtotal={subtotal} vatLines={vatLines} total={total} className="sm:hidden" />
            )}

            {/* İrsaliye — KDV dahil genel toplamla karşılaştırılır */}
            <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-x-6">

              {/* İrsaliye çapraz-kontrolü */}
              <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted">
                  İrsaliye toplamı
                </span>
                <span className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={invoiceTotal}
                    onChange={(e) => setInvoiceTotal(e.target.value)}
                    placeholder="örn. 10.935"
                    className={`${field} nums min-w-0 text-right sm:w-32 ${
                      invKurus == null ? "" : matched ? "border-credit/50 ring-2 ring-credit/15" : "border-debt/50 ring-2 ring-debt/15"
                    }`}
                  />
                  {invKurus != null &&
                    (matched ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-credit-soft px-2.5 py-1 text-xs font-medium text-credit">
                        ✓ Tutuyor
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-debt-soft px-2.5 py-1 text-xs font-medium text-debt">
                        Fark {formatKurus(Math.abs(diff!))}
                      </span>
                    ))}
                </span>
              </label>
            </div>

            {/* Aksiyonlar */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:gap-2">
              <WhatsAppButton
                phone={supplier?.phone}
                text={orderText}
                disabled={itemCount === 0}
                className="sm:order-2"
              />
              <button
                type="button"
                onClick={() => changeSupplier(supplierId)}
                disabled={pending}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 sm:order-1 sm:border-transparent"
              >
                Sıfırla
              </button>
              {saveButton("hidden sm:inline-flex sm:order-3")}
            </div>
          </div>
        </div>
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
