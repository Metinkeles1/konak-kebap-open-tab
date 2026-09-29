import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  collapseEvents,
  pctChange,
  summarizeLine,
  type LineSummary,
  type PriceEvent,
  type PriceLine,
} from "@/lib/price-tracking";
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
 * Fiyat zammı uyarıları: bir alış birimi × toptancı hattının SON fiyat değişimi
 * eşiği aşıyor ve yakın tarihliyse uyarı üretir (kümülatif trendden farklı —
 * anlık sıçramayı yakalar).
 */
export async function getPriceAlerts({
  thresholdPct = 10,
  sinceDays = 60,
  limit = 8,
}: { thresholdPct?: number; sinceDays?: number; limit?: number } = {}): Promise<PriceAlert[]> {
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const lines = await loadPriceLines();

  const alerts: PriceAlert[] = [];
  for (const line of lines) {
    const { events } = line;
    if (events.length < 2) continue;
    const last = events[events.length - 1];
    const prev = events[events.length - 2];
    if (last.t < since) continue;
    const pct = pctChange(prev.price, last.price);
    if (pct < thresholdPct) continue;
    alerts.push({
      productName: line.productName,
      packageName: line.packageName,
      oldPrice: prev.price,
      newPrice: last.price,
      pct,
      date: new Date(last.t),
      supplierName: line.supplierName,
    });
  }
  return alerts.sort((x, y) => y.pct - x.pct).slice(0, limit);
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
  supplierName: string | null;
  series: number[];
  firstPrice: number;
  lastPrice: number;
  pct: number;
};

/** En çok zamlanan alış birimleri (tüm zamanlar; toptancı bazında ilk → son fiyat). */
export async function getPriceTrends(limit = 5): Promise<PriceTrend[]> {
  const lines = await loadPriceLines();
  return lines
    .map((l) => summarizeLine(l, null))
    .filter((s): s is LineSummary => !!s && s.changes.length > 0 && s.pct > 0)
    .sort((x, y) => y.pct - x.pct)
    .slice(0, limit)
    .map((s) => ({
      productName: s.line.productName,
      packageName: s.line.packageName,
      supplierName: s.line.supplierName,
      series: s.series,
      firstPrice: s.basePrice,
      lastPrice: s.currentPrice,
      pct: s.pct,
    }));
}

/**
 * Tüm fiyat hatlarını (alış birimi × toptancı) yükler; art arda aynı fiyatlar
 * birleştirilir. Aynı istek içinde birden çok kez çağrılsa da (pano: uyarı +
 * trend) veritabanına bir kez gidilir.
 */
export const loadPriceLines = cache(async (): Promise<PriceLine[]> => {
  // Geçmişte yalnızca kısa alanlar çekilir; ad metinleri satır başına join
  // edilmez, birim/toptancı adları ayrı küçük sorgularla eşlenir.
  const [history, packages, suppliers] = await Promise.all([
    prisma.priceHistory.findMany({
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      select: {
        productPackageId: true,
        supplierId: true,
        unitPrice: true,
        effectiveDate: true,
        source: true,
      },
    }),
    prisma.productPackage.findMany({
      where: { deletedAt: null, product: { deletedAt: null } },
      select: { id: true, name: true, product: { select: { id: true, name: true } } },
    }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
  ]);

  const pkgInfo = new Map(packages.map((p) => [p.id, p]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const raw = new Map<string, { pkgId: string; supplierId: string | null; rows: PriceEvent[] }>();
  for (const h of history) {
    if (!pkgInfo.has(h.productPackageId)) continue; // silinmiş ürün/birim
    const key = `${h.productPackageId}:${h.supplierId ?? "-"}`;
    let entry = raw.get(key);
    if (!entry) {
      entry = { pkgId: h.productPackageId, supplierId: h.supplierId, rows: [] };
      raw.set(key, entry);
    }
    entry.rows.push({ t: h.effectiveDate.getTime(), price: h.unitPrice, source: h.source });
  }

  return [...raw.entries()].map(([key, e]) => {
    const pkg = pkgInfo.get(e.pkgId)!;
    return {
      key,
      productId: pkg.product.id,
      productName: pkg.product.name,
      packageName: pkg.name,
      supplierId: e.supplierId,
      supplierName: e.supplierId ? (supplierName.get(e.supplierId) ?? null) : null,
      events: collapseEvents(e.rows),
      buys: [],
    };
  });
});

/**
 * Fiyat Takibi sayfası için hatlar + her hattın alış kalemleri (fazla ödenen
 * tutarı hesaplamak için). Alış kalemi, alışın toptancısıyla hatta eşlenir.
 * `now` sunucuda sabitlenir → sunucu ve tarayıcı aynı dönem sınırını kullanır.
 */
export async function getPriceTracking(): Promise<{ lines: PriceLine[]; now: number }> {
  const [lines, items] = await Promise.all([
    loadPriceLines(),
    prisma.purchaseItem.findMany({
      where: { purchase: { deletedAt: null } },
      select: {
        productPackageId: true,
        quantity: true,
        unitPrice: true,
        purchase: { select: { date: true, supplierId: true } },
      },
    }),
  ]);

  const byKey = new Map<string, [number, number, number][]>();
  for (const it of items) {
    const key = `${it.productPackageId}:${it.purchase.supplierId}`;
    const list = byKey.get(key);
    const buy: [number, number, number] = [it.purchase.date.getTime(), it.quantity, it.unitPrice];
    if (list) list.push(buy);
    else byKey.set(key, [buy]);
  }

  // cache'lenen diziyi değiştirmemek için kopyala.
  return {
    lines: lines.map((l) => ({ ...l, buys: byKey.get(l.key) ?? [] })),
    now: Date.now(),
  };
}
