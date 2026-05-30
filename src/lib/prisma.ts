import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 driver adapter kullanır. Bağlantı dizesi .env'deki DATABASE_URL'den gelir.
//
// pg-connection-string, `sslmode=require | prefer | verify-ca` değerlerini
// gelecekteki büyük sürümde semantik değişeceği için uyarıyla karşılıyor. Şu an
// bu modlar zaten `verify-full` gibi davrandığından, dizeyi açıkça `verify-full`a
// çevirip uyarıyı susturuyoruz — davranış birebir aynı kalır (Neon geçerli
// sertifika sunar, doğrulama sorunsuz geçer).
const connectionString = process.env.DATABASE_URL?.replace(
  /([?&]sslmode=)(require|prefer|verify-ca)\b/i,
  "$1verify-full",
);

// Next.js dev modunda hot-reload her seferinde yeni client/pool oluşturmasın diye
// global üzerinde tekil (singleton) tutuyoruz.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
