import { prisma } from "@/lib/prisma";
import { getSupplierBalance, type SupplierBalance } from "@/lib/balance";

/** Panel üst kart metrikleri. */
export async function getDashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [suppliers, productCount, monthAgg, monthPayAgg] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.purchaseItem.aggregate({
      _sum: { lineTotal: true },
      where: { purchase: { deletedAt: null, date: { gte: monthStart } } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { deletedAt: null, date: { gte: monthStart } },
    }),
  ]);

  const balances = await Promise.all(
    suppliers.map((s) => getSupplierBalance(s.id)),
  );
  const totalDebt = balances.reduce((sum, b) => sum + b.balance, 0);

  return {
    totalDebt,
    monthSpend: monthAgg._sum.lineTotal ?? 0,
    monthPayments: monthPayAgg._sum.amount ?? 0,
    supplierCount: suppliers.length,
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
  const history = await prisma.priceHistory.findMany({
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

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

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
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  const result = await Promise.all(
    suppliers.map(async (s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      balance: await getSupplierBalance(s.id),
    })),
  );
  return result.sort((a, b) => b.balance.balance - a.balance.balance);
}

/** En çok harcanan ürünler (silinmemiş alışlardaki toplam tutar). */
export async function getProductSpend(limit = 6) {
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { deletedAt: null } },
    select: {
      lineTotal: true,
      quantity: true,
      package: { select: { product: { select: { id: true, name: true } } } },
    },
  });

  const byProduct = new Map<string, { name: string; total: number; qty: number }>();
  for (const it of items) {
    const p = it.package.product;
    const cur = byProduct.get(p.id) ?? { name: p.name, total: 0, qty: 0 };
    cur.total += it.lineTotal;
    cur.qty += it.quantity;
    byProduct.set(p.id, cur);
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
  const history = await prisma.priceHistory.findMany({
    orderBy: { effectiveDate: "asc" },
    select: {
      unitPrice: true,
      productPackageId: true,
      package: {
        select: { name: true, product: { select: { name: true } } },
      },
    },
  });

  const byPackage = new Map<
    string,
    { productName: string; packageName: string; series: number[] }
  >();
  for (const h of history) {
    const cur =
      byPackage.get(h.productPackageId) ?? {
        productName: h.package.product.name,
        packageName: h.package.name,
        series: [],
      };
    cur.series.push(h.unitPrice);
    byPackage.set(h.productPackageId, cur);
  }

  return [...byPackage.values()]
    .filter((p) => p.series.length >= 2)
    .map((p) => {
      const firstPrice = p.series[0];
      const lastPrice = p.series[p.series.length - 1];
      const pct = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
      return { ...p, firstPrice, lastPrice, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}
