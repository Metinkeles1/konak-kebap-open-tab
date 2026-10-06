import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewPurchaseForm } from "./new-purchase-form";
import { PurchaseList } from "./purchase-list";
import type { ListPurchase } from "./edit-purchase-form";
import { loadCatalog } from "@/lib/catalog";

export default async function PurchasesPage() {
  const suppliersQuery = prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
  // Ürün kataloğu sayım moduyla ORTAK kaynaktan — iki form aynı ürünleri görür.
  // Tüm sorgular aynı anda yola çıkar; katalog toptancı id'lerini yalnızca
  // gruplama için (kendi içinde) bekler.
  const [suppliers, purchases, { catalog, allProducts }] = await Promise.all([
    suppliersQuery,
    prisma.purchase.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 30,
      include: {
        supplier: true,
        items: { include: { package: { include: { product: true } } } },
      },
    }),
    loadCatalog(suppliersQuery.then((s) => s.map((x) => x.id))),
  ]);

  // Liste/düzenleme için serileştirilebilir alış verisi
  const clientPurchases: ListPurchase[] = purchases.map((p) => {
    const subtotal = p.items.reduce((s, i) => s + i.lineTotal, 0);
    return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplier.name,
    date: p.date.toISOString(),
    documentNo: p.documentNo,
    note: p.note,
    subtotal,
    vatAmount: p.vatAmount,
    total: subtotal + p.vatAmount, // KDV dahil
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.package.productId,
      productName: i.package.product.name,
      packageId: i.productPackageId,
      unit: i.package.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      vatRate: i.vatRate,
      vatAmount: i.vatAmount,
    })),
    };
  });

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
          <NewPurchaseForm suppliers={suppliers} catalog={catalog} allProducts={allProducts} />
        </div>
      )}

      <PurchaseList
        purchases={clientPurchases}
        suppliers={suppliers}
        products={allProducts}
        catalog={catalog}
      />
    </>
  );
}
