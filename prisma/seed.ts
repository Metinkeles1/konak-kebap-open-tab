import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Geliştirme için örnek veri. `npm run db:seed` ile çalışır.
async function main() {
  const supplier = await prisma.supplier.create({
    data: {
      name: "Örnek İçecek Toptancısı",
      phone: "0212 000 00 00",
    },
  });

  const pepsi = await prisma.product.create({
    data: {
      name: "1 Litrelik Pepsi",
      baseUnit: "ADET",
      defaultSupplierId: supplier.id,
      packages: {
        create: [
          { name: "Koli", quantityInBase: 24, lastUnitPrice: 20000 }, // 200,00 ₺
          { name: "Adet", quantityInBase: 1, lastUnitPrice: 1000 }, // 10,00 ₺
        ],
      },
    },
    include: { packages: true },
  });

  console.log("Seed tamam:", {
    supplier: supplier.name,
    product: pepsi.name,
    packages: pepsi.packages.map((p) => p.name),
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
