// Para tutarları DB'de her zaman kuruş (integer) olarak tutulur.
// Bu dosya kuruş <-> TL dönüşümlerini ve biçimlendirmeyi merkezileştirir.

/** TL (ondalıklı sayı veya "12,50" / "12.50" metni) -> kuruş (integer) */
export function tlToKurus(value: number | string): number {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Geçersiz tutar: ${value}`);
  }
  return Math.round(parsed * 100);
}

/** kuruş (integer) -> TL (ondalıklı sayı) */
export function kurusToTl(kurus: number): number {
  return kurus / 100;
}

/** kuruş -> "12,50 ₺" gibi Türkçe biçim */
export function formatKurus(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(kurusToTl(kurus));
}
