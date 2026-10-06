-- Ürün bazlı KDV: ürün varsayılan oranı + her alış kaleminde dondurulan oran/tutar.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "vatRate" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "vatRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vatAmount" INTEGER NOT NULL DEFAULT 0;

-- Eski alışlar: başlıktaki tek KDV oranı kalemlere dağıtılır. Kalem başına yuvarlama
-- toplamı birkaç kuruş kaydırabileceğinden fark, en büyük tutarlı kaleme eklenir —
-- böylece Σ kalem KDV'si = Purchase.vatAmount (cari bakiye kuruşu kuruşuna aynı kalır).
WITH calc AS (
  SELECT
    i.id,
    i."purchaseId",
    COALESCE(p."vatRate", 0) AS rate,
    ROUND(i."lineTotal" * COALESCE(p."vatRate", 0) / 100.0)::int AS v,
    ROW_NUMBER() OVER (PARTITION BY i."purchaseId" ORDER BY i."lineTotal" DESC, i.id) AS rn
  FROM "PurchaseItem" i
  JOIN "Purchase" p ON p.id = i."purchaseId"
  WHERE p."vatAmount" <> 0 OR p."vatRate" IS NOT NULL
),
sums AS (
  SELECT "purchaseId", SUM(v)::int AS s FROM calc GROUP BY "purchaseId"
)
UPDATE "PurchaseItem" t
SET "vatRate" = c.rate,
    "vatAmount" = c.v + CASE WHEN c.rn = 1 THEN p."vatAmount" - s.s ELSE 0 END
FROM calc c
JOIN sums s ON s."purchaseId" = c."purchaseId"
JOIN "Purchase" p ON p.id = c."purchaseId"
WHERE t.id = c.id;
