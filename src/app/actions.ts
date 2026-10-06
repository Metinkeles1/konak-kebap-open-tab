"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { tlToKurus } from "@/lib/money";
import { commonVatRate, lineVat, normVatRate } from "@/lib/vat";
import { getPurchaseReconciliation, getBalanceReconciliation } from "@/lib/reconciliation";
import {
  supplierCreateSchema,
  paymentCreateSchema,
  productCreateSchema,
  packageInputSchema,
} from "@/lib/validations";

// Bir değişiklikten sonra TÜM sayfaları yenile. Aynı veri (ürün, fiyat, cari)
// birden çok sayfada görünüyor; yolları tek tek saymak bir sayfanın unutulmasına
// yol açıyordu (ör. /purchases/sayim hiç yenilenmiyordu). Uygulama küçük olduğundan
// kök layout'u geçersiz kılmak hem basit hem güvenli.
function revalidateAll() {
  revalidatePath("/", "layout");
}

// Form alanlarını okurken boş string'leri undefined'a çeviren yardımcı.
function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

// --- Toptancı ---

export async function createSupplier(fd: FormData) {
  const openingTl = str(fd, "openingBalance");
  const data = supplierCreateSchema.parse({
    name: str(fd, "name"),
    phone: str(fd, "phone"),
    note: str(fd, "note"),
    openingBalance: openingTl ? tlToKurus(openingTl) : undefined,
  });
  await prisma.supplier.create({ data });
  revalidateAll();
}

// Açılış/devir bakiyesini güncelle (TL girilir, kuruşa çevrilir).
export async function updateOpeningBalance(fd: FormData) {
  const supplierId = str(fd, "supplierId");
  if (!supplierId) return;
  const tl = str(fd, "openingBalance");
  const openingBalance = tl ? tlToKurus(tl) : 0;
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { openingBalance },
  });
  revalidateAll();
}

export async function deleteSupplier(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.supplier.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidateAll();
}

// --- Ödeme ---

async function createPaymentImpl(fd: FormData) {
  const data = paymentCreateSchema.parse({
    supplierId: str(fd, "supplierId"),
    amount: tlToKurus(str(fd, "amount") ?? "0"),
    method: str(fd, "method"),
    note: str(fd, "note"),
  });
  await prisma.payment.create({ data });
  revalidateAll();
}

export async function deletePayment(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.payment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidateAll();
}

// --- Ürün & birim ---

// Serbest alış birimi etiketinden baz ölçü birimini tahmin et (yalnızca görsel/raporlama).
function baseUnitFromLabel(label?: string): "ADET" | "LITRE" | "KG" | "ML" | "GR" | "PAKET" {
  const map: Record<string, "ADET" | "LITRE" | "KG" | "ML" | "GR" | "PAKET"> = {
    adet: "ADET", koli: "ADET", kasa: "ADET", balya: "ADET", çuval: "ADET", teneke: "ADET", rulo: "ADET",
    paket: "PAKET", kg: "KG", kilo: "KG", kilogram: "KG", gr: "GR", gram: "GR",
    litre: "LITRE", lt: "LITRE", l: "LITRE", ml: "ML",
  };
  if (!label) return "ADET";
  return map[label.trim().toLocaleLowerCase("tr")] ?? "ADET";
}

// Ürün ekleme kuralı:
//  - Aynı isimli ürün YOKSA: yeni ürün oluştur (+ varsa birim/fiyat). Toptancı +
//    fiyat verildiyse o toptancının fiyatı matriste hemen görünsün diye
//    PriceHistory yazılır.
//  - Aynı isimli ürün VARSA: ürün TEK kayıt kalır; aynı toptancıda kopya
//    engellenir, FARKLI toptancıda ise o toptancı yeni bir fiyat kaynağı olarak
//    eklenir (aynı ürünü birden çok toptancıdan alabilmek için).
const eq = (a: string, b: string) =>
  a.toLocaleLowerCase("tr") === b.toLocaleLowerCase("tr");

async function createProductImpl(fd: FormData) {
  const unit = str(fd, "unit"); // alış birimi etiketi (Koli, Kg, Balya…)
  const supplierId = str(fd, "supplierId");
  const data = productCreateSchema.parse({
    name: str(fd, "name"),
    baseUnit: baseUnitFromLabel(unit),
    defaultSupplierId: supplierId,
  });
  const priceTl = str(fd, "price");
  const price = priceTl ? tlToKurus(priceTl) : undefined;
  const qibRaw = str(fd, "quantityInBase");
  const qib = normQib(qibRaw ? Number(qibRaw) : undefined); // 1 koli = kaç baz birim

  const existing = await prisma.product.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" }, deletedAt: null },
    include: { packages: { where: { deletedAt: null } } },
  });

  if (existing) {
    if (!supplierId) {
      throw new Error(
        `"${existing.name}" zaten kayıtlı. Aynı ürüne farklı bir toptancının fiyatını eklemek için bir toptancı seçin.`,
      );
    }
    // Bu ürün bu toptancıda zaten var mı? (varsayılan toptancı ya da fiyat geçmişi)
    const alreadyForSupplier =
      existing.defaultSupplierId === supplierId ||
      (await prisma.priceHistory.findFirst({
        where: { supplierId, package: { productId: existing.id } },
        select: { id: true },
      })) != null;
    if (alreadyForSupplier) {
      throw new Error(
        `"${existing.name}" bu toptancıda zaten kayıtlı. Fiyatı güncellemek için ürüne tıklayıp düzenleyin.`,
      );
    }
    if (price == null) {
      throw new Error(`"${existing.name}" için bu toptancının fiyatını girin.`);
    }
    // Hangi birime yazılacak: etiket verildiyse o (yoksa oluştur); verilmediyse
    // ürünün tek birimi varsa o, yoksa birim sorulur.
    const matched = unit
      ? existing.packages.find((p) => eq(p.name, unit))
      : existing.packages.length === 1
        ? existing.packages[0]
        : undefined;
    if (!matched && !unit) {
      throw new Error("Hangi birim için fiyat? Alış birimi yazın (ör. Koli).");
    }

    await prisma.$transaction(async (tx) => {
      let packageId: string;
      if (matched) {
        packageId = matched.id;
        await tx.productPackage.update({
          where: { id: matched.id },
          data: { lastUnitPrice: price },
        });
      } else {
        const created = await tx.productPackage.create({
          data: { productId: existing.id, name: unit!, quantityInBase: qib, lastUnitPrice: price },
        });
        packageId = created.id;
      }
      await tx.priceHistory.create({
        data: { productPackageId: packageId, supplierId, unitPrice: price, source: "MANUAL" },
      });
    });

    revalidateAll();
    return;
  }

  // Yeni ürün
  await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: data.name,
        baseUnit: data.baseUnit,
        defaultSupplierId: data.defaultSupplierId,
        vatRate: normVatRate(str(fd, "vatRate")),
        // Birim girildiyse ürünü ilk alış birimi (+ varsa son fiyat) ile birlikte oluştur.
        ...(unit
          ? { packages: { create: { name: unit, quantityInBase: qib, lastUnitPrice: price } } }
          : {}),
      },
      include: { packages: true },
    });
    // Toptancı + fiyat + birim varsa matriste hemen görünmesi için fiyat geçmişi yaz.
    if (supplierId && price != null && created.packages[0]) {
      await tx.priceHistory.create({
        data: {
          productPackageId: created.packages[0].id,
          supplierId,
          unitPrice: price,
          source: "MANUAL",
        },
      });
    }
  });

  revalidateAll();
}

export async function addPackage(fd: FormData) {
  const productId = str(fd, "productId");
  if (!productId) return;
  const priceTl = str(fd, "lastUnitPrice");
  const data = packageInputSchema.parse({
    name: str(fd, "name"),
    quantityInBase: Number(str(fd, "quantityInBase") ?? "1"),
    lastUnitPrice: priceTl ? tlToKurus(priceTl) : undefined,
  });
  await prisma.productPackage.create({ data: { ...data, productId } });
  revalidateAll();
}

// Bir alış biriminin adını ve içindeki baz birim sayısını DÜZELT (yanlış girilmişse).
// Fiyatlar değişmez; sadece etiket/oran düzeltilir.
export async function updatePackage(fd: FormData) {
  const packageId = str(fd, "packageId");
  const name = str(fd, "name");
  if (!packageId || !name) return;
  const qib = normQib(Number(str(fd, "quantityInBase") ?? "1"));
  await prisma.productPackage.update({
    where: { id: packageId },
    data: { name, quantityInBase: qib },
  });
  revalidateAll();
}

// Yanlış eklenen bir alış birimini sil (soft delete). Geçmiş alışlar bu birime
// referans verdiği için kayıt silinmez, yalnızca `deletedAt` set edilir; böylece
// eski alışlar bozulmaz ama aktif listelerden ve formlardan düşer.
export async function deletePackage(fd: FormData) {
  const packageId = str(fd, "packageId");
  if (!packageId) return;
  await prisma.productPackage.update({
    where: { id: packageId },
    data: { deletedAt: new Date() },
  });
  revalidateAll();
}

// Yanlış girilen ürün adını düzelt. Aynı isimli başka bir aktif ürün varsa engelle.
async function renameProductImpl(fd: FormData) {
  const productId = str(fd, "productId");
  const name = str(fd, "name");
  if (!productId || !name) return;
  const dup = await prisma.product.findFirst({
    where: {
      id: { not: productId },
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) throw new Error(`"${name}" adında başka bir ürün zaten var.`);
  await prisma.product.update({ where: { id: productId }, data: { name } });
  revalidateAll();
}

// Bir alış biriminin son fiyatını ELLE güncelle (alış girmeden).
// Sadece sonraki alışların otomatik dolan fiyatını etkiler; geçmiş alışlar DONDURULMUŞ kalır.
// Fiyat geçmişine MANUAL kaynaklı bir kayıt yazılır.
export async function updatePackagePrice(fd: FormData) {
  const packageId = str(fd, "packageId");
  const priceTl = str(fd, "price");
  if (!packageId || !priceTl) return;
  const lastUnitPrice = tlToKurus(priceTl);

  const pkg = await prisma.productPackage.findFirst({
    where: { id: packageId, deletedAt: null },
    include: { product: { select: { defaultSupplierId: true } } },
  });
  if (!pkg) return;
  if (pkg.lastUnitPrice === lastUnitPrice) return; // değişmediyse boşuna kayıt açma

  await prisma.$transaction(async (tx) => {
    await tx.productPackage.update({
      where: { id: packageId },
      data: { lastUnitPrice },
    });
    await tx.priceHistory.create({
      data: {
        productPackageId: packageId,
        supplierId: pkg.product.defaultSupplierId ?? undefined,
        unitPrice: lastUnitPrice,
        source: "MANUAL",
      },
    });
  });

  revalidateAll();
}

// Belirli bir TOPTANCININ, belirli bir alış biriminin fiyatını ELLE güncelle/ekle
// (alış girmeden). Her toptancı kendi fiyatını bağımsız tutar; bu kayıt yalnızca
// seçilen toptancıya yazılır. PriceHistory'ye MANUAL kaynaklı bir satır eklenir;
// böylece matris güncellenir ve zam/indirim oku otomatik hesaplanır.
// Düzenlenen toptancı ürünün VARSAYILAN toptancısıysa, yeni alışta otomatik dolan
// güncel fiyat tutarlı kalsın diye lastUnitPrice de güncellenir.
export async function updateSupplierPackagePrice(fd: FormData) {
  const packageId = str(fd, "packageId");
  const supplierId = str(fd, "supplierId");
  const priceTl = str(fd, "price");
  if (!packageId || !supplierId || !priceTl) return;
  const unitPrice = tlToKurus(priceTl);

  const pkg = await prisma.productPackage.findFirst({
    where: { id: packageId, deletedAt: null },
    include: { product: { select: { defaultSupplierId: true } } },
  });
  if (!pkg) return;

  // Bu toptancının bu birimdeki mevcut en son fiyatı ile aynıysa boşuna kayıt açma.
  const latest = await prisma.priceHistory.findFirst({
    where: { productPackageId: packageId, supplierId },
    orderBy: { effectiveDate: "desc" },
    select: { unitPrice: true },
  });
  if (latest?.unitPrice === unitPrice) return;

  await prisma.$transaction(async (tx) => {
    await tx.priceHistory.create({
      data: { productPackageId: packageId, supplierId, unitPrice, source: "MANUAL" },
    });
    if (pkg.product.defaultSupplierId === supplierId) {
      await tx.productPackage.update({
        where: { id: packageId },
        data: { lastUnitPrice: unitPrice },
      });
    }
  });

  revalidateAll();
}

// Bir birimin fiyatını baz alıp ürünün DİĞER birimlerini quantityInBase oranıyla eşitle.
// "birim başı fiyat" = baz birim fiyatı / quantityInBase; her birim = birimBaşı × kendi quantityInBase.
// İsteme bağlı (buton) — otomatik değil; toptan indirimi gereken durumda kullanılmaz.
export async function applyProportionalPrice(fd: FormData) {
  const packageId = str(fd, "packageId");
  const priceTl = str(fd, "price");
  if (!packageId) return;

  const pkg = await prisma.productPackage.findFirst({
    where: { id: packageId, deletedAt: null },
    include: { product: { select: { id: true, defaultSupplierId: true } } },
  });
  if (!pkg) return;

  // Baz fiyat: kutuda girilen değer varsa o, yoksa mevcut son fiyat
  const basePrice = priceTl ? tlToKurus(priceTl) : pkg.lastUnitPrice;
  if (basePrice == null) return;
  const pricePerBase = basePrice / (pkg.quantityInBase || 1);

  const siblings = await prisma.productPackage.findMany({
    where: { productId: pkg.product.id, deletedAt: null },
  });
  const supplierId = pkg.product.defaultSupplierId ?? undefined;

  await prisma.$transaction(async (tx) => {
    for (const s of siblings) {
      const target =
        s.id === packageId ? basePrice : Math.round(pricePerBase * (s.quantityInBase || 1));
      if (s.lastUnitPrice === target) continue; // değişmeyeni atla
      await tx.productPackage.update({ where: { id: s.id }, data: { lastUnitPrice: target } });
      await tx.priceHistory.create({
        data: { productPackageId: s.id, supplierId, unitPrice: target, source: "MANUAL" },
      });
    }
  });

  revalidateAll();
}

// Ürünün varsayılan toptancısını ayarla (boş = yok). Varsayılan toptancı, yeni
// alışta otomatik dolan "güncel fiyat"ın (lastUnitPrice) sahibidir.
export async function setDefaultSupplier(fd: FormData) {
  const productId = str(fd, "productId");
  if (!productId) return;
  const supplierId = str(fd, "supplierId") ?? null;
  await prisma.product.update({
    where: { id: productId },
    data: { defaultSupplierId: supplierId },
  });
  revalidateAll();
}

// Ürünün KDV oranı — alışlarda bu ürünün kalemine varsayılan gelir. Geçmiş alışlar
// etkilenmez (kalemdeki oran dondurulmuştur).
export async function setProductVatRate(fd: FormData) {
  const productId = str(fd, "productId");
  if (!productId) return;
  await prisma.product.update({
    where: { id: productId },
    data: { vatRate: normVatRate(str(fd, "vatRate")) },
  });
  revalidateAll();
}

export async function deleteProduct(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  // Liste tazelenince modal açık ürünü bulamaz ve kendiliğinden kapanır.
  revalidateAll();
}

// --- Alış ---

// Alış kalemi üç şekilde gelebilir:
//  - existing : mevcut bir alış birimi (ProductPackage)
//  - newUnit  : mevcut bir ürüne yeni bir alış birimi ekle (örn. "Koli")
//  - new      : tamamen yeni bir ürün (+ ilk birimi)
export type NewPurchaseItem =
  | {
      kind: "existing";
      productPackageId: string;
      quantity: number;
      unitPriceTl?: string; // boşsa birimin son fiyatı kullanılır
      vatRate?: number; // kalemin KDV oranı (%); verilmezse ürünün kayıtlı oranı
    }
  | {
      kind: "newUnit";
      productId: string;
      unit: string; // "Adet" | "Kg" | "Kasa" | "Litre" | "Paket" | "Gram"
      quantity: number;
      unitPriceTl: string;
      quantityInBase?: number; // bu paket kaç baz birim içerir (örn. 1 koli = 24 adet)
      vatRate?: number;
    }
  | {
      kind: "new";
      name: string;
      unit: string;
      quantity: number;
      unitPriceTl: string;
      quantityInBase?: number; // bu paket kaç baz birim içerir
      vatRate?: number;
    };

// Paketteki baz birim sayısını normalle (pozitif tam sayı, en az 1).
const normQib = (n?: number) => {
  const v = Math.round(n ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
};

// Serbest birim etiketini şemadaki Unit enum'una eşle (baseUnit için).
const UNIT_TO_BASE: Record<string, "ADET" | "LITRE" | "KG" | "ML" | "GR" | "PAKET"> = {
  Adet: "ADET",
  Kg: "KG",
  Litre: "LITRE",
  Paket: "PAKET",
  Gram: "GR",
  Kasa: "ADET", // Kasa baz birim olarak ADET; etiket paket adında "Kasa" olarak durur
};

async function createPurchaseImpl(input: {
  supplierId: string;
  note?: string;
  date?: string; // ISO (datetime); boşsa şimdi
  items: NewPurchaseItem[]; // KDV kalem bazında (vatRate), bkz. @/lib/vat
}) {
  const items = input.items.filter((i) => {
    if (i.quantity <= 0) return false;
    if (i.kind === "existing") return !!i.productPackageId;
    if (i.kind === "newUnit") return !!i.productId;
    return !!i.name.trim();
  });
  if (!items.length) throw new Error("En az bir kalem gerekli");

  // Mevcut birimleri önden çek
  const existingIds = items
    .filter((i): i is Extract<NewPurchaseItem, { kind: "existing" }> => i.kind === "existing")
    .map((i) => i.productPackageId);
  const packages = existingIds.length
    ? await prisma.productPackage.findMany({
        where: { id: { in: existingIds }, deletedAt: null },
        include: { product: { select: { id: true, vatRate: true } } },
      })
    : [];
  const byId = new Map(packages.map((p) => [p.id, p]));
  // "Yeni birim" kalemlerinin ürünlerinin kayıtlı KDV oranı
  const newUnitProductIds = items.flatMap((i) => (i.kind === "newUnit" ? [i.productId] : []));
  const newUnitProducts = newUnitProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: newUnitProductIds } },
        select: { id: true, vatRate: true },
      })
    : [];
  const productVat = new Map(newUnitProducts.map((p) => [p.id, p.vatRate]));

  // Boş bırakılan fiyatlar için: bu toptancının bu birimdeki EN SON fiyatı.
  // Böylece otomatik dolan fiyat global değil, seçilen toptancıya özgü olur.
  const supplierPrices = existingIds.length
    ? await prisma.priceHistory.findMany({
        where: { supplierId: input.supplierId, productPackageId: { in: existingIds } },
        orderBy: { effectiveDate: "desc" },
        select: { productPackageId: true, unitPrice: true },
      })
    : [];
  const supplierLastPrice = new Map<string, number>();
  for (const h of supplierPrices) {
    if (!supplierLastPrice.has(h.productPackageId)) {
      supplierLastPrice.set(h.productPackageId, h.unitPrice);
    }
  }

  const purchaseId = await prisma.$transaction(async (tx) => {
    const resolved: {
      productPackageId: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      vatRate: number;
      vatAmount: number;
    }[] = [];
    // Kalemde ürünün kayıtlı oranından farklı bir KDV seçildiyse ürüne de yazılır
    // (sonraki alışlarda o oran gelir) — productId → yeni oran.
    const productVatUpdates = new Map<string, number>();

    for (const item of items) {
      let productPackageId: string;
      let unitPrice: number;
      let productId: string;
      let productRate: number; // ürünün şu anki kayıtlı KDV oranı

      if (item.kind === "new") {
        const price = item.unitPriceTl.trim().length ? tlToKurus(item.unitPriceTl) : null;
        if (price == null) throw new Error(`'${item.name}' için fiyat gerekli`);

        // Aynı isimli ürün zaten varsa (büyük/küçük harf farkı sayılmadan) kopya açma, onu kullan.
        const existing = await tx.product.findFirst({
          where: { name: { equals: item.name.trim(), mode: "insensitive" }, deletedAt: null },
          include: { packages: { where: { deletedAt: null } } },
        });
        if (existing) {
          const sameUnit = existing.packages.find(
            (p) => p.name.toLocaleLowerCase("tr") === item.unit.trim().toLocaleLowerCase("tr"),
          );
          const pkg =
            sameUnit ??
            (await tx.productPackage.create({
              data: { productId: existing.id, name: item.unit, quantityInBase: normQib(item.quantityInBase), lastUnitPrice: price },
            }));
          productPackageId = pkg.id;
          productId = existing.id;
          productRate = existing.vatRate;
        } else {
          // Yeni ürünü o toptancıya bağlı olarak oluştur (bir sonraki sefer hazır gelir)
          const product = await tx.product.create({
            data: {
              name: item.name.trim(),
              baseUnit: UNIT_TO_BASE[item.unit] ?? "ADET",
              defaultSupplierId: input.supplierId,
              vatRate: normVatRate(item.vatRate),
              packages: { create: { name: item.unit, quantityInBase: normQib(item.quantityInBase), lastUnitPrice: price } },
            },
            include: { packages: true },
          });
          productPackageId = product.packages[0].id;
          productId = product.id;
          productRate = product.vatRate;
        }
        unitPrice = price;
      } else if (item.kind === "newUnit") {
        // Mevcut ürüne yeni bir alış birimi ekle (örn. aynı ürünü artık "Koli" ile alıyoruz)
        const price = item.unitPriceTl.trim().length ? tlToKurus(item.unitPriceTl) : null;
        if (price == null) throw new Error(`'${item.unit}' birimi için fiyat gerekli`);
        const pkg = await tx.productPackage.create({
          data: { productId: item.productId, name: item.unit, quantityInBase: normQib(item.quantityInBase), lastUnitPrice: price },
        });
        productPackageId = pkg.id;
        unitPrice = price;
        productId = item.productId;
        productRate = productVat.get(item.productId) ?? 0;
      } else {
        const pkg = byId.get(item.productPackageId);
        if (!pkg) throw new Error("Alış birimi bulunamadı");
        const given = item.unitPriceTl?.trim().length ? tlToKurus(item.unitPriceTl) : null;
        // Öncelik: girilen fiyat → bu toptancının son fiyatı → global son fiyat.
        const resolvedPrice = given ?? supplierLastPrice.get(pkg.id) ?? pkg.lastUnitPrice;
        if (resolvedPrice == null) {
          throw new Error(`'${pkg.name}' için fiyat gerekli (kayıtlı son fiyat yok)`);
        }
        productPackageId = pkg.id;
        unitPrice = resolvedPrice;
        productId = pkg.product.id;
        productRate = pkg.product.vatRate;
      }

      // KDV: kalemde seçilen oran, yoksa ürünün kayıtlı oranı. Tutar kalem bazında
      // hesaplanıp DONDURULUR.
      const vatRate = item.vatRate != null ? normVatRate(item.vatRate) : productRate;
      if (vatRate !== productRate) productVatUpdates.set(productId, vatRate);
      const lineTotal = Math.round(unitPrice * item.quantity); // kuruş tam sayı kalsın
      resolved.push({
        productPackageId,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        vatRate,
        vatAmount: lineVat(lineTotal, vatRate),
      });
    }

    // Fatura/irsaliye no otomatik atanır (kullanıcı girmez): ALŞ-0001, ALŞ-0002…
    const count = await tx.purchase.count();
    const documentNo = `ALŞ-${String(count + 1).padStart(4, "0")}`;

    // Alışın KDV'si = kalemlerin (dondurulmuş) KDV toplamı; tek oran varsa başlığa da yazılır.
    const vatAmount = resolved.reduce((s, r) => s + r.vatAmount, 0);
    const vatRate = commonVatRate(resolved);

    const created = await tx.purchase.create({
      select: { id: true },
      data: {
        supplierId: input.supplierId,
        note: input.note,
        date: input.date ? new Date(input.date) : undefined,
        documentNo,
        vatRate,
        vatAmount,
        items: { create: resolved },
      },
    });
    // Fiyat geçmişini tek sorguda yaz (kalem başına ayrı INSERT, çok kalemli
    // alışta transaction'ı yavaşlatıp zaman aşımına sokuyordu — bkz. timeout).
    await tx.priceHistory.createMany({
      data: resolved.map((item) => ({
        productPackageId: item.productPackageId,
        supplierId: input.supplierId,
        unitPrice: item.unitPrice,
        source: "PURCHASE" as const,
      })),
    });
    // Her birimin son fiyatı farklı olabildiğinden son fiyatları tek tek güncelle.
    for (const item of resolved) {
      await tx.productPackage.update({
        where: { id: item.productPackageId },
        data: { lastUnitPrice: item.unitPrice },
      });
    }
    // Kalemde değiştirilen KDV oranı ürünün yeni varsayılanı olur.
    for (const [id, vatRate] of productVatUpdates) {
      await tx.product.update({ where: { id }, data: { vatRate } });
    }
    return created.id;
  }, {
    // Çok kalemli alış + uzak Neon'a onlarca gidiş-dönüş varsayılan 5 sn'yi
    // aşabiliyor; soğuk başlangıca da pay bırakacak şekilde cömert tutuyoruz.
    timeout: 30_000,
    maxWait: 10_000,
  });

  revalidateAll();
  // Kaydın hemen ardından WhatsApp mutabakat penceresi bu kimlikle açılır.
  return { id: purchaseId };
}

// Mevcut bir alışın düzenlenmesi (tam düzeltme).
//  - Başlık: toptancı, tarih, not değiştirilebilir.
//  - Kalemler: adet/fiyat düzeltilebilir, kalem eklenip çıkarılabilir.
// "Fiyat dondurma" kuralı yalnızca düzeltme anında gevşer: dokunulmayan
// kalemlerin fiyatı korunur (boş fiyat = mevcut fiyatı koru). Fiyat geçmişi
// (PriceHistory) bir gözlem kaydı olduğundan düzeltmede değiştirilmez.
export type EditPurchaseItem = {
  id?: string; // mevcut kalem (varsa); yoksa yeni kalem
  productPackageId: string;
  quantity: number;
  unitPriceTl: string; // boşsa: mevcut kalemin fiyatı, o da yoksa birimin son fiyatı
  vatRate?: number; // boşsa: mevcut kalemin oranı, yeni kalemde ürünün oranı
};

async function updatePurchaseImpl(input: {
  id: string;
  supplierId: string;
  date?: string;
  note?: string;
  items: EditPurchaseItem[]; // KDV kalem bazında
}) {
  const purchase = await prisma.purchase.findFirst({
    where: { id: input.id, deletedAt: null },
    include: { items: true },
  });
  if (!purchase) throw new Error("Alış bulunamadı");

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, deletedAt: null },
  });
  if (!supplier) throw new Error("Toptancı bulunamadı");

  const items = input.items.filter((i) => i.productPackageId && i.quantity > 0);
  if (!items.length) throw new Error("En az bir kalem gerekli");

  const pkgIds = [...new Set(items.map((i) => i.productPackageId))];
  const packages = await prisma.productPackage.findMany({
    where: { id: { in: pkgIds }, deletedAt: null },
    include: { product: { select: { id: true, vatRate: true } } },
  });
  const pkgById = new Map(packages.map((p) => [p.id, p]));
  const existingById = new Map(purchase.items.map((i) => [i.id, i]));
  // Düzeltmede ELLE değiştirilen KDV oranı ürüne de yazılır (yeni alış formuyla aynı kural).
  const productVatUpdates = new Map<string, number>();

  const resolved = items.map((i) => {
    const pkg = pkgById.get(i.productPackageId);
    if (!pkg) throw new Error("Alış birimi bulunamadı");
    const old = i.id ? existingById.get(i.id) : undefined;
    let unitPrice: number | null;
    if (i.unitPriceTl.trim().length) {
      unitPrice = tlToKurus(i.unitPriceTl);
    } else if (old) {
      unitPrice = old.unitPrice; // dokunulmadı → dondurulmuş fiyatı koru
    } else {
      unitPrice = pkg.lastUnitPrice;
    }
    if (unitPrice == null) throw new Error(`'${pkg.name}' için fiyat gerekli`);
    // KDV: girilen oran → (dokunulmadıysa) kalemin dondurulmuş oranı → ürünün oranı.
    const sameItem = old && old.productPackageId === pkg.id;
    const prevRate = sameItem ? old.vatRate : pkg.product.vatRate;
    const vatRate = i.vatRate != null ? normVatRate(i.vatRate) : prevRate;
    if (vatRate !== prevRate && vatRate !== pkg.product.vatRate) {
      productVatUpdates.set(pkg.product.id, vatRate);
    }
    const lineTotal = Math.round(unitPrice * i.quantity); // kuruş tam sayı kalsın
    // Tutarı ve oranı aynı kalan eski kalemin KDV'si yeniden yuvarlanmaz (dondurulmuş).
    const vatAmount =
      sameItem && old.lineTotal === lineTotal && old.vatRate === vatRate
        ? old.vatAmount
        : lineVat(lineTotal, vatRate);
    return {
      id: old ? i.id : undefined,
      productPackageId: pkg.id,
      quantity: i.quantity,
      unitPrice,
      lineTotal,
      vatRate,
      vatAmount,
    };
  });

  const keptIds = new Set(resolved.map((r) => r.id).filter(Boolean) as string[]);
  const toDelete = purchase.items.filter((i) => !keptIds.has(i.id)).map((i) => i.id);

  // Alışın KDV'si = düzeltilmiş kalemlerin KDV toplamı.
  const vatAmount = resolved.reduce((s, r) => s + r.vatAmount, 0);
  const vatRate = commonVatRate(resolved);

  await prisma.$transaction(async (tx) => {
    if (toDelete.length) {
      await tx.purchaseItem.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (const r of resolved) {
      if (r.id) {
        await tx.purchaseItem.update({
          where: { id: r.id },
          data: {
            productPackageId: r.productPackageId,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            lineTotal: r.lineTotal,
            vatRate: r.vatRate,
            vatAmount: r.vatAmount,
          },
        });
      } else {
        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productPackageId: r.productPackageId,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            lineTotal: r.lineTotal,
            vatRate: r.vatRate,
            vatAmount: r.vatAmount,
          },
        });
      }
    }
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        supplierId: input.supplierId,
        note: input.note?.trim() ? input.note.trim() : null,
        date: input.date ? new Date(input.date) : undefined,
        vatRate,
        vatAmount,
      },
    });
    for (const [id, rate] of productVatUpdates) {
      await tx.product.update({ where: { id }, data: { vatRate: rate } });
    }
  }, {
    // Çok kalemli düzenleme + uzak Neon gidiş-dönüşleri varsayılan 5 sn'yi aşabilir.
    timeout: 30_000,
    maxWait: 10_000,
  });

  revalidateAll();
}

export async function deletePurchase(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.purchase.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidateAll();
}

// --- WhatsApp mutabakat ---
// Mesaj metni istemcide üretilir (kullanıcı göndermeden önce düzenleyebilsin);
// bakiye/kalem verisi sunucuda ekstreyle aynı kuralla hesaplanır.
export async function loadPurchaseReconciliation(purchaseId: string) {
  return getPurchaseReconciliation(purchaseId);
}

export async function loadBalanceReconciliation(supplierId: string) {
  return getBalanceReconciliation(supplierId);
}

// --- Kullanıcıya hata gösteren işlemler -------------------------------------
// Beklenen hatalar (doğrulama, kopya ürün, eksik fiyat…) FIRLATILMAZ, değer olarak
// döner. Next production'da server action'dan fırlatılan hatanın metnini gizler
// (istemci "Minified React error #441" görür); Türkçe uyarılar canlıda hiç
// görünmüyordu. İstemci `res.ok`'a bakar.
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function userMessage(e: unknown): string {
  if (e instanceof ZodError) {
    return `Geçersiz veri: ${e.issues[0]?.message ?? "alanları kontrol edin"}`;
  }
  // Prisma / bağlantı hataları teknik ayrıntı içerir — kullanıcıya genel mesaj,
  // ayrıntı sunucu loguna. Kendi fırlattığımız (Türkçe) hatalar olduğu gibi gösterilir.
  const technical =
    !(e instanceof Error) ||
    /prisma|P\d{4}|ECONN|ETIMEDOUT|connect|database/i.test(`${e.name} ${e.message}`);
  if (!technical) return (e as Error).message;
  console.error(e);
  return "İşlem kaydedilemedi. Bağlantıyı kontrol edip tekrar deneyin.";
}

async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function createPayment(fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    await createPaymentImpl(fd);
    return null;
  });
}

export async function createProduct(fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    await createProductImpl(fd);
    return null;
  });
}

export async function renameProduct(fd: FormData): Promise<ActionResult> {
  return attempt(async () => {
    await renameProductImpl(fd);
    return null;
  });
}

export async function createPurchase(
  input: Parameters<typeof createPurchaseImpl>[0],
): Promise<ActionResult<{ id: string }>> {
  return attempt(() => createPurchaseImpl(input));
}

export async function updatePurchase(
  input: Parameters<typeof updatePurchaseImpl>[0],
): Promise<ActionResult> {
  return attempt(async () => {
    await updatePurchaseImpl(input);
    return null;
  });
}
