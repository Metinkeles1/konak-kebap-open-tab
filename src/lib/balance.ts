import { prisma } from "@/lib/prisma";

export type SupplierBalance = {
  supplierId: string;
  openingBalance: number; // devir/açılış borcu (kuruş)
  totalPurchased: number; // toplam alış (kuruş)
  totalPaid: number; // toplam ödeme (kuruş)
  balance: number; // borç = açılış + alış - ödeme (kuruş)
};

/**
 * Bir toptancının cari durumu.
 * borç = açılış bakiyesi + Σ(silinmemiş alış kalemleri) − Σ(silinmemiş ödemeler)
 */
export async function getSupplierBalance(
  supplierId: string,
): Promise<SupplierBalance> {
  const [supplier, purchaseAgg, vatAgg, paymentAgg] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { openingBalance: true },
    }),
    prisma.purchaseItem.aggregate({
      _sum: { lineTotal: true },
      where: { purchase: { supplierId, deletedAt: null } },
    }),
    // KDV başlık düzeyinde tutulur; cari borca dahildir.
    prisma.purchase.aggregate({
      _sum: { vatAmount: true },
      where: { supplierId, deletedAt: null },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { supplierId, deletedAt: null },
    }),
  ]);

  const openingBalance = supplier?.openingBalance ?? 0;
  // Toplam alış = kalemler (KDV hariç) + KDV tutarları (KDV dahil borç).
  const totalPurchased =
    (purchaseAgg._sum.lineTotal ?? 0) + (vatAgg._sum.vatAmount ?? 0);
  const totalPaid = paymentAgg._sum.amount ?? 0;

  return {
    supplierId,
    openingBalance,
    totalPurchased,
    totalPaid,
    balance: openingBalance + totalPurchased - totalPaid,
  };
}
