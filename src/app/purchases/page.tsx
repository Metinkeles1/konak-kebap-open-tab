import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewPurchaseForm } from "./new-purchase-form";
import { PurchaseList } from "./purchase-list";
import type { ListPurchase, ProductOpt } from "./edit-purchase-form";

export default async function PurchasesPage() {
  // Her (toptancı, birim) için o toptancının EN SON fiyatı, tek sorguda.
  // Eskiden TÜM PriceHistory tablosu belleğe çekilip elenirdi (zamanla sınırsız
  // büyür). DISTINCT ON ile DB her grup için yalnızca en güncel satırı döndürür.
  const [suppliers, products, purchases, latestPrices] = await Promise.all([
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
    prisma.$queryRaw<
      { supplierId: string; productPackageId: string; unitPrice: number }[]
    >`
      SELECT DISTINCT ON ("supplierId", "productPackageId")
        "supplierId", "productPackageId", "unitPrice"
      FROM "PriceHistory"
      WHERE "supplierId" IS NOT NULL
      ORDER BY "supplierId", "productPackageId", "effectiveDate" DESC
    `,
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  // Birim (paket) → ürün eşlemesi: hangi fiyat hangi ürüne ait, hızlı bulunsun.
  const pkgToProductId = new Map<string, string>();
  for (const p of products) {
    for (const pkg of p.packages) pkgToProductId.set(pkg.id, p.id);
  }

  // Tek geçişte hem (toptancı,birim)→son fiyat hem de toptancı→ürün kataloğu kur.
  // Bir toptancının kataloğu = o toptancının fiyatı olan (alış ya da elle) ürünler
  // ∪ o toptancıya atanmış (defaultSupplier) ürünler. Böylece ayrı bir "tüm alış
  // kalemleri" taraması (histItems) gerekmez.
  const lastBySupplierPkg = new Map<string, number>();
  const supplierProductIds: Record<string, Set<string>> = {};
  for (const h of latestPrices) {
    lastBySupplierPkg.set(`${h.supplierId}:${h.productPackageId}`, h.unitPrice);
    const productId = pkgToProductId.get(h.productPackageId);
    if (productId) (supplierProductIds[h.supplierId] ??= new Set()).add(productId);
  }
  for (const p of products) {
    if (p.defaultSupplierId) (supplierProductIds[p.defaultSupplierId] ??= new Set()).add(p.id);
  }

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
