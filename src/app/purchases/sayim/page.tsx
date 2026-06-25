import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { CountEntryForm, type CountPackage } from "../count-entry-form";

// Sayım modu: tedarikçinin ürünleri hazır liste olarak gelir, kullanıcı yalnızca
// adet yazar. Veri /purchases sayfasıyla aynı kaynaklardan beslenir; burada
// katalog PAKET (alış birimi) granülünde + her birimin bu toptancıdaki son fiyatı
// + sıklık (kaç alışta geçti) ile kurulur.
export default async function SayimPage() {
  const [suppliers, products, histItems] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { packages: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    // Katalog üyeliği + sıklık: hangi birim hangi toptancıdan kaç kez alınmış.
    prisma.purchaseItem.findMany({
      where: { purchase: { deletedAt: null } },
      select: {
        productPackageId: true,
        purchase: { select: { supplierId: true } },
      },
    }),
  ]);

  // Her (toptancı, birim) için o toptancının EN SON fiyatı.
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

  // Birim bilgileri
  const pkgInfo = new Map<
    string,
    { productId: string; productName: string; unit: string; baseCount: number; lastUnitPrice: number | null }
  >();
  for (const p of products) {
    for (const pkg of p.packages) {
      pkgInfo.set(pkg.id, {
        productId: p.id,
        productName: p.name,
        unit: pkg.name,
        baseCount: pkg.quantityInBase,
        lastUnitPrice: pkg.lastUnitPrice,
      });
    }
  }

  // Üyelik: o toptancıdan alınan birimler ∪ o toptancıya atanmış ürünlerin tüm birimleri
  const supplierPkgIds: Record<string, Set<string>> = {};
  const freqCount = new Map<string, number>();
  for (const it of histItems) {
    const sid = it.purchase.supplierId;
    (supplierPkgIds[sid] ??= new Set()).add(it.productPackageId);
    const key = `${sid}:${it.productPackageId}`;
    freqCount.set(key, (freqCount.get(key) ?? 0) + 1);
  }
  // defaultSupplier'ı olan ürünler yalnızca o toptancıda; toptancısı olmayan
  // ("Opsiyonel" bırakılmış) ürünler hiçbir toptancıya bağlı değildir — bunları
  // HER toptancının listesine ekle ki sayım modunda görünüp girilebilsinler.
  const orphanPkgIds: string[] = [];
  for (const p of products) {
    if (p.defaultSupplierId) {
      for (const pkg of p.packages) (supplierPkgIds[p.defaultSupplierId] ??= new Set()).add(pkg.id);
    } else {
      for (const pkg of p.packages) orphanPkgIds.push(pkg.id);
    }
  }
  if (orphanPkgIds.length) {
    for (const s of suppliers) {
      const set = (supplierPkgIds[s.id] ??= new Set());
      for (const id of orphanPkgIds) set.add(id);
    }
  }

  const catalog: Record<string, CountPackage[]> = {};
  for (const [sid, ids] of Object.entries(supplierPkgIds)) {
    catalog[sid] = [...ids]
      .map((id): CountPackage | null => {
        const info = pkgInfo.get(id);
        if (!info) return null;
        const key = `${sid}:${id}`;
        return {
          packageId: id,
          productId: info.productId,
          productName: info.productName,
          unit: info.unit,
          baseCount: info.baseCount,
          lastPrice: lastBySupplierPkg.get(key) ?? info.lastUnitPrice,
          freq: (freqCount.get(key) ?? 0) >= 2,
        };
      })
      .filter((r): r is CountPackage => r !== null)
      .sort(
        (a, b) =>
          Number(b.freq) - Number(a.freq) || a.productName.localeCompare(b.productName, "tr"),
      );
  }

  return (
    <>
      <PageHeader
        title="Yeni alış · Sayım modu"
        subtitle="Tedarikçinin ürünleri hazır — sadece adet yaz, Enter ile sonraki satıra geç."
        action={
          <Link
            href="/purchases"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2"
          >
            Klasik form
          </Link>
        }
      />

      {suppliers.length === 0 ? (
        <div className="rounded-card border border-ember/30 bg-ember-soft px-5 py-4 text-sm text-ink">
          Alış girebilmek için önce bir{" "}
          <Link href="/suppliers" className="font-medium text-ember underline">
            toptancı
          </Link>{" "}
          ekleyin.
        </div>
      ) : (
        <CountEntryForm suppliers={suppliers} catalog={catalog} />
      )}
    </>
  );
}
