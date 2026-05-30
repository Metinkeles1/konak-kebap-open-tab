import { prisma } from "@/lib/prisma";
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { addPackage, deleteProduct, updatePackagePrice, applyProportionalPrice } from "@/app/actions";
import { PageHeader, Card, Badge, EmptyState, inputClass } from "@/components/ui";
import { SubmitButton, DeleteButton } from "@/components/form";
import { NewProductForm } from "./new-product-form";

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
        packages: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            // Bu birimin fiyat değişim geçmişi (en yeni önce)
            priceHistory: {
              orderBy: { effectiveDate: "desc" },
              take: 12,
              include: { supplier: { select: { name: true } } },
            },
          },
        },
        defaultSupplier: true,
      },
    }),
  ]);

  // Toptancıya göre grupla
  const groups = new Map<string, { name: string; items: typeof products }>();
  for (const p of products) {
    const key = p.defaultSupplierId ?? "_none";
    const name = p.defaultSupplier?.name ?? "Toptancısı atanmamış";
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)!.items.push(p);
  }

  return (
    <>
      <PageHeader title="Ürünler" subtitle={`${products.length} ürün`} />

      <Card title="Yeni ürün" className="mb-6">
        <NewProductForm suppliers={suppliers} />
      </Card>

      {products.length === 0 ? (
        <Card>
          <EmptyState title="Henüz ürün yok." hint="Yukarıdan ya da alış ekranından ürün ekleyin." />
        </Card>
      ) : (
        <div className="space-y-8">
          {[...groups.values()].map((group) => (
            <section key={group.name}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-ember" />
                {group.name}
                <span className="text-muted">· {group.items.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {group.items.map((product) => (
                  <Card key={product.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-display text-lg font-semibold text-ink">
                          {product.name}
                        </h3>
                        <Badge tone="neutral">{product.baseUnit}</Badge>
                      </div>
                      <form action={deleteProduct}>
                        <input type="hidden" name="id" value={product.id} />
                        <DeleteButton />
                      </form>
                    </div>

                    {product.packages.length > 0 && (
                      <ul className="mt-4 space-y-1.5">
                        {product.packages.map((pkg) => (
                          <li key={pkg.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-ink">
                                {pkg.name}{" "}
                                <span className="text-muted">
                                  · {pkg.quantityInBase} {product.baseUnit}
                                </span>
                              </span>
                              {/* Fiyatı doğrudan düzenle — kaydedince sonraki alışlara yansır */}
                              <form action={updatePackagePrice} className="flex shrink-0 items-center gap-1.5">
                                <input type="hidden" name="packageId" value={pkg.id} />
                                <input
                                  name="price"
                                  inputMode="decimal"
                                  defaultValue={
                                    pkg.lastUnitPrice != null
                                      ? (pkg.lastUnitPrice / 100).toFixed(2).replace(".", ",")
                                      : ""
                                  }
                                  placeholder="Fiyat"
                                  aria-label={`${pkg.name} birim fiyatı (TL)`}
                                  className="nums w-24 rounded-md border border-line bg-surface px-2 py-1 text-right text-ink outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15"
                                />
                                <span className="text-xs text-muted">₺</span>
                                <SubmitButton variant="ghost" className="px-2.5! py-1! text-xs!">
                                  Kaydet
                                </SubmitButton>
                                {product.packages.length > 1 && (
                                  <button
                                    type="submit"
                                    formAction={applyProportionalPrice}
                                    title="Bu fiyatı baz alıp diğer birimleri quantityInBase oranıyla güncelle"
                                    className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:bg-ember-soft hover:text-ember"
                                  >
                                    Orantıla
                                  </button>
                                )}
                              </form>
                            </div>

                            {/* Fiyat değişim geçmişi */}
                            {pkg.priceHistory.length > 0 && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer select-none text-xs text-muted transition-colors hover:text-ember">
                                  Fiyat geçmişi ({pkg.priceHistory.length})
                                </summary>
                                <ul className="mt-1.5 space-y-1 border-t border-line pt-1.5">
                                  {pkg.priceHistory.map((h) => (
                                    <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="flex items-center gap-1.5 text-muted">
                                        <span className="nums">{formatDate(h.effectiveDate)}</span>
                                        <span
                                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                            h.source === "MANUAL"
                                              ? "bg-ember-soft text-ember"
                                              : "bg-surface text-ink-soft"
                                          }`}
                                        >
                                          {h.source === "MANUAL" ? "elle" : "alış"}
                                        </span>
                                        {h.supplier && <span>· {h.supplier.name}</span>}
                                      </span>
                                      <span className="nums font-medium text-ink-soft">
                                        {formatKurus(h.unitPrice)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      action={addPackage}
                      className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <input name="name" required placeholder="Birim (Koli…) *" className={inputClass} />
                      <input
                        name="quantityInBase"
                        type="number"
                        min="1"
                        defaultValue="1"
                        title="Kaç baz birime denk"
                        className={inputClass}
                      />
                      <input name="lastUnitPrice" inputMode="decimal" placeholder="Fiyat (TL)" className={inputClass} />
                      <SubmitButton variant="ghost">+ Birim</SubmitButton>
                    </form>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
