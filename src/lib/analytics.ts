import { prisma } from "@/lib/prisma";
import { getSupplierBalance, type SupplierBalance } from "@/lib/balance";

/** Panel üst kart metrikleri. */
export async function getDashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [suppliers, productCount, monthAgg] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.purchaseItem.aggregate({
      _sum: { lineTotal: true },
      where: { purchase: { deletedAt: null, date: { gte: monthStart } } },
    }),
  ]);

  const balances = await Promise.all(
    suppliers.map((s) => getSupplierBalance(s.id)),
  );
  const totalDebt = balances.reduce((sum, b) => sum + b.balance, 0);

  return {
    totalDebt,
    monthSpend: monthAgg._sum.lineTotal ?? 0,
    supplierCount: suppliers.length,
    productCount,
  };
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
