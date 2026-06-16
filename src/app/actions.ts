"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tlToKurus } from "@/lib/money";
import {
  supplierCreateSchema,
  paymentCreateSchema,
  productCreateSchema,
  packageInputSchema,
} from "@/lib/validations";

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
  revalidatePath("/suppliers");
  revalidatePath("/");
  // Yeni toptancı ürün/alış formlarındaki seçim listelerinde de hemen görünsün.
  revalidatePath("/products");
  revalidatePath("/purchases");
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
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function deleteSupplier(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.supplier.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/suppliers");
  revalidatePath("/");
  // Silinen toptancı ürün/alış formlarındaki seçim listelerinden de düşsün.
  revalidatePath("/products");
  revalidatePath("/purchases");
}

// --- Ödeme ---

export async function createPayment(fd: FormData) {
  const data = paymentCreateSchema.parse({
    supplierId: str(fd, "supplierId"),
    amount: tlToKurus(str(fd, "amount") ?? "0"),
    method: str(fd, "method"),
    note: str(fd, "note"),
  });
  await prisma.payment.create({ data });
  revalidatePath(`/suppliers/${data.supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function deletePayment(fd: FormData) {
  const id = str(fd, "id");
  const supplierId = str(fd, "supplierId");
  if (!id) return;
  await prisma.payment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/");
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

export async function createProduct(fd: FormData) {
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

    revalidatePath("/products");
    revalidatePath("/purchases");
    return;
  }

  // Yeni ürün
  await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: data.name,
        baseUnit: data.baseUnit,
        defaultSupplierId: data.defaultSupplierId,
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

  revalidatePath("/products");
  revalidatePath("/purchases");
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
  revalidatePath("/products");
  revalidatePath("/purchases");
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
  revalidatePath("/products");
  revalidatePath("/purchases");
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
  revalidatePath("/products");
  revalidatePath("/purchases");
}

// Yanlış girilen ürün adını düzelt. Aynı isimli başka bir aktif ürün varsa engelle.
export async function renameProduct(fd: FormData) {
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
  revalidatePath("/products");
  revalidatePath("/purchases");
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

  revalidatePath("/products");
  revalidatePath("/purchases");
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

  revalidatePath("/products");
  revalidatePath("/purchases");
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

  revalidatePath("/products");
  revalidatePath("/purchases");
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
  revalidatePath("/products");
  revalidatePath("/purchases");
}

export async function deleteProduct(fd: FormData) {
  const id = str(fd, "id");
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  // Liste tazelenince modal açık ürünü bulamaz ve kendiliğinden kapanır.
  revalidatePath("/products");
  revalidatePath("/purchases");
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
    }
  | {
      kind: "newUnit";
      productId: string;
      unit: string; // "Adet" | "Kg" | "Kasa" | "Litre" | "Paket" | "Gram"
      quantity: number;
      unitPriceTl: string;
      quantityInBase?: number; // bu paket kaç baz birim içerir (örn. 1 koli = 24 adet)
    }
  | {
      kind: "new";
      name: string;
      unit: string;
      quantity: number;
      unitPriceTl: string;
      quantityInBase?: number; // bu paket kaç baz birim içerir
    };

// Paketteki baz birim sayısını normalle (pozitif tam sayı, en az 1).
const normQib = (n?: number) => {
  const v = Math.round(n ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
};

// KDV oranını normalle: pozitif tam sayı (%); yoksa null (KDV uygulanmaz).
const normVatRate = (n?: number | null): number | null => {
  const v = Math.round(n ?? 0);
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Ara toplamdan (KDV hariç, kuruş) KDV tutarını hesapla; oran yoksa 0.
const computeVat = (subtotal: number, rate: number | null): number =>
  rate ? Math.round((subtotal * rate) / 100) : 0;

// Serbest birim etiketini şemadaki Unit enum'una eşle (baseUnit için).
const UNIT_TO_BASE: Record<string, "ADET" | "LITRE" | "KG" | "ML" | "GR" | "PAKET"> = {
  Adet: "ADET",
  Kg: "KG",
  Litre: "LITRE",
  Paket: "PAKET",
  Gram: "GR",
  Kasa: "ADET", // Kasa baz birim olarak ADET; etiket paket adında "Kasa" olarak durur
};

export async function createPurchase(input: {
  supplierId: string;
  note?: string;
  date?: string; // ISO (datetime); boşsa şimdi
  vatRate?: number; // KDV oranı (%); boş/0 ise KDV uygulanmaz
  items: NewPurchaseItem[];
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
      })
    : [];
  const byId = new Map(packages.map((p) => [p.id, p]));

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

  await prisma.$transaction(async (tx) => {
    const resolved: {
      productPackageId: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }[] = [];

    for (const item of items) {
      let productPackageId: string;
      let unitPrice: number;

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
        } else {
          // Yeni ürünü o toptancıya bağlı olarak oluştur (bir sonraki sefer hazır gelir)
          const product = await tx.product.create({
            data: {
              name: item.name.trim(),
              baseUnit: UNIT_TO_BASE[item.unit] ?? "ADET",
              defaultSupplierId: input.supplierId,
              packages: { create: { name: item.unit, quantityInBase: normQib(item.quantityInBase), lastUnitPrice: price } },
            },
            include: { packages: true },
          });
          productPackageId = product.packages[0].id;
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
      }

      resolved.push({
        productPackageId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity), // kuruş tam sayı kalsın
      });
    }

    // Fatura/irsaliye no otomatik atanır (kullanıcı girmez): ALŞ-0001, ALŞ-0002…
    const count = await tx.purchase.count();
    const documentNo = `ALŞ-${String(count + 1).padStart(4, "0")}`;

    // KDV opsiyonel: ara toplam (kalem tutarları) üzerinden hesaplanıp DONDURULUR.
    const subtotal = resolved.reduce((s, r) => s + r.lineTotal, 0);
    const vatRate = normVatRate(input.vatRate);
    const vatAmount = computeVat(subtotal, vatRate);

    await tx.purchase.create({
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
  }, {
    // Çok kalemli alış + uzak Neon'a onlarca gidiş-dönüş varsayılan 5 sn'yi
    // aşabiliyor; soğuk başlangıca da pay bırakacak şekilde cömert tutuyoruz.
    timeout: 30_000,
    maxWait: 10_000,
  });

  revalidatePath("/purchases");
  revalidatePath(`/suppliers/${input.supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/products");
  revalidatePath("/");
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
};

export async function updatePurchase(input: {
  id: string;
  supplierId: string;
  date?: string;
  note?: string;
  vatRate?: number; // KDV oranı (%); boş/0 ise KDV kaldırılır
  items: EditPurchaseItem[];
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
  });
  const pkgById = new Map(packages.map((p) => [p.id, p]));
  const existingById = new Map(purchase.items.map((i) => [i.id, i]));

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
    return {
      id: old ? i.id : undefined,
      productPackageId: pkg.id,
      quantity: i.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * i.quantity), // kuruş tam sayı kalsın
    };
  });

  const keptIds = new Set(resolved.map((r) => r.id).filter(Boolean) as string[]);
  const toDelete = purchase.items.filter((i) => !keptIds.has(i.id)).map((i) => i.id);

  // KDV'yi düzeltilmiş ara toplamdan yeniden hesapla (kalemler değişmiş olabilir).
  const subtotal = resolved.reduce((s, r) => s + r.lineTotal, 0);
  const vatRate = normVatRate(input.vatRate);
  const vatAmount = computeVat(subtotal, vatRate);

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
  }, {
    // Çok kalemli düzenleme + uzak Neon gidiş-dönüşleri varsayılan 5 sn'yi aşabilir.
    timeout: 30_000,
    maxWait: 10_000,
  });

  revalidatePath("/purchases");
  revalidatePath(`/suppliers/${input.supplierId}`);
  if (purchase.supplierId !== input.supplierId) {
    revalidatePath(`/suppliers/${purchase.supplierId}`); // eski toptancının cari'si de değişir
  }
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function deletePurchase(fd: FormData) {
  const id = str(fd, "id");
  const supplierId = str(fd, "supplierId");
  if (!id) return;
  await prisma.purchase.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/purchases");
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/");
}
