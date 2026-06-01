import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { NewProductForm } from "./new-product-form";
import { ProductList, type ProductDetail } from "./product-list";

export default async function ProductsPage() {
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        defaultSupplier: { select: { id: true, name: true } },
        packages: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            priceHistory: {
              orderBy: { effectiveDate: "desc" },
              include: { supplier: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  // Detayları sunucuda önceden hesapla → modal anında, ek istek olmadan açılır.
  const details: ProductDetail[] = products.map((p) => {
    const supMap = new Map<string, { id: string; name: string }>();
    const units = p.packages.map((pkg) => {
      // Her birim için her toptancının EN SON fiyatı + bir ÖNCEKİ fiyatı (zam için).
      // priceHistory tarihe göre azalan → ilk görülen güncel, ikinci görülen önceki.
      const seen = new Map<string, number>();
      const cells: Record<
        string,
        { price: number; prevPrice: number | null; date: string; source: string }
      > = {};
      for (const h of pkg.priceHistory) {
        if (!h.supplier) continue;
        const count = seen.get(h.supplier.id) ?? 0;
        if (count === 0) {
          supMap.set(h.supplier.id, { id: h.supplier.id, name: h.supplier.name });
          cells[h.supplier.id] = {
            price: h.unitPrice,
            prevPrice: null,
            date: h.effectiveDate.toISOString(),
            source: h.source,
          };
        } else if (count === 1) {
          cells[h.supplier.id].prevPrice = h.unitPrice;
        }
        seen.set(h.supplier.id, count + 1);
      }
      return {
        packageId: pkg.id,
        name: pkg.name,
        quantityInBase: pkg.quantityInBase,
        lastUnitPrice: pkg.lastUnitPrice,
        cells,
        history: pkg.priceHistory.map((h) => ({
          id: h.id,
          date: h.effectiveDate.toISOString(),
          price: h.unitPrice,
          source: h.source,
          supplierName: h.supplier?.name ?? null,
        })),
      };
    });

    const supplierCols = [...supMap.values()]
      .map((s) => ({ id: s.id, name: s.name, isDefault: s.id === p.defaultSupplierId }))
      .sort((a, b) =>
        a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name, "tr"),
      );

    return {
      id: p.id,
      name: p.name,
      baseUnit: p.baseUnit,
      defaultSupplierName: p.defaultSupplier?.name ?? null,
      suppliers: supplierCols,
      units,
    };
  });

  return (
    <>
      <PageHeader title="Ürünler" subtitle={`${products.length} ürün`} />

      <Card title="Yeni ürün" className="mb-6">
        <NewProductForm suppliers={suppliers} />
      </Card>

      <ProductList products={details} />
    </>
  );
}
