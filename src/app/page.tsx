import Link from "next/link";
import { formatKurus } from "@/lib/money";
import {
  getDashboardStats,
  getSuppliersWithBalance,
  getProductSpend,
  getPriceTrends,
} from "@/lib/analytics";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";
import { BarList, Sparkline, TrendDelta } from "@/components/charts";

const monthName = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
});

export default async function DashboardPage() {
  const [stats, suppliers, productSpend, trends] = await Promise.all([
    getDashboardStats(),
    getSuppliersWithBalance(),
    getProductSpend(6),
    getPriceTrends(5),
  ]);

  const debtors = suppliers
    .filter((s) => s.balance.balance > 0)
    .map((s) => ({
      label: s.name,
      value: s.balance.balance,
    }));

  return (
    <>
      <PageHeader
        title="Panel"
        subtitle={`Genel durum · ${monthName.format(new Date())}`}
        action={
          <Link
            href="/purchases"
            className="rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ember-bright"
          >
            + Yeni alış
          </Link>
        }
      />

      {/* KPI satırı */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Toplam borç"
          value={formatKurus(stats.totalDebt)}
          tone={stats.totalDebt > 0 ? "debt" : "credit"}
          hint="Tüm toptancılar"
        />
        <Stat
          label="Bu ay alış"
          value={formatKurus(stats.monthSpend)}
          tone="ember"
          hint={monthName.format(new Date())}
        />
        <Stat label="Toptancı" value={String(stats.supplierCount)} />
        <Stat label="Ürün" value={String(stats.productCount)} />
      </div>

      {/* Orta blok */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Borçlu toptancılar */}
        <Card
          title="Toptancı bakiyeleri"
          className="lg:col-span-3"
          action={
            <Link
              href="/suppliers"
              className="text-xs font-medium text-ember hover:underline"
            >
              Tümü →
            </Link>
          }
        >
          {debtors.length === 0 ? (
            <EmptyState title="Açık borç yok 🎉" />
          ) : (
            <BarList items={debtors} />
          )}
        </Card>

        {/* Fiyat trendleri */}
        <Card title="En çok zamlanan birimler" className="lg:col-span-2">
          {trends.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Henüz yeterli fiyat geçmişi yok.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {trends.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {t.productName}
                    </p>
                    <p className="text-xs text-muted">{t.packageName}</p>
                  </div>
                  <Sparkline points={t.series} tone="debt" />
                  <div className="w-20 shrink-0 text-right">
                    <p className="nums text-sm font-medium text-ink">
                      {formatKurus(t.lastPrice)}
                    </p>
                    <TrendDelta pct={t.pct} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* En çok harcanan ürünler */}
      <div className="mt-6">
        <Card title="En çok harcanan ürünler">
          <BarList items={productSpend} emptyText="Henüz alış yok." />
        </Card>
      </div>
    </>
  );
}
