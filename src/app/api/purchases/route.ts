import { prisma } from "@/lib/prisma";
import { ok, created, fail, handleError } from "@/lib/api";
import { purchaseCreateSchema } from "@/lib/validations";

// GET /api/purchases — (silinmemiş) alışlar. ?supplierId=... ile filtrelenebilir.
export async function GET(req: Request) {
  try {
    const supplierId = new URL(req.url).searchParams.get("supplierId");
    const purchases = await prisma.purchase.findMany({
      where: { deletedAt: null, ...(supplierId ? { supplierId } : {}) },
      orderBy: { date: "desc" },
      include: {
        supplier: true,
        items: { include: { package: { include: { product: true } } } },
      },
    });
    return ok(purchases);
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/purchases — yeni alış.
// Her kalemde fiyat DONDURULUR; verilmezse birimin son fiyatı kullanılır.
// Aynı işlemde fiyat geçmişi yazılır ve birimin lastUnitPrice'ı güncellenir.
export async function POST(req: Request) {
  try {
    const data = purchaseCreateSchema.parse(await req.json());

    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, deletedAt: null },
    });
    if (!supplier) return fail("Toptancı bulunamadı", 404);

    // Kalem birimlerini doğrula ve fiyatları çöz
    const packageIds = data.items.map((i) => i.productPackageId);
    const packages = await prisma.productPackage.findMany({
      where: { id: { in: packageIds }, deletedAt: null },
    });
    const packageById = new Map(packages.map((p) => [p.id, p]));

    const resolvedItems = data.items.map((item) => {
      const pkg = packageById.get(item.productPackageId);
      if (!pkg) {
        throw new Error(`Alış birimi bulunamadı: ${item.productPackageId}`);
      }
      const unitPrice = item.unitPrice ?? pkg.lastUnitPrice;
      if (unitPrice == null) {
        throw new Error(
          `'${pkg.name}' birimi için fiyat gerekli (kayıtlı son fiyat yok)`,
        );
      }
      return {
        productPackageId: pkg.id,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity), // kuruş tam sayı kalsın
      };
    });

    const purchase = await prisma.$transaction(async (tx) => {
      const row = await tx.purchase.create({
        data: {
          supplierId: data.supplierId,
          date: data.date,
          note: data.note,
          items: { create: resolvedItems },
        },
        include: { items: true },
      });

      for (const item of resolvedItems) {
        await tx.priceHistory.create({
          data: {
            productPackageId: item.productPackageId,
            supplierId: data.supplierId,
            unitPrice: item.unitPrice,
            source: "PURCHASE",
          },
        });
        await tx.productPackage.update({
          where: { id: item.productPackageId },
          data: { lastUnitPrice: item.unitPrice },
        });
      }

      return row;
    });

    return created(purchase);
  } catch (err) {
    return handleError(err);
  }
}
