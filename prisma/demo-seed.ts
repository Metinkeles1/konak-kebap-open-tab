// Geçici: panel analitiğini göstermek için gerçekçi demo verisi üretir.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const D = (m: number, day: number) => new Date(2026, m, day); // 0=Oca

async function supplier(name: string, phone: string) {
  return prisma.supplier.create({ data: { name, phone } });
}

type Unit = "ADET" | "LITRE" | "KG" | "ML" | "GR" | "PAKET";
async function product(name: string, baseUnit: Unit, pkgName: string, qib: number) {
  const p = await prisma.product.create({ data: { name, baseUnit } });
  const pkg = await prisma.productPackage.create({
    data: { productId: p.id, name: pkgName, quantityInBase: qib },
  });
  return pkg.id;
}

// Bir alış + kalem + fiyat geçmişi + son fiyat güncellemesi
async function buy(
  supplierId: string,
  packageId: string,
  qty: number,
  unitPrice: number,
  date: Date,
) {
  await prisma.purchase.create({
    data: {
      supplierId,
      date,
      items: {
        create: { productPackageId: packageId, quantity: qty, unitPrice, lineTotal: qty * unitPrice },
      },
    },
  });
  await prisma.priceHistory.create({
    data: { productPackageId: packageId, supplierId, unitPrice, effectiveDate: date },
  });
  await prisma.productPackage.update({
    where: { id: packageId },
    data: { lastUnitPrice: unitPrice },
  });
}

async function main() {
  const icecek = await prisma.supplier.findFirst({ where: { name: "Örnek İçecek Toptancısı" } });
  const et = await supplier("Anadolu Et & Tavuk", "0312 444 11 22");
  const bakliyat = await supplier("Marmara Bakliyat", "0216 555 33 44");

  const pepsiPkg = (await prisma.productPackage.findFirst({ where: { name: "Koli" } }))!.id;
  const tavuk = await product("Tavuk Göğüs", "KG", "Kg", 1);
  const pirinc = await product("Pirinç (Baldo)", "KG", "Çuval", 25);
  const yag = await product("Ayçiçek Yağı", "LITRE", "Teneke", 5);
  const domates = await product("Domates", "KG", "Kasa", 10);

  // Yükselen fiyatlarla zaman serisi (kuruş)
  await buy(et.id, tavuk, 30, 18000, D(2, 5));
  await buy(et.id, tavuk, 25, 21000, D(3, 8));
  await buy(et.id, tavuk, 40, 24500, D(4, 18));

  await buy(bakliyat.id, pirinc, 4, 90000, D(2, 10));
  await buy(bakliyat.id, pirinc, 3, 95000, D(3, 14));
  await buy(bakliyat.id, pirinc, 5, 110000, D(4, 20));

  await buy(bakliyat.id, yag, 6, 60000, D(2, 12));
  await buy(bakliyat.id, yag, 8, 72000, D(4, 22));

  await buy(bakliyat.id, domates, 10, 15000, D(3, 2));
  await buy(bakliyat.id, domates, 12, 28000, D(4, 25)); // büyük zam

  if (icecek) {
    await buy(icecek.id, pepsiPkg, 10, 20000, D(3, 1));
    await buy(icecek.id, pepsiPkg, 8, 22000, D(4, 15));
  }

  // Kısmi ödemeler (borç kalsın)
  await prisma.payment.create({ data: { supplierId: et.id, amount: 1500000, method: "HAVALE", date: D(4, 20) } });
  await prisma.payment.create({ data: { supplierId: bakliyat.id, amount: 800000, method: "NAKIT", date: D(4, 24) } });

  console.log("Demo veri eklendi.");
}

main()
  .catch((e) => {
    console.error("HATA:", e);
    process.exit(1);
  })
  .then(() => process.exit(0));
