// Alış birimi türü yardımcıları.
// Tekil (baz) birimler — içlerinde "kaç adet?" sorusu anlamsızdır, 1 kabul edilir.
// Bunların dışındaki her şey (Koli, Kasa, Paket, Balya, Çuval…) bir PAKET sayılır;
// içindeki baz birim sayısı sorulur. Bu sayı ürüne göre değişir (kola kolisi 24,
// başka koli 12 olabilir), bu yüzden her yeni pakette ayrıca girilir.
const BASE_UNITS = new Set([
  "adet", "tane", "kg", "kilo", "kilogram", "gr", "gram", "litre", "lt", "l", "ml",
]);

/** Bu birim adı bir paket mi (içindeki adet sorulmalı mı)? Boş/tekil birim için false. */
export function isPackagingUnit(label: string): boolean {
  const t = label.trim().toLocaleLowerCase("tr");
  return t !== "" && !BASE_UNITS.has(t);
}
