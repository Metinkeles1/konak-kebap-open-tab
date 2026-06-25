"use client";

// Sayım modu giriş formu — tedarikçinin ürünleri hazır liste; kullanıcı yalnızca
// adet (ve gerekirse fiyat) yazar. Gerçek `createPurchase` action'ına bağlıdır.
//  • Katalog satırı = mevcut alış birimi → kind:"existing"
//  • Listede olmayan ürün → "+ Yeni ürün" → kind:"new"
//  • İrsaliye toplamı çapraz-kontrolü ile yanlış okuma yakalanır.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchase, type NewPurchaseItem } from "@/app/actions";
import { formatKurus, tlToKurus } from "@/lib/money";
import { isPackagingUnit } from "@/lib/units";

export type CountPackage = {
  packageId: string;
  productId: string;
  productName: string;
  unit: string;
  baseCount: number;
  lastPrice: number | null;
  freq: boolean;
};
type SupplierOpt = { id: string; name: string; phone: string | null };
type Catalog = Record<string, CountPackage[]>;

type RowState = { qty: string; price: string }; // price boş = son fiyatı kullan
type NewRow = { name: string; unit: string; baseCount: string; qty: string; price: string };

const UNIT_SUGGESTIONS = ["Adet", "Koli", "Kasa", "Paket", "Balya", "Kg", "Gram", "Litre", "ML", "Çuval", "Teneke", "Rulo"];

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15";

const lc = (s: string) => s.trim().toLocaleLowerCase("tr");
const toQty = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("tr-TR"));

// Telefonu WhatsApp (wa.me) için uluslararası biçime indirger: yalnız rakam,
// başına 90. "0532…" → "90532…", "532…" (10 hane) → "90532…".
function waPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) return "90" + d.slice(1);
  if (d.length === 10) return "90" + d;
  return d;
}

// Basit WhatsApp logosu (buton ikonu).
function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.044zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}
const toBaseCount = (s: string) => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
function nowLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const newNewRow = (): NewRow => ({ name: "", unit: "", baseCount: "", qty: "1", price: "" });

export function CountEntryForm({ suppliers, catalog }: { suppliers: SupplierOpt[]; catalog: Catalog }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [date, setDate] = useState(nowLocal());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [filter, setFilter] = useState("");
  const [vat, setVat] = useState(""); // KDV oranı (%); boş = KDV yok
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const products = useMemo(() => (supplierId ? catalog[supplierId] ?? [] : []), [supplierId, catalog]);

  const visible = useMemo(() => {
    const q = lc(filter);
    return q ? products.filter((p) => lc(p.productName).includes(q) || lc(p.unit).includes(q)) : products;
  }, [filter, products]);
  const freqRows = visible.filter((p) => p.freq);
  const otherRows = visible.filter((p) => !p.freq);

  const priceKurus = (r: RowState, p: CountPackage): number | null => {
    if (r.price.trim()) {
      try { return tlToKurus(r.price); } catch { return p.lastPrice; }
    }
    return p.lastPrice;
  };

  // Klavye: görünür satırların adet inputları
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  function focusNext(currentId: string) {
    const idx = visible.findIndex((p) => p.packageId === currentId);
    for (let i = idx + 1; i < visible.length; i++) {
      const el = qtyRefs.current[visible[i].packageId];
      if (el) { el.focus(); el.select(); return; }
    }
  }

  const patch = (id: string, p: Partial<RowState>) =>
    setRows((rs) => {
      const cur = rs[id] ?? { qty: "", price: "" };
      return { ...rs, [id]: { ...cur, ...p } };
    });

  function changeSupplier(id: string) {
    setSupplierId(id);
    setRows({});
    setNewRows([]);
    setFilter("");
    setVat("");
    setInvoiceTotal("");
    setError(null);
    setOk(null);
  }

  // Aktif katalog kalemleri + yeni kalemler
  const activeCatalog = products.filter((p) => toQty(rows[p.packageId]?.qty ?? "") > 0);
  const newTotal = newRows.reduce((s, r) => {
    const q = toQty(r.qty);
    if (!q || !r.price.trim()) return s;
    try { return s + Math.round(tlToKurus(r.price) * q); } catch { return s; }
  }, 0);
  const catalogTotal = activeCatalog.reduce(
    (s, p) => s + Math.round((priceKurus(rows[p.packageId], p) ?? 0) * toQty(rows[p.packageId].qty)),
    0,
  );
  const subtotal = catalogTotal + newTotal;
  // KDV oranı (% tam sayı); boş/0 ise KDV uygulanmaz. İrsaliye toplamı KDV dahil
  // olduğundan çapraz-kontrol genel toplam (KDV dahil) üzerinden yapılır.
  const vatRate = (() => {
    const n = parseInt(vat.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const vatAmount = vatRate ? Math.round((subtotal * vatRate) / 100) : 0;
  const total = subtotal + vatAmount;
  const itemCount = activeCatalog.length + newRows.filter((r) => toQty(r.qty) > 0 && r.name.trim()).length;

  // İrsaliye çapraz-kontrolü
  const invKurus = invoiceTotal.trim()
    ? (() => { try { return tlToKurus(invoiceTotal); } catch { return null; } })()
    : null;
  const diff = invKurus != null ? total - invKurus : null;
  const matched = diff === 0;

  const outlier = (p: CountPackage) => {
    const r = rows[p.packageId];
    if (!r?.price.trim() || p.lastPrice == null || p.lastPrice <= 0) return false;
    let v: number;
    try { v = tlToKurus(r.price); } catch { return false; }
    return Math.abs(v - p.lastPrice) / p.lastPrice >= 0.1;
  };

  const fmtBase = (p: CountPackage) =>
    p.baseCount > 1 && p.lastPrice != null
      ? `1 ${p.unit} = ${p.baseCount} adet · birim başı ${formatKurus(Math.round(p.lastPrice / p.baseCount))}`
      : `birim: ${p.unit}`;

  // WhatsApp sipariş mesajı — girilen kalemler: ürün + adet + son bilinen fiyat.
  // Fiyat tahminîdir (toptancı son fiyatı), "~" ile işaretlenir.
  const orderText = useMemo(() => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    const lines: string[] = ["Merhaba, Konak Kebap sipariş:", ""];
    for (const p of products) {
      const qty = toQty(rows[p.packageId]?.qty ?? "");
      if (qty <= 0) continue;
      const price = priceKurus(rows[p.packageId] ?? { qty: "", price: "" }, p);
      const priceTxt = price != null && price > 0 ? ` (~${formatKurus(price)})` : "";
      lines.push(`• ${fmtQty(qty)} ${p.unit} ${p.productName}${priceTxt}`);
    }
    for (const r of newRows) {
      const qty = toQty(r.qty);
      if (qty <= 0 || !r.name.trim()) continue;
      let priceTxt = "";
      if (r.price.trim()) {
        try {
          priceTxt = ` (~${formatKurus(tlToKurus(r.price))})`;
        } catch {
          priceTxt = "";
        }
      }
      lines.push(`• ${fmtQty(qty)} ${r.unit.trim() || "Adet"} ${r.name.trim()}${priceTxt}`);
    }
    lines.push("", `— ${supplier?.name ?? ""}`);
    return lines.join("\n");
  }, [products, rows, newRows, supplierId, suppliers]);

  const waUrl = useMemo(() => {
    const phone = waPhone(suppliers.find((s) => s.id === supplierId)?.phone ?? null);
    const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(orderText)}`;
  }, [orderText, supplierId, suppliers]);

  const supplierHasPhone = !!waPhone(suppliers.find((s) => s.id === supplierId)?.phone ?? null);

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
      });
    }
    if (!items.length) return setError("En az bir kalem girin (adet yazın).");

    startTransition(async () => {
      try {
        await createPurchase({ supplierId, note, date, vatRate, items });
        setRows({});
        setNewRows([]);
        setInvoiceTotal("");
        setNote("");
        setDate(nowLocal());
        setFilter("");
        setVat("");
        setOk(`Alış kaydedildi · ${items.length} kalem · ${formatKurus(total)}`);
        router.refresh(); // yeni ürünler katalogda görünsün
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata oluştu");
      }
    });
  }

  // Satırı NESTED COMPONENT olarak değil, inline fonksiyon olarak render et:
  // aksi halde her render'da yeni bileşen tipi oluşup React satırı remount eder
  // ve input odağı her tuşta kaybolur.
  const renderRow = (p: CountPackage) => {
    const r = rows[p.packageId] ?? { qty: "", price: "" };
    const qty = toQty(r.qty);
    const on = qty > 0;
    const line = Math.round((priceKurus(r, p) ?? 0) * qty);
    return (
      <div
        key={p.packageId}
        className={`grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 rounded-lg border px-2.5 py-2 transition sm:grid-cols-[minmax(0,1fr)_120px_76px_104px] sm:px-3 ${
          on ? "border-ember/40 bg-ember-soft/50" : "border-transparent hover:bg-surface-2"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{p.productName}</span>
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{p.unit}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">{fmtBase(p)}</p>

          {/* Mobil: satır aktifken kompakt fiyat + tutar (masaüstünde ayrı sütunlar) */}
          {on && (
            <div className="mt-1.5 flex items-center gap-1.5 sm:hidden">
              <input
                inputMode="decimal"
                value={r.price}
                onChange={(e) => patch(p.packageId, { price: e.target.value })}
                placeholder={p.lastPrice != null ? formatKurus(p.lastPrice).replace("₺", "").trim() : "fiyat"}
                title="Son fiyat ön-dolu. Değişmediyse boş bırak."
                className={`nums w-24 rounded-md border bg-surface px-2 py-1 text-right text-xs text-ink outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15 ${
                  outlier(p) ? "border-debt/60 ring-2 ring-debt/15" : "border-line"
                }`}
              />
              <span className="text-[11px] text-muted">× {fmtQty(qty)} =</span>
              <span className="nums text-xs font-semibold text-ink">{formatKurus(line)}</span>
              {outlier(p) && (
                <span title="Son fiyattan %10+ farklı" className="text-[11px] font-bold text-debt">?</span>
              )}
            </div>
          )}
        </div>

        {/* Fiyat — son fiyat ön-dolu (masaüstü sütunu) */}
        <div className="relative hidden sm:block">
          <input
            inputMode="decimal"
            value={r.price}
            onChange={(e) => patch(p.packageId, { price: e.target.value })}
            placeholder={p.lastPrice != null ? formatKurus(p.lastPrice).replace("₺", "").trim() : "fiyat"}
            title="Son fiyat ön-dolu. Değişmediyse boş bırak."
            className={`${field} nums text-right ${outlier(p) ? "border-debt/60 ring-2 ring-debt/15" : ""}`}
          />
          {outlier(p) && (
            <span
              title="Son fiyattan %10+ farklı — yanlış okumuş olabilir misin?"
              className="pointer-events-none absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-debt text-[10px] font-bold text-white"
            >
              ?
            </span>
          )}
        </div>

        {/* Adet — asıl alan */}
        <input
          ref={(el) => { qtyRefs.current[p.packageId] = el; }}
          inputMode="decimal"
          value={r.qty}
          onChange={(e) => patch(p.packageId, { qty: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(p.packageId); } }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="0"
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
  };

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
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_76px_104px] items-center gap-2 px-5 pt-4 text-[11px] uppercase tracking-wider text-muted sm:grid">
          <span>Ürün</span>
          <span className="text-right">Fiyat (ön-dolu)</span>
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
              {freqRows.map((p) => renderRow(p))}
            </>
          )}
          {otherRows.length > 0 && (
            <>
              {freqRows.length > 0 && (
                <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Diğer ürünler</p>
              )}
              {otherRows.map((p) => renderRow(p))}
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
                  <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-ember/30 bg-ember-soft/30 p-2.5 sm:grid-cols-[minmax(0,1fr)_120px_76px_104px_28px] sm:items-start">
                    <input
                      value={r.name}
                      onChange={(e) => setNewRows((rs) => rs.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                      placeholder="Yeni ürün adı"
                      className={`${field} border-ember/50`}
                    />
                    <div className="flex flex-col gap-1">
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

      {/* Alt özet + çapraz-kontrol — responsive */}
      <div className="sticky bottom-0 z-30 mt-4 rounded-card border border-line bg-surface shadow-pop">
        <div className="p-3.5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3 sm:p-4 sm:px-5">
          {/* Toplam */}
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-sm text-muted">
              <span className="nums font-semibold text-ink">{itemCount}</span> kalem
            </span>
            <span className="text-sm text-muted">·</span>
            <span className="text-sm text-muted">{vatAmount > 0 ? "Genel toplam" : "Toplam"}</span>
            <span className="nums text-xl font-semibold text-ink">{formatKurus(total)}</span>
            {vatAmount > 0 && (
              <span className="nums text-[11px] text-muted">
                ({formatKurus(subtotal)} + KDV %{vatRate} {formatKurus(vatAmount)})
              </span>
            )}
          </div>

          {/* KDV + İrsaliye — mobilde yan yana tek satır */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mt-0 sm:ml-auto sm:gap-x-6">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted">KDV %</label>
              <input
                inputMode="numeric"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder="ops."
                title="Opsiyonel. Boş = KDV yok. İrsaliye toplamı KDV dahil karşılaştırılır."
                className={`${field} nums w-16 text-right`}
              />
            </div>

            {/* İrsaliye çapraz-kontrolü */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted">İrsaliye toplamı</label>
              <input
                inputMode="decimal"
                value={invoiceTotal}
                onChange={(e) => setInvoiceTotal(e.target.value)}
                placeholder="örn. 10.935"
                className={`${field} nums w-28 text-right sm:w-32 ${
                  invKurus == null ? "" : matched ? "border-credit/50 ring-2 ring-credit/15" : "border-debt/50 ring-2 ring-debt/15"
                }`}
              />
              {invKurus != null &&
                (matched ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-credit-soft px-2.5 py-1 text-xs font-medium text-credit">
                    ✓ Tutuyor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-debt-soft px-2.5 py-1 text-xs font-medium text-debt">
                    Fark {formatKurus(Math.abs(diff!))}
                  </span>
                ))}
            </div>
          </div>

          {/* Aksiyonlar */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:gap-2">
            {/* WhatsApp ile sipariş — mobilde tam genişlik, üstte */}
            {itemCount > 0 ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  supplierHasPhone
                    ? "Seçilenleri WhatsApp'tan toptancıya gönder"
                    : "Bu toptancıda telefon yok — WhatsApp açılır, kişiyi sen seçersin"
                }
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe5d] sm:order-2 sm:col-span-1 sm:py-2"
              >
                <WaIcon />
                WhatsApp ile sipariş
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Önce adet girin"
                className="col-span-2 inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#25D366]/50 px-4 py-2.5 text-sm font-semibold text-white sm:order-2 sm:col-span-1 sm:py-2"
              >
                <WaIcon />
                WhatsApp ile sipariş
              </button>
            )}
            <button
              type="button"
              onClick={() => changeSupplier(supplierId)}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 sm:order-1 sm:border-transparent"
            >
              Sıfırla
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || itemCount === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 sm:order-3"
            >
              {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />}
              {pending ? "Kaydediliyor…" : "Alışı kaydet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
