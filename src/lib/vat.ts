// KDV hesapları — saf fonksiyonlar, prisma içermez. Hem sunucu (kayıt, mutabakat)
// hem istemci (alış formlarındaki canlı toplam) aynı kuralı kullanır.
//
// Kural: KDV ÜRÜN bazlıdır. Her alış kalemi kendi oranıyla, kendi tutarı üzerinden
// hesaplanır ve kayıtta DONDURULUR (fiyat gibi). Alışın KDV'si = kalemlerin toplamı.
// Tutarlar kuruş (integer).

/** Formlarda hazır sunulan oranlar (Türkiye: %0, %1, %10, %20). */
export const VAT_PRESETS = [0, 1, 10, 20] as const;

/** Oranı normalle: 0–100 arası tam sayı (%); geçersizse 0 (KDV'siz). */
export function normVatRate(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 100) : 0;
}

/** Bir kalemin KDV tutarı (kuruş). */
export function lineVat(lineTotal: number, rate: number): number {
  return rate > 0 ? Math.round((lineTotal * rate) / 100) : 0;
}

export type VatLine = { rate: number; base: number; amount: number };

/**
 * Kalemleri orana göre gruplar (yalnızca KDV'li oranlar, küçükten büyüğe).
 * `vatAmount` verilmişse (kayıtlı, dondurulmuş tutar) o kullanılır; yoksa hesaplanır.
 */
export function vatBreakdown(
  items: { lineTotal: number; vatRate: number; vatAmount?: number }[],
): VatLine[] {
  const by = new Map<number, VatLine>();
  for (const i of items) {
    if (!(i.vatRate > 0)) continue;
    const cur = by.get(i.vatRate) ?? { rate: i.vatRate, base: 0, amount: 0 };
    cur.base += i.lineTotal;
    cur.amount += i.vatAmount ?? lineVat(i.lineTotal, i.vatRate);
    by.set(i.vatRate, cur);
  }
  return [...by.values()].sort((a, b) => a.rate - b.rate);
}

/** Tüm kalemler aynı (KDV'li) orandaysa o oran; karışık ya da KDV'siz ise null. */
export function commonVatRate(items: { vatRate: number }[]): number | null {
  const rates = new Set(items.map((i) => i.vatRate));
  if (rates.size !== 1) return null;
  const [r] = rates;
  return r > 0 ? r : null;
}

/** "%1" ya da "%1 + %10" — kısa etiket. */
export function vatRatesLabel(lines: VatLine[]): string {
  return lines.map((l) => `%${l.rate}`).join(" + ");
}

/** Hazır oranlara, listede yoksa mevcut oranı ekler (eski kayıtlarda %8/%18 olabilir). */
export function vatOptions(current?: number): number[] {
  const set = new Set<number>(VAT_PRESETS);
  if (current != null && current > 0) set.add(current);
  return [...set].sort((a, b) => a - b);
}
