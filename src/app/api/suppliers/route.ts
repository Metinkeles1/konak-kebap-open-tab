import { prisma } from "@/lib/prisma";
import { ok, created, handleError } from "@/lib/api";
import { supplierCreateSchema } from "@/lib/validations";
import type { SupplierBalance } from "@/lib/balance";

// GET /api/suppliers — tüm (silinmemiş) toptancılar + bakiye özeti
export async function GET() {
  try {
    // Toptancı başına ayrı bakiye sorgusu (N+1) yerine sabit 3 sorgu:
    // toptancılar + alış kalemleri + ödeme toplamları; gruplama bellekte.
    const [suppliers, purchaseItems, paymentGroups] = await Promise.all([
      prisma.supplier.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.purchaseItem.findMany({
        where: { purchase: { deletedAt: null, supplier: { deletedAt: null } } },
        select: { lineTotal: true, purchase: { select: { supplierId: true } } },
      }),
      prisma.payment.groupBy({
        by: ["supplierId"],
        where: { deletedAt: null, supplier: { deletedAt: null } },
        _sum: { amount: true },
      }),
    ]);

    const purchasedBySupplier = new Map<string, number>();
    for (const it of purchaseItems) {
      const sid = it.purchase.supplierId;
      purchasedBySupplier.set(sid, (purchasedBySupplier.get(sid) ?? 0) + it.lineTotal);
    }
    const paidBySupplier = new Map<string, number>();
    for (const g of paymentGroups) {
      paidBySupplier.set(g.supplierId, g._sum.amount ?? 0);
    }

    const withBalance = suppliers.map((s) => {
      const totalPurchased = purchasedBySupplier.get(s.id) ?? 0;
      const totalPaid = paidBySupplier.get(s.id) ?? 0;
      const balance: SupplierBalance = {
        supplierId: s.id,
        openingBalance: s.openingBalance,
        totalPurchased,
        totalPaid,
        balance: s.openingBalance + totalPurchased - totalPaid,
      };
      return { ...s, balance };
    });

    return ok(withBalance);
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/suppliers — yeni toptancı
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = supplierCreateSchema.parse(body);
    const supplier = await prisma.supplier.create({ data });
    return created(supplier);
  } catch (err) {
    return handleError(err);
  }
}
