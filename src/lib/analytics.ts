import { prisma } from "@/lib/prisma";
import type { SupplierBalance } from "@/lib/balance";

/** Panel üst kart metrikleri. */
export async function getDashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Toplam borç = Σ açılış + Σ alış − Σ ödeme (yalnızca silinmemiş toptancılar).
  // Önceden toptancı başına 3 sorgu atılıyordu (N+1); artık sabit sayıda
  // toplulaştırma sorgusuyla aynı sonucu tek seferde alıyoruz.
  const [
    supplierCount,
    productCount,
    openingAgg,
    purchasedAgg,
    vatAgg,
    paidAgg,
    monthAgg,
    monthPayAgg,
  ] = await Promise.all([
    prisma.supplier.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.supplier.aggregate({
      _sum: { openingBalance: true },
      where: { deletedAt: null },
    }),
    prisma.purchaseItem.aggregate({
      _sum: { lineTotal: true },
      where: { purchase: { deletedAt: null, supplier: { deletedAt: null } } },
    }),
    // KDV başlık düzeyinde tutulur; toplam borca dahildir.
    prisma.purchase.aggregate({
      _sum: { vatAmount: true },
      where: { deletedAt: null, supplier: { deletedAt: null } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { deletedAt: null, supplier: { deletedAt: null } },
    }),
    prisma.purchaseItem.aggregate({
      _sum: { lineTotal: true },
      where: { purchase: { deletedAt: null, date: { gte: monthStart } } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { deletedAt: null, date: { gte: monthStart } },
    }),
  ]);

  const totalDebt =
    (openingAgg._sum.openingBalance ?? 0) +
    (purchasedAgg._sum.lineTotal ?? 0) +
    (vatAgg._sum.vatAmount ?? 0) -
    (paidAgg._sum.amount ?? 0);

  return {
    totalDebt,
    monthSpend: monthAgg._sum.lineTotal ?? 0,
    monthPayments: monthPayAgg._sum.amount ?? 0,
    supplierCount,
    productCount,
  };
}

/** Son N ayın aylık alış toplamı (kuruş). Panodaki trend için. */
export async function getMonthlyPurchaseTrend(months = 6) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { deletedAt: null, date: { gte: start } } },
    select: { lineTotal: true, purchase: { select: { date: true } } },
  });

  const fmt = new Intl.DateTimeFormat("tr-TR", { month: "short" });
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d), total: 0 };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const it of items) {
    const d = it.purchase.date;
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) buckets[i].total += it.lineTotal;
  }
  return buckets.map(({ label, total }) => ({ label, total }));
}

/** Bu ay toptancı bazında alış (kuruş) — çoktan aza. */
export async function getSupplierMonthlySpend(limit = 6) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { deletedAt: null, date: { gte: monthStart } } },
    select: {
      lineTotal: true,
      purchase: { select: { supplier: { select: { id: true, name: true } } } },
    },
  });
  const by = new Map<string, { name: string; total: number }>();
  for (const it of items) {
    const s = it.purchase.supplier;
    const cur = by.get(s.id) ?? { name: s.name, total: 0 };
    cur.total += it.lineTotal;
    by.set(s.id, cur);
  }
  return [...by.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((s) => ({ label: s.name, value: s.total }));
}

export type PriceAlert = {
  productName: string;
  packageName: string;
  oldPrice: number;
  newPrice: number;
  pct: number;
  date: Date;
  supplierName: string | null;
};

/**
 * Fiyat zammı uyarıları: bir alış biriminin SON fiyat değişimi eşiği aşıyor ve
 * yakın tarihliyse uyarı üretir (kümülatif trendden farklı — anlık sıçramayı yakalar).
 */
export async function getPriceAlerts({
  thresholdPct = 10,
  sinceDays = 60,
  limit = 8,
}: { thresholdPct?: number; sinceDays?: number; limit?: number } = {}): Promise<PriceAlert[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  // Uyarı yalnızca SON fiyat değişimi `since`'ten yeni olan birimlerden çıkabilir.
  // Önce yakın zamanda fiyatı değişen birimleri bul, ağır geçmiş sorgusunu yalnızca
  // o birimlerle sınırla (durağan birimlerin tüm geçmişini taramaktan kaçın).
  const recentlyChanged = await prisma.priceHistory.findMany({
    where: { effectiveDate: { gte: since } },
    select: { productPackageId: true },
    distinct: ["productPackageId"],
  });
  const changedPkgIds = recentlyChanged.map((r) => r.productPackageId);
  if (!changedPkgIds.length) return [];

  const history = await prisma.priceHistory.findMany({
    where: { productPackageId: { in: changedPkgIds } },
    orderBy: { effectiveDate: "asc" },
    select: {
      unitPrice: true,
      effectiveDate: true,
      productPackageId: true,
      supplier: { select: { name: true } },
      package: { select: { name: true, product: { select: { name: true } } } },
    },
  });

  const byPkg = new Map<string, typeof history>();
  for (const h of history) {
    const list = byPkg.get(h.productPackageId);
    if (list) list.push(h);
    else byPkg.set(h.productPackageId, [h]);
  }

  const alerts: PriceAlert[] = [];
  for (const list of byPkg.values()) {
    if (list.length < 2) continue;
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    if (last.effectiveDate < since || prev.unitPrice <= 0) continue;
    const pct = ((last.unitPrice - prev.unitPrice) / prev.unitPrice) * 100;
    if (pct < thresholdPct) continue;
    alerts.push({
      productName: last.package.product.name,
      packageName: last.package.name,
      oldPrice: prev.unitPrice,
      newPrice: last.unitPrice,
      pct,
      date: last.effectiveDate,
      supplierName: last.supplier?.name ?? null,
    });
  }
  return alerts.sort((a, b) => b.pct - a.pct).slice(0, limit);
}

export type SupplierWithBalance = {
  id: string;
  name: string;
  phone: string | null;
  balance: SupplierBalance;
};

/** Tüm toptancılar + bakiyeleri (borç çoktan aza). */
export async function getSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  // 3 sabit sorgu: toptancılar + toptancı bazında alış toplamı + ödeme toplamı.
  // Alış toplamı artık tüm PurchaseItem satırlarını belleğe çekmek yerine DB'de
  // GROUP BY ile toplanır (zamanla sınırsız büyüyen satır transferini önler).
  const [suppliers, purchaseGroups, vatGroups, paymentGroups] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, openingBalance: true },
    }),
    prisma.$queryRaw<{ supplierId: string; total: number }[]>`
      SELECT pur."supplierId" AS "supplierId", SUM(pi."lineTotal")::float8 AS total
      FROM "PurchaseItem" pi
      JOIN "Purchase" pur ON pur.id = pi."purchaseId"
      WHERE pur."deletedAt" IS NULL
      GROUP BY pur."supplierId"
    `,
    // KDV başlık düzeyinde (Purchase) tutulduğundan kalem join'ünde değil ayrı toplanır.
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { deletedAt: null },
      _sum: { vatAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["supplierId"],
      where: { deletedAt: null, supplier: { deletedAt: null } },
      _sum: { amount: true },
    }),
  ]);

  const purchasedBySupplier = new Map<string, number>();
  for (const g of purchaseGroups) {
    purchasedBySupplier.set(g.supplierId, Math.round(g.total));
  }
  // Alış toplamına KDV'yi ekle (cari borç KDV dahil).
  for (const g of vatGroups) {
    const cur = purchasedBySupplier.get(g.supplierId) ?? 0;
    purchasedBySupplier.set(g.supplierId, cur + (g._sum.vatAmount ?? 0));
  }
  const paidBySupplier = new Map<string, number>();
  for (const g of paymentGroups) {
    paidBySupplier.set(g.supplierId, g._sum.amount ?? 0);
  }

  return suppliers
    .map((s) => {
      const totalPurchased = purchasedBySupplier.get(s.id) ?? 0;
      const totalPaid = paidBySupplier.get(s.id) ?? 0;
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        balance: {
          supplierId: s.id,
          openingBalance: s.openingBalance,
          totalPurchased,
          totalPaid,
          balance: s.openingBalance + totalPurchased - totalPaid,
        },
      };
    })
    .sort((a, b) => b.balance.balance - a.balance.balance);
}

/** En çok harcanan ürünler (silinmemiş alışlardaki toplam tutar). */
export async function getProductSpend(limit = 6) {
  // Tüm kalem satırlarını belleğe çekmek yerine DB'de birim (paket) bazında
  // topla; sonra paketleri ürüne eşleyip ürün bazında birleştir. Satır
  // transferi O(alış kalemi) yerine O(birim) olur.
  const grouped = await prisma.purchaseItem.groupBy({
    by: ["productPackageId"],
    where: { purchase: { deletedAt: null } },
    _sum: { lineTotal: true, quantity: true },
  });
  if (!grouped.length) return [];

  const packages = await prisma.productPackage.findMany({
    where: { id: { in: grouped.map((g) => g.productPackageId) } },
    select: { id: true, product: { select: { id: true, name: true } } },
  });
  const pkgToProduct = new Map(packages.map((p) => [p.id, p.product]));

  const byProduct = new Map<string, { name: string; total: number; qty: number }>();
  for (const g of grouped) {
    const product = pkgToProduct.get(g.productPackageId);
    if (!product) continue;
    const cur = byProduct.get(product.id) ?? { name: product.name, total: 0, qty: 0 };
    cur.total += g._sum.lineTotal ?? 0;
    cur.qty += g._sum.quantity ?? 0;
    byProduct.set(product.id, cur);
  }

  return [...byProduct.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((p) => ({ label: p.name, value: p.total, sub: `${p.qty} adet` }));
}

export type PriceTrend = {
  productName: string;
  packageName: string;
  series: number[];
  firstPrice: number;
  lastPrice: number;
  pct: number;
};

/** En çok zamlanan alış birimleri (fiyat geçmişine göre). */
export async function getPriceTrends(limit = 5): Promise<PriceTrend[]> {
  // Ağır geçmiş sorgusunda yalnızca fiyat+birim id'si çekilir; ürün/birim adını
  // her satır için join etmek (binlerce satırda tekrarlanan metin) yerine adlar
  // sıralama sonrası SADECE ilk N birim için ayrı bir sorguyla alınır.
  const history = await prisma.priceHistory.findMany({
    orderBy: { effectiveDate: "asc" },
    select: { unitPrice: true, productPackageId: true },
  });

  const byPackage = new Map<string, number[]>();
  for (const h of history) {
    const series = byPackage.get(h.productPackageId);
    if (series) series.push(h.unitPrice);
    else byPackage.set(h.productPackageId, [h.unitPrice]);
  }

  const ranked = [...byPackage.entries()]
    .filter(([, series]) => series.length >= 2)
    .map(([packageId, series]) => {
      const firstPrice = series[0];
      const lastPrice = series[series.length - 1];
      const pct = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
      return { packageId, series, firstPrice, lastPrice, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
  if (!ranked.length) return [];

  const packages = await prisma.productPackage.findMany({
    where: { id: { in: ranked.map((r) => r.packageId) } },
    select: { id: true, name: true, product: { select: { name: true } } },
  });
  const pkgInfo = new Map(packages.map((p) => [p.id, p]));

  return ranked.map((r) => {
    const info = pkgInfo.get(r.packageId);
    return {
      productName: info?.product.name ?? "—",
      packageName: info?.name ?? "—",
      series: r.series,
      firstPrice: r.firstPrice,
      lastPrice: r.lastPrice,
      pct: r.pct,
    };
  });
}
