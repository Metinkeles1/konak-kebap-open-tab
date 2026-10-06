<!-- BEGIN:nextjs-agent-rules -->
# Next.js 16 — dikkat

Bu proje Next.js 16.3.8 + React 19 kullanır; eğitim verindeki eski sürümlerden
farklı olabilir. Next'e özgü bir API'ye (routing, route handler, server/client
component, `next/*` importları, config) dokunmadan ÖNCE
`node_modules/next/dist/docs/` içindeki ilgili rehberi oku. Sadece bizim kodumuzu
düzenlerken bu gerekmez.
<!-- END:nextjs-agent-rules -->

# Proje: Konak Kebap — Tedarik & Cari Takip

Restoranın toptancı/tedarikçi alışlarını, ödemelerini ve cari borcunu takip eder.

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Prisma 7 (driver
adapter `@prisma/adapter-pg`) · Neon Postgres · Zod 4 · Tailwind 4.

## Komutlar
- `npm run dev` — geliştirme sunucusu
- `npm run db:migrate` — şema değişince migration oluştur+uygula (`prisma migrate dev`)
- `npm run db:seed` — örnek veri
- `npm run db:studio` — DB'yi görsel incele
- `npm run lint` / `npm run build`

## Değişmez kurallar (bunlara uy)
- **Para HER ZAMAN kuruş (integer).** DB'de, hesapta, transferde kuruş tut.
  TL ↔ kuruş dönüşümü ve biçimlendirme yalnızca [src/lib/money.ts](src/lib/money.ts) üzerinden.
- **Soft delete:** kayıtlar silinmez, `deletedAt` set edilir. Sorgularda
  `deletedAt: null` filtresini unutma.
- **PurchaseItem.unitPrice DONDURULUR** — alış kalemine yazılan fiyat sonradan değişmez.
- **API zarfı:** her route `{ data }` veya `{ error }` döner. Helper'ları kullan:
  `ok / changed / fail / handleError` ([src/lib/api.ts](src/lib/api.ts)). Veri
  değiştiren uçlar `changed` döner (sayfaları da tazeler).
- **Sayfalar statik + değişiklikte yenilenir:** server action'lar `revalidateAll()`,
  API uçları `changed()` çağırır. Yeni bir yazma yolu eklersen bunu unutma.
- **Mobil:** girişler telefonda ≥16px (`inputClass`), tablo yerine tek DOM'lu
  duyarlı ızgara (bkz. ekstre, ürün listesi); gezinme alttaki sekme çubuğunda.
- **Server action hataları DÖNDÜRÜLÜR, fırlatılmaz:** kullanıcıya mesaj gösterilecekse
  `ActionResult` (`{ ok, data } | { ok: false, error }`) kullan ([src/app/actions.ts](src/app/actions.ts)).
  Next production'da fırlatılan hatanın metnini gizler ("Minified React error #441").
- **Zaman bazlı `export const revalidate` KOYMA:** Next 16.3'te kayıt sonrası tazeleme +
  önyüklemeyle birleşince sayfanın önyükleme istekleri yanıtsız kalıyordu.
- **KDV ürün bazlıdır:** `Product.vatRate` varsayılan oran; her `PurchaseItem` kendi
  `vatRate`/`vatAmount`'unu DONDURUR (fiyat gibi). `Purchase.vatAmount` = kalemlerin
  toplamı (cari bakiye bunu kullanır); `Purchase.vatRate` yalnızca tüm kalemler aynı
  orandaysa dolu. Alışta satırda değiştirilen oran ürüne de yazılır. Hesaplar yalnızca
  [src/lib/vat.ts](src/lib/vat.ts) üzerinden.
- **Girdi doğrulama:** Zod şemaları [src/lib/validations.ts](src/lib/validations.ts) içinde.
- Import alias `@/*` → `src/*`.

## Harita
- `prisma/schema.prisma` — veri modeli (Supplier, Product, ProductPackage,
  Purchase, PurchaseItem, Payment, PriceHistory). Generated client `src/generated/prisma` (gitignore).
- `src/lib/` — `prisma` (client), `money`, `balance` (cari hesap), `api`, `validations`.
- `src/app/api/` — route handler'lar. `src/app/` — sayfalar.

## Notlar
- Türkçe yaz (kod yorumları, UI, kullanıcı mesajları).
- Gizli değerler `.env`'de (gitignore). Asla commit etme/loglaama.
- Şu an direct Neon bağlantısı kullanılıyor; Vercel deploy'da pooled string'e geç.
