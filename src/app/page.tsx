import Link from "next/link";
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  getDashboardStats,
  getSuppliersWithBalance,
  getProductSpend,
  getPriceTrends,
  getMonthlyPurchaseTrend,
  getSupplierMonthlySpend,
  getPriceAlerts,
} from "@/lib/analytics";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";
import { BarList, Sparkline, TrendDelta, MiniBars } from "@/components/charts";

const monthName = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
});

export default async function DashboardPage() {
  const [stats, suppliers, productSpend, trends, monthlyTrend, supplierSpend, alerts] =
    await Promise.all([
      getDashboardStats(),
      getSuppliersWithBalance(),
      getProductSpend(6),
      getPriceTrends(5),
      getMonthlyPurchaseTrend(6),
      getSupplierMonthlySpend(6),
      getPriceAlerts({ thresholdPct: 10, sinceDays: 60, limit: 6 }),
    ]);

  // Aylık trendde son aya göre değişim (geçen aya kıyasla)
  const lastMonth = monthlyTrend[monthlyTrend.length - 1]?.total ?? 0;
  const prevMonth = monthlyTrend[monthlyTrend.length - 2]?.total ?? 0;
  const monthDeltaPct = prevMonth ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;

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
        <Stat
          label="Bu ay ödeme"
          value={formatKurus(stats.monthPayments)}
          tone="credit"
          hint="Toptancılara yapılan"
        />
        <Stat label="Toptancı" value={String(stats.supplierCount)} hint={`${stats.productCount} ürün`} />
      </div>

      {/* Fiyat zammı uyarıları — son 60 günde ≥%10 zamlananlar */}
      {alerts.length > 0 && (
        <div className="mt-6">
          <Card
            title="⚠ Fiyat zammı uyarıları"
            action={
              <Link href="/products" className="text-xs font-medium text-ember hover:underline">
                Ürünler →
              </Link>
            }
          >
            <ul className="divide-y divide-line">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {a.productName} <span className="text-muted">· {a.packageName}</span>
                    </p>
                    <p className="text-xs text-muted">
                      <span className="nums">{formatDate(a.date)}</span>
                      {a.supplierName ? ` · ${a.supplierName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="nums text-sm text-muted">
                      {formatKurus(a.oldPrice)} <span className="text-muted">→</span>{" "}
                      <span className="font-medium text-ink">{formatKurus(a.newPrice)}</span>
                    </span>
                    <TrendDelta pct={a.pct} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

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

      {/* Aylık alış trendi + bu ay toptancı bazında alış */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Aylık alış trendi"
          action={
            lastMonth > 0 ? (
              <span className="flex items-center gap-2 text-xs text-muted">
                {monthName.format(new Date())}: {formatKurus(lastMonth)}
                <TrendDelta pct={monthDeltaPct} />
              </span>
            ) : undefined
          }
        >
          {monthlyTrend.every((m) => m.total === 0) ? (
            <p className="py-6 text-center text-sm text-muted">Henüz alış yok.</p>
          ) : (
            <MiniBars data={monthlyTrend} />
          )}
        </Card>

        <Card title="Bu ay toptancı bazında alış">
          <BarList items={supplierSpend} emptyText="Bu ay henüz alış yok." />
        </Card>
      </div>

      {/* En çok harcanan ürünler */}
      <div className="mt-6">
        <Card title="En çok harcanan ürünler (tüm zaman)">
          <BarList items={productSpend} emptyText="Henüz alış yok." />
        </Card>
      </div>
    </>
  );
}
