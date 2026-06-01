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

// --- Geçici bağlantı hatalarına dayanıklılık ---------------------------------
// Neon (ve genelde serverless Postgres) boştayken uykuya geçer; sabah ilk istek
// veritabanını uyandırırken bağlantı birkaç saniye reddedilebilir ya da yarıda
// kopabilir. Bu hatalar GEÇİCİDİR — kısa bir bekleyip tekrar denemek çözer.
// Aşağıdaki kodlar/mesajlar bu sınıfa girer; bunları birkaç kez yeniden deniyoruz.
const TRANSIENT_HINTS = [
  // Prisma hata kodları
  "P1001", // Can't reach database server
  "P1002", // database server reachable but timed out
  "P1008", // operations timed out
  "P1017", // server has closed the connection
  // Postgres SQLSTATE
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now (sunucu daha hazır değil — Neon uyanıyor)
  // Soket düzeyi
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EPIPE",
  // Serbest metin (sürücü bazen sadece mesaj döndürür)
  "Can't reach database server",
  "Connection terminated",
  "connection closed",
  "Timed out",
  "timeout expired",
];

function isTransient(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const haystack = `${typeof code === "string" ? code : ""} ${message}`;
  return TRANSIENT_HINTS.some((hint) => haystack.includes(hint));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries - 1 || !isTransient(err)) throw err;
      // 250ms, 500ms, 1000ms — uyanan veritabanına nefes aldırır.
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastErr;
}

// Next.js dev modunda hot-reload her seferinde yeni client/pool oluşturmasın diye
// global üzerinde tekil (singleton) tutuyoruz.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

function createClient() {
  // Havuz ayarları: cold-start uyanışını beklemek için connectionTimeout'u
  // cömert tut; serverless'te bağlantı tükenmesini önlemek için max'i sınırla.
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 10_000,
    max: 10,
  });
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

  // Her sorguyu geçici bağlantı hatalarına karşı yeniden-denemeyle sar.
  // Etkileşimli transaction'ların İÇİ `tx` ile çalıştığından buraya düşmez —
  // yani bir transaction yarıda yeniden denenmez (tutarlılık korunur).
  return client.$extends({
    query: {
      $allOperations({ args, query }) {
        return withRetry(() => query(args));
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
