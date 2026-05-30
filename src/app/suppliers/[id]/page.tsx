import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSupplierBalance } from "@/lib/balance";
import { formatKurus } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  createPayment,
  deletePayment,
  deletePurchase,
  updateOpeningBalance,
} from "@/app/actions";
import { PageHeader, Card, Stat, Badge, inputClass } from "@/components/ui";
import { SubmitButton, DeleteButton } from "@/components/form";

type Entry = {
  key: string;
  date: Date;
  kind: "opening" | "purchase" | "payment";
  desc: string;
  sub?: string;
  documentNo?: string | null;
  debit: number; // borç (+)
  credit: number; // alacak (−)
  balance: number; // yürüyen bakiye
  del?: { action: typeof deletePurchase; id: string };
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
  });
  if (!supplier) notFound();

  const [balance, purchases, payments, catalog] = await Promise.all([
    getSupplierBalance(id),
    prisma.purchase.findMany({
      where: { supplierId: id, deletedAt: null },
      orderBy: { date: "asc" },
      include: { items: { include: { package: { include: { product: true } } } } },
    }),
    prisma.payment.findMany({
      where: { supplierId: id, deletedAt: null },
      orderBy: { date: "asc" },
    }),
    prisma.product.findMany({
      where: { defaultSupplierId: id, deletedAt: null },
      orderBy: { name: "asc" },
      include: { packages: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
  ]);

  // --- Cari ekstre: açılış + alış (+) + ödeme (−), kronolojik, yürüyen bakiyeli ---
  const txns = [
    ...purchases.map((p) => ({
      date: p.date,
      kind: "purchase" as const,
      amount: p.items.reduce((s, i) => s + i.lineTotal, 0),
      documentNo: p.documentNo,
      sub: p.items
        .map((i) => `${i.package.product.name} · ${i.package.name}×${i.quantity}`)
        .join(", "),
      id: p.id,
    })),
    ...payments.map((p) => ({
      date: p.date,
      kind: "payment" as const,
      amount: p.amount,
      documentNo: null as string | null,
      sub: p.method ?? undefined,
      id: p.id,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "purchase" ? -1 : 1));

  const entries: Entry[] = [];
  let running = supplier.openingBalance;
  if (supplier.openingBalance !== 0) {
    entries.push({
      key: "opening",
      date: supplier.createdAt,
      kind: "opening",
      desc: "Devir / Açılış bakiyesi",
      debit: supplier.openingBalance > 0 ? supplier.openingBalance : 0,
      credit: supplier.openingBalance < 0 ? -supplier.openingBalance : 0,
      balance: running,
    });
  }
  for (const t of txns) {
    running += t.kind === "purchase" ? t.amount : -t.amount;
    entries.push({
      key: `${t.kind}-${t.id}`,
      date: t.date,
      kind: t.kind,
      desc: t.kind === "purchase" ? "Alış" : "Ödeme",
      sub: t.sub,
      documentNo: t.documentNo,
      debit: t.kind === "purchase" ? t.amount : 0,
      credit: t.kind === "payment" ? t.amount : 0,
      balance: running,
      del: { action: t.kind === "purchase" ? deletePurchase : deletePayment, id: t.id },
    });
  }

  return (
    <>
      <Link
        href="/suppliers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ember"
      >
        ← Toptancılar
      </Link>

      <PageHeader
        title={supplier.name}
        subtitle={supplier.phone ?? undefined}
        action={
          balance.balance > 0 ? (
            <Badge tone="debt">{formatKurus(balance.balance)} borç</Badge>
          ) : (
            <Badge tone="credit">Borç yok</Badge>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Açılış bakiyesi" value={formatKurus(balance.openingBalance)} />
        <Stat label="Toplam alış" value={formatKurus(balance.totalPurchased)} tone="ember" />
        <Stat label="Toplam ödeme" value={formatKurus(balance.totalPaid)} tone="credit" />
        <Stat
          label="Kalan borç"
          value={formatKurus(balance.balance)}
          tone={balance.balance > 0 ? "debt" : "credit"}
        />
      </div>

      {/* Cari ekstre */}
      <div className="mt-6">
        <Card title="Cari ekstre" bodyClassName="">
          {entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Henüz hareket yok. Açılış bakiyesi girin ya da alış/ödeme ekleyin.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">Tarih</th>
                  <th className="px-5 py-3 font-medium">Açıklama</th>
                  <th className="px-5 py-3 text-right font-medium">Borç (+)</th>
                  <th className="px-5 py-3 text-right font-medium">Alacak (−)</th>
                  <th className="px-5 py-3 text-right font-medium">Bakiye</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.key} className="align-top hover:bg-surface-2">
                    <td className="nums whitespace-nowrap px-5 py-3 text-muted">
                      {e.kind === "opening"
                        ? "—"
                        : e.kind === "purchase"
                          ? formatDateTime(e.date)
                          : formatDate(e.date)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{e.desc}</span>
                        {e.documentNo && <Badge>{e.documentNo}</Badge>}
                        {e.kind === "opening" && <Badge tone="ember">devir</Badge>}
                      </div>
                      {e.sub && <p className="mt-0.5 text-xs text-muted">{e.sub}</p>}
                    </td>
                    <td className="nums px-5 py-3 text-right text-debt">
                      {e.debit ? formatKurus(e.debit) : ""}
                    </td>
                    <td className="nums px-5 py-3 text-right text-credit">
                      {e.credit ? formatKurus(e.credit) : ""}
                    </td>
                    <td
                      className={`nums px-5 py-3 text-right font-semibold ${
                        e.balance > 0 ? "text-debt" : e.balance < 0 ? "text-credit" : "text-muted"
                      }`}
                    >
                      {formatKurus(e.balance)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {e.del && (
                        <form action={e.del.action}>
                          <input type="hidden" name="id" value={e.del.id} />
                          <input type="hidden" name="supplierId" value={id} />
                          <DeleteButton />
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Ödeme ekle */}
          <Card title="Ödeme ekle">
            <form action={createPayment} className="space-y-3">
              <input type="hidden" name="supplierId" value={id} />
              <div className="grid grid-cols-2 gap-3">
                <input name="amount" required inputMode="decimal" placeholder="Tutar (TL) *" className={inputClass} />
                <select name="method" defaultValue="NAKIT" className={inputClass}>
                  <option value="NAKIT">Nakit</option>
                  <option value="HAVALE">Havale</option>
                  <option value="KART">Kart</option>
                  <option value="CEK">Çek</option>
                  <option value="DIGER">Diğer</option>
                </select>
              </div>
              <input name="note" placeholder="Not" className={inputClass} />
              <SubmitButton variant="accent" className="w-full">
                Ödemeyi kaydet
              </SubmitButton>
            </form>
          </Card>

          {/* Açılış / devir bakiyesi */}
          <Card title="Açılış (devir) bakiyesi">
            <form action={updateOpeningBalance} className="flex gap-3">
              <input type="hidden" name="supplierId" value={id} />
              <input
                name="openingBalance"
                inputMode="decimal"
                defaultValue={(balance.openingBalance / 100).toString().replace(".", ",")}
                placeholder="Devir borcu (TL)"
                className={inputClass}
              />
              <SubmitButton variant="ghost">Kaydet</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-muted">
              Sistemi kurmadan önceki mevcut borcu buraya girin; ekstrenin başında “devir” olarak görünür.
            </p>
          </Card>
        </div>

        {/* Ürün kataloğu */}
        {catalog.length > 0 && (
          <Card title={`Ürün kataloğu · ${catalog.length}`} bodyClassName="">
            <ul className="divide-y divide-line">
              {catalog.map((product) => (
                <li key={product.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-ink">{product.name}</span>
                  <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-muted">
                    {product.packages.map((pkg) => (
                      <span key={pkg.id} className="nums">
                        {pkg.name}
                        {pkg.lastUnitPrice != null && (
                          <span className="ml-1 text-ink-soft">{formatKurus(pkg.lastUnitPrice)}</span>
                        )}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
