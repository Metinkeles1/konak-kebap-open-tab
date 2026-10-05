import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { loadCatalog } from "@/lib/catalog";
import { CountEntryForm, type CountPackage } from "../count-entry-form";

// Sayım modu: tedarikçinin ürünleri hazır liste olarak gelir, kullanıcı yalnızca
// adet yazar. Katalog klasik formla ORTAK kaynaktan (@/lib/catalog) gelir; burada
// yalnızca PAKET (alış birimi) granülüne açılır ve sıklığa göre sıralanır.
export default async function SayimPage() {
  // Katalog sorguları toptancı listesini beklemeden aynı anda yola çıkar;
  // id'ler yalnızca gruplama için loadCatalog içinde beklenir.
  const suppliersQuery = prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
  const [suppliers, { catalog: byProduct }] = await Promise.all([
    suppliersQuery,
    loadCatalog(suppliersQuery.then((s) => s.map((x) => x.id))),
  ]);

  const catalog: Record<string, CountPackage[]> = {};
  // Birimi hiç tanımlanmamış ürünler sayım satırı olamaz (satır = alış birimi);
  // form bunları "birim ekleyerek gir" kısayolu olarak gösterir.
  const unitless: Record<string, string[]> = {};
  for (const [sid, products] of Object.entries(byProduct)) {
    catalog[sid] = products
      .flatMap((p) =>
        p.units.map((u) => ({
          packageId: u.packageId,
          productId: p.productId,
          productName: p.name,
          unit: u.unit,
          baseCount: u.baseCount,
          lastPrice: u.lastPrice,
          freq: u.purchaseCount >= 2,
        })),
      )
      .sort(
        (a, b) =>
          Number(b.freq) - Number(a.freq) || a.productName.localeCompare(b.productName, "tr"),
      );
    unitless[sid] = products.filter((p) => p.units.length === 0).map((p) => p.name);
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
        <CountEntryForm suppliers={suppliers} catalog={catalog} unitless={unitless} />
      )}
    </>
  );
}
