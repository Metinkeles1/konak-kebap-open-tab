import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatKurus, kurusToInput } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { vatBreakdown, vatRatesLabel } from "@/lib/vat";
import {
  deletePayment,
  deletePurchase,
  updateOpeningBalance,
} from "@/app/actions";
import { PageHeader, Card, Stat, Badge, inputClass } from "@/components/ui";
import { SubmitButton, DeleteButton } from "@/components/form";
import { PaymentDialog } from "@/components/payment-dialog";
import { BalanceReconButton } from "@/components/reconciliation";

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

// Ekstrede varsayılan olarak gösterilen son hareket sayısı.
const RECENT_LIMIT = 15;

// Ekstre ızgarası: telefonda 3 sütun (metin | tutar | sil), md+ 6 sütun.
const LEDGER_COLS =
  "grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-[8.5rem_minmax(0,1fr)_6.5rem_6.5rem_7rem_2.75rem]";
const LEDGER_ROW = `grid ${LEDGER_COLS} items-start gap-x-3 gap-y-0.5 px-4 py-3 md:px-5`;

const balanceTone = (k: number) => (k > 0 ? "text-debt" : k < 0 ? "text-credit" : "text-muted");

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const showAll = (await searchParams).tum === "1";

  // Hepsi paralel: önce toptancıyı bekleyip sonra hareketleri çekmek bir DB turu
  // (Neon'a ~50–90 ms) fazladan bekletiyordu. Toptancı yoksa diğer sorgular boş döner.
  const [supplier, purchases, payments, catalog] = await Promise.all([
    prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    }),
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
  if (!supplier) notFound();

  // Bakiye, zaten çekilmiş olan alış+ödemelerden hesaplanır — ayrıca
  // getSupplierBalance çağırıp 3 toplulaştırma sorgusu daha atmaya gerek yok.
  // Alış toplamı KDV dahildir (KDV başlık düzeyinde tutulur).
  const totalPurchased = purchases.reduce(
    (s, p) => s + p.items.reduce((a, i) => a + i.lineTotal, 0) + p.vatAmount,
    0,
  );
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = {
    openingBalance: supplier.openingBalance,
    totalPurchased,
    totalPaid,
    balance: supplier.openingBalance + totalPurchased - totalPaid,
  };

  // --- Cari ekstre: açılış + alış (+) + ödeme (−), kronolojik, yürüyen bakiyeli ---
  const txns = [
    ...purchases.map((p) => {
      const itemsTotal = p.items.reduce((s, i) => s + i.lineTotal, 0);
      const itemsDesc = p.items
        .map((i) => `${i.package.product.name} · ${i.package.name}×${i.quantity}`)
        .join(", ");
      return {
        date: p.date,
        kind: "purchase" as const,
        amount: itemsTotal + p.vatAmount, // KDV dahil borç
        documentNo: p.documentNo,
        sub:
          p.vatAmount > 0
            ? `${itemsDesc} · +KDV ${vatRatesLabel(vatBreakdown(p.items))} (${formatKurus(p.vatAmount)})`
            : itemsDesc,
        id: p.id,
      };
    }),
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

  // Uzun ekstrede yalnızca son hareketleri göster; öncekiler tek "devreden" satırında özetlenir.
  const hiddenCount = showAll ? 0 : Math.max(0, entries.length - RECENT_LIMIT);
  const visibleEntries = entries.slice(hiddenCount);
  const carriedBalance = hiddenCount > 0 ? entries[hiddenCount - 1].balance : 0;

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
          // Telefonda iki eşit düğme yan yana; borç rozeti gizli (hemen altta
          // "Kalan borç" kartı zaten gösteriyor). Geniş ekranda tek satır.
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <span className="hidden sm:inline-flex">
              {balance.balance > 0 ? (
                <Badge tone="debt">{formatKurus(balance.balance)} borç</Badge>
              ) : (
                <Badge tone="credit">Borç yok</Badge>
              )}
            </span>
            <BalanceReconButton supplierId={id} supplierName={supplier.name} />
            <PaymentDialog supplierId={id} supplierName={supplier.name} balance={balance.balance} />
          </div>
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
        <Card
          title={showAll || hiddenCount === 0 ? "Cari ekstre" : `Cari ekstre · son ${RECENT_LIMIT} hareket`}
          bodyClassName=""
          action={
            showAll ? (
              <Link href={`/suppliers/${id}`} scroll={false} className="text-xs text-muted hover:text-ember">
                Son hareketler
              </Link>
            ) : hiddenCount > 0 ? (
              <Link href={`/suppliers/${id}?tum=1`} scroll={false} className="text-xs text-muted hover:text-ember">
                Tümünü göster ({entries.length})
              </Link>
            ) : undefined
          }
        >
          {entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Henüz hareket yok. Açılış bakiyesi girin ya da alış/ödeme ekleyin.
            </p>
          ) : (
            // Tek DOM, iki düzen. Telefonda her hareket bir satır kartı:
            //   tarih                     ± tutar   [sil]
            //   açıklama · kalemler       bakiye
            // md ve üstünde 6 sütunlu ekstre tablosu. (Eski <table> telefonda
            // ekranın dışına 749px taşıyordu.)
            <div className="text-sm">
              <div className={`${LEDGER_COLS} hidden gap-x-3 border-b border-line px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted md:grid`}>
                <span>Tarih</span>
                <span>Açıklama</span>
                <span className="text-right">Borç (+)</span>
                <span className="text-right">Alacak (−)</span>
                <span className="text-right">Bakiye</span>
                <span />
              </div>
              <ul className="divide-y divide-line">
                {hiddenCount > 0 && (
                  <li className={`${LEDGER_ROW} bg-surface-2/60`}>
                    <span className="hidden text-muted md:block">—</span>
                    <span className="col-start-1 row-span-2 row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto">
                      <Link
                        href={`/suppliers/${id}?tum=1`}
                        scroll={false}
                        className="font-medium text-ink-soft hover:text-ember"
                      >
                        Önceki {hiddenCount} hareket
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">Devreden bakiye</p>
                    </span>
                    <span className="hidden md:block" />
                    <span className="hidden md:block" />
                    <span className={`nums col-start-2 row-span-2 row-start-1 self-center text-right font-semibold md:col-start-auto md:row-span-1 md:row-start-auto md:self-auto ${balanceTone(carriedBalance)}`}>
                      {formatKurus(carriedBalance)}
                    </span>
                    <span className="hidden md:block" />
                  </li>
                )}
                {visibleEntries.map((e) => (
                  <li key={e.key} className={`${LEDGER_ROW} hover:bg-surface-2`}>
                    <span className="nums col-start-1 row-start-1 whitespace-nowrap text-[11px] text-muted md:col-start-auto md:row-start-auto md:text-sm">
                      {e.kind === "opening"
                        ? "—"
                        : e.kind === "purchase"
                          ? formatDateTime(e.date)
                          : formatDate(e.date)}
                    </span>
                    <span className="col-start-1 row-start-2 min-w-0 md:col-start-auto md:row-start-auto">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink">{e.desc}</span>
                        {e.documentNo && <Badge>{e.documentNo}</Badge>}
                        {e.kind === "opening" && <Badge tone="ember">devir</Badge>}
                      </span>
                      {e.sub && <p className="mt-0.5 line-clamp-2 text-xs text-muted md:line-clamp-none">{e.sub}</p>}
                    </span>
                    {/* Telefonda borç ve alacaktan yalnızca dolu olan, işaretiyle gösterilir. */}
                    <span className={`nums col-start-2 row-start-1 text-right font-medium text-debt md:col-start-auto md:row-start-auto md:font-normal ${e.debit ? "" : "hidden md:block"}`}>
                      {e.debit ? (
                        <>
                          <span className="md:hidden">+</span>
                          {formatKurus(e.debit)}
                        </>
                      ) : null}
                    </span>
                    <span className={`nums col-start-2 row-start-1 text-right font-medium text-credit md:col-start-auto md:row-start-auto md:font-normal ${e.credit ? "" : "hidden md:block"}`}>
                      {e.credit ? (
                        <>
                          <span className="md:hidden">−</span>
                          {formatKurus(e.credit)}
                        </>
                      ) : null}
                    </span>
                    <span className={`nums col-start-2 row-start-2 self-start text-right text-xs font-semibold md:col-start-auto md:row-start-auto md:text-sm ${balanceTone(e.balance)}`}>
                      <span className="mr-1 font-normal text-muted md:hidden">bakiye</span>
                      {formatKurus(e.balance)}
                    </span>
                    <span className="col-start-3 row-span-2 row-start-1 self-center text-right md:col-start-auto md:row-span-1 md:row-start-auto md:self-auto">
                      {e.del && (
                        <form action={e.del.action}>
                          <input type="hidden" name="id" value={e.del.id} />
                          <input type="hidden" name="supplierId" value={id} />
                          <DeleteButton
                            confirm={
                              e.kind === "purchase"
                                ? `${formatKurus(e.debit)} tutarındaki bu alış silinsin mi? Cari bakiye güncellenir.`
                                : `${formatKurus(e.credit)} tutarındaki bu ödeme silinsin mi? Cari bakiye güncellenir.`
                            }
                          />
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Açılış / devir bakiyesi */}
          <Card title="Açılış (devir) bakiyesi">
            <form action={updateOpeningBalance} className="flex gap-3">
              <input type="hidden" name="supplierId" value={id} />
              <input
                name="openingBalance"
                inputMode="decimal"
                defaultValue={kurusToInput(balance.openingBalance)}
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
                <li key={product.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="min-w-0 font-medium text-ink">{product.name}</span>
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
