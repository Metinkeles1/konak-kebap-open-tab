import { prisma } from "@/lib/prisma";

// Alış formlarının (klasik form + sayım modu) ORTAK ürün kataloğu.
// İki sayfa eskiden listeyi farklı kurallarla kuruyordu; bu yüzden bir yerde
// eklenen ürün ötekinde görünmüyordu. Tek kaynak burası — kuralı burada değiştir.
//
// Bir toptancının kataloğu =
//   • o toptancıdan fiyatı olan ürünler (alış ya da elle girilmiş fiyat)
//   • ∪ o toptancıya atanmış (defaultSupplier) ürünler
//   • ∪ toptancısı olmayan ("Opsiyonel" bırakılmış) ürünler — hiçbir toptancıya
//     bağlı olmadıklarından HER toptancının listesinde görünürler.

export type CatalogUnit = {
  packageId: string;
  unit: string;
  baseCount: number; // 1 birim = kaç baz birim (1 koli = 24)
  lastPrice: number | null; // kuruş; bu toptancının son fiyatı, yoksa global son fiyat
  purchaseCount: number; // bu toptancıdan kaç (aktif) alışta geçti
};
export type CatalogProduct = {
  productId: string;
  name: string;
  vatRate: number; // ürünün kayıtlı KDV oranı (%) — alış satırına varsayılan gelir
  units: CatalogUnit[];
};
export type SupplierCatalog = Record<string, CatalogProduct[]>;

// supplierIds bir Promise de olabilir: aşağıdaki sorgular id'lere bağlı değildir
// (id'ler yalnızca sonucu toptancı bazında gruplamak için gerekir). Böylece sayfa,
// toptancı listesini beklemeden katalog sorgularını aynı anda başlatabilir.
export async function loadCatalog(supplierIdsInput: string[] | Promise<string[]>) {
  const [supplierIds, products, latestPrices, counts] = await Promise.all([
    supplierIdsInput,
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { packages: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    // Her (toptancı, birim) için yalnızca EN SON fiyat — DB'de DISTINCT ON ile.
    prisma.$queryRaw<{ supplierId: string; productPackageId: string; unitPrice: number }[]>`
      SELECT DISTINCT ON ("supplierId", "productPackageId")
        "supplierId", "productPackageId", "unitPrice"
      FROM "PriceHistory"
      WHERE "supplierId" IS NOT NULL
      ORDER BY "supplierId", "productPackageId", "effectiveDate" DESC
    `,
    // Sıklık: her (toptancı, birim) iptal edilmemiş kaç alışta geçti.
    prisma.$queryRaw<{ supplierId: string; productPackageId: string; n: number }[]>`
      SELECT p."supplierId", i."productPackageId", COUNT(*)::int AS n
      FROM "PurchaseItem" i
      JOIN "Purchase" p ON p.id = i."purchaseId"
      WHERE p."deletedAt" IS NULL
      GROUP BY p."supplierId", i."productPackageId"
    `,
  ]);

  const key = (sid: string, pkgId: string) => `${sid}:${pkgId}`;
  const lastPrice = new Map(latestPrices.map((h) => [key(h.supplierId, h.productPackageId), h.unitPrice]));
  const purchaseCount = new Map(counts.map((c) => [key(c.supplierId, c.productPackageId), c.n]));

  const productById = new Map(products.map((p) => [p.id, p]));
  const pkgToProductId = new Map<string, string>();
  for (const p of products) for (const pkg of p.packages) pkgToProductId.set(pkg.id, p.id);

  // Üyelik: toptancı → ürün id'leri
  const members: Record<string, Set<string>> = {};
  for (const sid of supplierIds) members[sid] = new Set();
  for (const h of latestPrices) {
    const productId = pkgToProductId.get(h.productPackageId);
    if (productId) members[h.supplierId]?.add(productId);
  }
  for (const p of products) {
    if (p.defaultSupplierId) members[p.defaultSupplierId]?.add(p.id);
    else for (const sid of supplierIds) members[sid].add(p.id);
  }

  const catalog: SupplierCatalog = {};
  for (const sid of supplierIds) {
    catalog[sid] = [...members[sid]]
      .map((id) => productById.get(id))
      .filter((p) => p !== undefined)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        vatRate: p.vatRate,
        units: p.packages.map((pkg) => ({
          packageId: pkg.id,
          unit: pkg.name,
          baseCount: pkg.quantityInBase,
          lastPrice: lastPrice.get(key(sid, pkg.id)) ?? pkg.lastUnitPrice,
          purchaseCount: purchaseCount.get(key(sid, pkg.id)) ?? 0,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  // Toptancıdan bağımsız tam liste ("Tüm ürünleri göster", alış düzenleme) —
  // global son fiyatlarla.
  const allProducts: CatalogProduct[] = products.map((p) => ({
    productId: p.id,
    name: p.name,
    vatRate: p.vatRate,
    units: p.packages.map((pkg) => ({
      packageId: pkg.id,
      unit: pkg.name,
      baseCount: pkg.quantityInBase,
      lastPrice: pkg.lastUnitPrice,
      purchaseCount: 0,
    })),
  }));

  return { catalog, allProducts };
}
