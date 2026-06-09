import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewPurchaseForm } from "./new-purchase-form";
import { PurchaseList } from "./purchase-list";
import type { ListPurchase, ProductOpt } from "./edit-purchase-form";

export default async function PurchasesPage() {
  const [suppliers, products, purchases, histItems] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        packages: { where: { deletedAt: null }, orderBy: { name: "asc" } },
      },
    }),
    prisma.purchase.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 30,
      include: {
        supplier: true,
        items: { include: { package: { include: { product: true } } } },
      },
    }),
    // Katalog için: hangi üründen hangi toptancıdan alınmış (tüm geçmiş)
    prisma.purchaseItem.findMany({
      where: { purchase: { deletedAt: null } },
      select: {
        purchase: { select: { supplierId: true } },
        package: { select: { productId: true } },
      },
    }),
  ]);

  // Her (toptancı, birim) için o toptancının EN SON fiyatı (alış ya da elle).
  // Alış formunda otomatik dolan fiyat global değil, seçilen toptancının kendi fiyatı olsun.
  const priceHist = await prisma.priceHistory.findMany({
    where: { supplierId: { not: null } },
    orderBy: { effectiveDate: "desc" },
    select: { supplierId: true, productPackageId: true, unitPrice: true },
  });
  const lastBySupplierPkg = new Map<string, number>();
  for (const h of priceHist) {
    const key = `${h.supplierId}:${h.productPackageId}`;
    if (!lastBySupplierPkg.has(key)) lastBySupplierPkg.set(key, h.unitPrice);
  }

  // Bir toptancının kataloğu = o toptancıdan daha önce alınan ürünler
  // ∪ o toptancıya atanmış (defaultSupplier) ürünler.
  const supplierProductIds: Record<string, Set<string>> = {};
  for (const it of histItems) {
    (supplierProductIds[it.purchase.supplierId] ??= new Set()).add(it.package.productId);
  }
  for (const p of products) {
    if (p.defaultSupplierId) (supplierProductIds[p.defaultSupplierId] ??= new Set()).add(p.id);
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  const catalog: Record<
    string,
    {
      productId: string;
      name: string;
      units: { packageId: string; unit: string; lastPrice: number | null }[];
    }[]
  > = {};
  for (const [sid, ids] of Object.entries(supplierProductIds)) {
    catalog[sid] = [...ids]
      .map((id) => productById.get(id))
      .filter((p) => p !== undefined)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        units: p.packages.map((pkg) => ({
          packageId: pkg.id,
          unit: pkg.name,
          // Bu toptancının bu birimdeki son fiyatı; yoksa global son fiyata düş.
          lastPrice: lastBySupplierPkg.get(`${sid}:${pkg.id}`) ?? pkg.lastUnitPrice,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  // Düzenleme formu için: tüm ürünler ve birimleri (toptancı değişse de seçilebilsin)
  const allProducts: ProductOpt[] = products.map((p) => ({
    productId: p.id,
    name: p.name,
    units: p.packages.map((pkg) => ({
      packageId: pkg.id,
      unit: pkg.name,
      lastPrice: pkg.lastUnitPrice,
    })),
  }));

  // Liste/düzenleme için serileştirilebilir alış verisi
  const clientPurchases: ListPurchase[] = purchases.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier.name,
    date: p.date.toISOString(),
    documentNo: p.documentNo,
    note: p.note,
    total: p.items.reduce((s, i) => s + i.lineTotal, 0),
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.package.productId,
      productName: i.package.product.name,
      packageId: i.productPackageId,
      unit: i.package.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
  }));

  const ready = suppliers.length > 0;

  return (
    <>
      <PageHeader
        title="Alışlar"
        subtitle={`Son ${purchases.length} kayıt`}
        action={
          ready ? (
            <Link
              href="/purchases/sayim"
              className="rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ember-bright"
            >
              Sayım modu
            </Link>
          ) : undefined
        }
      />

      {!ready ? (
        <div className="mb-6 rounded-card border border-ember/30 bg-ember-soft px-5 py-4 text-sm text-ink">
          Alış girebilmek için önce en az bir{" "}
          <Link href="/suppliers" className="font-medium text-ember underline">
            toptancı
          </Link>{" "}
          eklemelisiniz. Ürünleri alış sırasında doğrudan ekleyebilirsiniz.
        </div>
      ) : (
        <div className="mb-6">
          <NewPurchaseForm suppliers={suppliers} catalog={catalog} />
        </div>
      )}

      <PurchaseList
        purchases={clientPurchases}
        suppliers={suppliers}
        products={allProducts}
      />
    </>
  );
}
