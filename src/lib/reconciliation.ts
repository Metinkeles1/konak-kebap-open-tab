// Toptancıyla cari mutabakat verisi — WhatsApp mesajının kaynağı.
// Bakiye, toptancı detayındaki cari ekstreyle BİREBİR aynı sırayla hesaplanır
// (tarihe göre; aynı anda alış ödemeden önce), böylece mesajdaki "önceki bakiye"
// ve "bu alış sonrası bakiye" ekstredeki yürüyen bakiyeyle tutar.
import { prisma } from "@/lib/prisma";

export type ReconItem = {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number; // kuruş
  lineTotal: number; // kuruş
};

export type PurchaseReconciliation = {
  kind: "purchase";
  supplierName: string;
  supplierPhone: string | null;
  date: string; // ISO
  documentNo: string | null;
  items: ReconItem[];
  subtotal: number;
  vatRate: number | null;
  vatAmount: number;
  total: number;
  /** Bu alıştan hemen önceki bakiye (ekstre sırasıyla). */
  balanceBefore: number;
  /** Bu alıştan hemen sonraki bakiye. */
  balanceAfter: number;
  /** Bugünkü bakiye (alıştan sonra başka hareket varsa balanceAfter'dan farklıdır). */
  balanceNow: number;
};

export type BalanceReconciliation = {
  kind: "balance";
  supplierName: string;
  supplierPhone: string | null;
  balanceNow: number;
  asOf: string; // ISO — bakiyenin hesaplandığı an
  /** Son hareketler (eskiden yeniye). */
  recent: { date: string; label: string; documentNo: string | null; amount: number }[];
};

type Txn = { id: string; date: Date; kind: "purchase" | "payment"; amount: number; documentNo: string | null };

// Ekstreyle aynı sıralama: tarih, eşitse alış önce.
function sortTxns(txns: Txn[]) {
  return txns.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "purchase" ? -1 : 1),
  );
}

async function loadSupplierTxns(supplierId: string): Promise<Txn[]> {
  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: { supplierId, deletedAt: null },
      select: {
        id: true,
        date: true,
        documentNo: true,
        vatAmount: true,
        items: { select: { lineTotal: true } },
      },
    }),
    prisma.payment.findMany({
      where: { supplierId, deletedAt: null },
      select: { id: true, date: true, amount: true },
    }),
  ]);
  return sortTxns([
    ...purchases.map((p) => ({
      id: p.id,
      date: p.date,
      kind: "purchase" as const,
      amount: p.items.reduce((s, i) => s + i.lineTotal, 0) + p.vatAmount, // KDV dahil
      documentNo: p.documentNo,
    })),
    ...payments.map((p) => ({
      id: p.id,
      date: p.date,
      kind: "payment" as const,
      amount: p.amount,
      documentNo: null,
    })),
  ]);
}

export async function getPurchaseReconciliation(
  purchaseId: string,
): Promise<PurchaseReconciliation | null> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true, phone: true, openingBalance: true } },
      items: {
        orderBy: { id: "asc" },
        include: { package: { select: { name: true, product: { select: { name: true } } } } },
      },
    },
  });
  if (!purchase) return null;

  const txns = await loadSupplierTxns(purchase.supplierId);
  let running = purchase.supplier.openingBalance;
  let balanceBefore = running;
  let balanceAfter = running;
  for (const t of txns) {
    if (t.id === purchase.id) balanceBefore = running;
    running += t.kind === "purchase" ? t.amount : -t.amount;
    if (t.id === purchase.id) balanceAfter = running;
  }

  const items = purchase.items.map((i) => ({
    name: i.package.product.name,
    unit: i.package.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  }));
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);

  return {
    kind: "purchase",
    supplierName: purchase.supplier.name,
    supplierPhone: purchase.supplier.phone,
    date: purchase.date.toISOString(),
    documentNo: purchase.documentNo,
    items,
    subtotal,
    vatRate: purchase.vatRate,
    vatAmount: purchase.vatAmount,
    total: subtotal + purchase.vatAmount,
    balanceBefore,
    balanceAfter,
    balanceNow: running,
  };
}

export async function getBalanceReconciliation(
  supplierId: string,
  recentCount = 5,
): Promise<BalanceReconciliation | null> {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
    select: { name: true, phone: true, openingBalance: true },
  });
  if (!supplier) return null;

  const txns = await loadSupplierTxns(supplierId);
  const balanceNow =
    supplier.openingBalance +
    txns.reduce((s, t) => s + (t.kind === "purchase" ? t.amount : -t.amount), 0);

  return {
    kind: "balance",
    supplierName: supplier.name,
    supplierPhone: supplier.phone,
    balanceNow,
    asOf: new Date().toISOString(),
    recent: txns.slice(-recentCount).map((t) => ({
      date: t.date.toISOString(),
      label: t.kind === "purchase" ? "Alış" : "Ödeme",
      documentNo: t.documentNo,
      amount: t.kind === "purchase" ? t.amount : -t.amount,
    })),
  };
}
