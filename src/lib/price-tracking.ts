// Fiyat takibi (zam/indirim) hesapları — saf fonksiyonlar, prisma içermez.
// Hem sunucu (pano) hem istemci (Fiyat Takibi sayfası, dönem değişince anında
// yeniden hesap) tarafından kullanılır. Tüm tutarlar kuruş.
//
// Temel kural: zam, AYNI toptancının AYNI alış birimi (paket) için verdiği
// fiyatlar arasında ölçülür. Farklı toptancıların fiyatı karşılaştırılırsa
// "A'dan 100 ₺, B'den 120 ₺" sahte bir %20 zam gibi görünür.

export type PriceSourceKind = "PURCHASE" | "MANUAL";

/** Bir fiyat değişim noktası (art arda aynı fiyatlar birleştirilmiş). t = epoch ms. */
export type PriceEvent = { t: number; price: number; source: PriceSourceKind };

/** Bir alış birimi × toptancı fiyat hattı. */
export type PriceLine = {
  key: string;
  productId: string;
  productName: string;
  packageName: string;
  supplierId: string | null;
  supplierName: string | null;
  /** Tarihe göre artan; ardışık aynı fiyatlar tek olaya indirgenmiş. */
  events: PriceEvent[];
  /** Bu hattaki alış kalemleri: [tarih ms, adet, birim fiyat]. Fazla ödenen hesabı için. */
  buys: [number, number, number][];
};

export type PriceChange = {
  t: number;
  from: number;
  to: number;
  pct: number;
  source: PriceSourceKind;
};

export type LineSummary = {
  line: PriceLine;
  /** Dönem başında geçerli fiyat (dönemden önce fiyat yoksa dönemdeki ilk fiyat). */
  basePrice: number;
  currentPrice: number;
  /** Dönem başı → güncel % değişim. */
  pct: number;
  /** Dönem başı → güncel ₺ fark (kuruş). */
  diff: number;
  /** Dönem içindeki değişimler (eskiden yeniye). */
  changes: PriceChange[];
  lastChange: number | null;
  /** Grafik serisi: dönem başı fiyatı + her değişimden sonraki fiyat. */
  series: number[];
  /** Dönemde bu hattan yapılan alış tutarı (kuruş). */
  spend: number;
  /** Aynı alışlar dönem başı fiyatıyla yapılsaydı tutacak tutar (kuruş). */
  baseCost: number;
  /** Zam yüzünden fazladan ödenen (negatifse indirimden kazanılan) — kuruş. */
  extraCost: number;
  /** Dönemde tek adımda ≥ SUSPECT_PCT değişim var → olası hatalı giriş. */
  suspect: boolean;
};

/** Bu süre içinde tekrar değişen fiyat, bir zam değil yazım düzeltmesi sayılır. */
export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Tek adımda bu oranı (%) aşan değişim büyük olasılıkla veri girişi hatasıdır
 * (ör. ₺397 yerine ₺3.975, koli yerine adet fiyatı). Bu kalemler listede
 * işaretlenir ama toplam zam hesaplarına katılmaz.
 */
export const SUSPECT_PCT = 60;

/**
 * Fiyat kayıtlarını (tarihe göre artan) değişim olaylarına indirger:
 * - fiyat öncekiyle aynıysa atlanır (her alışta aynı fiyat tekrar yazılır);
 * - önceki değişimden sonra 24 saat içinde gelen fiyat onu DÜZELTİR (yanlış
 *   yazılan fiyat zam/indirim gibi görünmesin). Gerçek bir zam ise yine
 *   yakalanır: düzeltme bir önceki fiyata göre değerlendirilir.
 */
export function collapseEvents(rows: PriceEvent[]): PriceEvent[] {
  const out: PriceEvent[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.price === r.price) continue;
    if (last && r.t - last.t < CORRECTION_WINDOW_MS) {
      out.pop();
      if (out[out.length - 1]?.price === r.price) continue; // eski fiyata geri dönüldü
    }
    out.push(r);
  }
  return out;
}

export function pctChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

/** Bir hattı `since` (epoch ms; null = tüm zamanlar) dönemine göre özetler. */
export function summarizeLine(line: PriceLine, since: number | null): LineSummary | null {
  const { events } = line;
  if (!events.length) return null;

  const start = since ?? -Infinity;
  let firstIdx = events.findIndex((e) => e.t >= start);
  if (firstIdx === -1) firstIdx = events.length; // dönemde değişim yok
  const before = firstIdx > 0 ? events[firstIdx - 1] : null;

  const changes: PriceChange[] = [];
  for (let i = firstIdx; i < events.length; i++) {
    const prev = i > 0 ? events[i - 1] : null;
    if (!prev) continue; // hattın ilk fiyatı bir "değişim" değil
    const e = events[i];
    changes.push({
      t: e.t,
      from: prev.price,
      to: e.price,
      pct: pctChange(prev.price, e.price),
      source: e.source,
    });
  }

  const basePrice = before?.price ?? events[firstIdx]?.price ?? events[0].price;
  const currentPrice = events[events.length - 1].price;

  let spend = 0;
  let baseCost = 0;
  for (const [t, qty, price] of line.buys) {
    if (t < start) continue;
    spend += qty * price;
    baseCost += qty * basePrice;
  }

  return {
    line,
    basePrice,
    currentPrice,
    pct: pctChange(basePrice, currentPrice),
    diff: currentPrice - basePrice,
    changes,
    lastChange: changes.length ? changes[changes.length - 1].t : null,
    series: [basePrice, ...changes.map((c) => c.to)],
    spend: Math.round(spend),
    baseCost: Math.round(baseCost),
    extraCost: Math.round(spend - baseCost),
    suspect: changes.some((c) => Math.abs(c.pct) >= SUSPECT_PCT),
  };
}
