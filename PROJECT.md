# Restoran Tedarik & Cari Takip Sistemi

> Restorana gelen malzemelerin miktar ve fiyatlarını kaydeden; toptancılara olan
> borçları, yapılan ödemeleri ve fiyat değişimlerini kolayca takip etmeyi sağlayan
> kişisel bir uygulama.

---

## 1. Amaç ve Vizyon

Restorana toptancılardan gelen ürünleri (örn. "5 adet 1 litrelik Pepsi") hızlıca
kaydetmek ve şu sorulara anında cevap alabilmek:

- Hangi toptancıya **ne kadar borcum var**?
- Bir toptancıya **ne zaman, ne kadar ödeme** yaptım?
- Bir ürünün **fiyatı zaman içinde nasıl değişti**?
- Toplam harcamam / borcum / ödediğim ne durumda?

### Temel kullanım mantığı (en önemli kural)

1. Bir ürün **ilk kez** girilirken: miktar + birim fiyat girilir, ürün kaydedilir.
2. Aynı ürün **tekrar geldiğinde**: kullanıcı ürünü seçer, sistem **son bilinen
   fiyatı otomatik doldurur**. Kullanıcı fiyatı değiştirmezse o fiyatla hesaplanır.
3. Kullanıcı fiyatı **değiştirirse**: yeni fiyatla kaydedilir **ve** fiyat geçmişine
   yeni bir kayıt düşer (fiyat değişimi izlenebilir).
4. Her alış, ilgili toptancının **cari borcunu** otomatik artırır; her ödeme azaltır.

---

## 2. Teknoloji Kararları

| Konu | Seçim | Neden |
|------|-------|-------|
| Framework | **Next.js (App Router)** | Vercel'in doğal evi, sıfır config deploy |
| API stili | **RESTful** (`/api/...` route'ları) | Kaynak bazlı, mobil/dış kullanıma açık |
| Mimari | **Tek proje** (API + Web aynı Next.js'te) | Tek deploy = Vercel'de ekstra maliyet yok |
| Dil | **TypeScript** | Tip güvenliği |
| Veritabanı | **PostgreSQL (Neon / Vercel Postgres)** | İlişkisel + finansal veri, Vercel entegre, ücretsiz katman |
| ORM | **Prisma** | Tip güvenli sorgu + migration yönetimi |
| UI | **Tailwind CSS + shadcn/ui** | Hızlı, temiz, modern arayüz |
| Doğrulama | **Zod** | API girdilerini doğrulama |
| Auth | **Yok** (tek kullanıcı: sadece ben) | Basitlik. İleride eklenebilir. |

### Neden bu seçimler?
- **Postgres vs MongoDB:** Borç = (alışlar toplamı − ödemeler toplamı). Bu ilişkisel
  bir toplama işi; Postgres bunda güçlü ve finansal tutarlılığı korur.
- **Next.js içinde API:** Ayrı backend = ikinci servis + maliyet + bakım. Next.js API
  route'ları Vercel'de serverless çalışır, kullanılmadığında ücret çıkarmaz.

---

## 3. Para ve Tarih Kuralları (ÖNEMLİ)

- **Tüm para tutarları `kuruş` (integer) olarak saklanır.** (Örn. 12,50 TL → `1250`)
  Ondalık/float hatalarını önlemek için. Gösterimde 100'e bölünür.
- **Tarihler UTC** olarak saklanır, arayüzde yerel saate çevrilir.
- Para birimi: **TRY** (sabit, şimdilik tek para birimi).

---

## 4. Veri Modeli (Prisma Şeması Taslağı)

> **Soft delete kuralı (genel):** Hiçbir kayıt veritabanından fiziksel silinmez.
> Tüm ana tablolarda `deletedAt DateTime?` alanı vardır. Silme = `deletedAt`'i
> doldurmak. Listeleme/hesaplama sorguları `deletedAt = null` olanları alır. Böylece
> finansal geçmiş (borç/ödeme/fiyat) hiçbir zaman bozulmaz.

### Supplier (Toptancı)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| name | String | Toptancı adı |
| phone | String? | Telefon |
| note | String? | Not |
| createdAt | DateTime | |
| deletedAt | DateTime? | Soft delete |

### Product (Ürün)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| name | String | Örn. "1 Litrelik Pepsi" |
| baseUnit | Enum(ADET, LITRE, KG, ML, GR, PAKET) | Ürünün temel ölçü birimi |
| defaultSupplierId | String? | Genelde alındığı toptancı (opsiyonel) |
| createdAt | DateTime | |
| deletedAt | DateTime? | Soft delete |

### ProductPackage (Alış Birimi / Paket Türü) — çoklu birim desteği
Aynı ürünü bazen **koli**, bazen **adet** alabildiğin için her ürünün birden fazla
alış birimi olabilir. Her birim kendi son fiyatını ayrı tutar.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| productId | String | Hangi ürüne ait |
| name | String | Örn. "Koli", "Adet", "6'lı Paket" |
| quantityInBase | Int | Bu birim kaç temel birime denk (Koli=24, Adet=1) |
| lastUnitPrice | Int? | Bu birimin son bilinen fiyatı (kuruş) — otomatik doldurma |
| createdAt | DateTime | |
| deletedAt | DateTime? | Soft delete |

> Örnek: *1 Litrelik Pepsi* ürününün iki alış birimi olur →
> `Koli` (quantityInBase=24, lastUnitPrice=20000) ve `Adet` (quantityInBase=1,
> lastUnitPrice=1000). Alışta hangisini aldığını seçersin.

### Purchase (Alış / Sevkiyat — başlık)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| supplierId | String | Hangi toptancıdan |
| date | DateTime | Alış tarihi |
| note | String? | Not |
| createdAt | DateTime | |
| deletedAt | DateTime? | Soft delete (iptal/yanlış giriş) |

### PurchaseItem (Alış kalemi — değişmez kayıt)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| purchaseId | String | Hangi alışa ait |
| productPackageId | String | Hangi alış birimi (koli/adet vb.) |
| quantity | Int | Kaç paket/birim alındı |
| unitPrice | Int | O anki birim (paket) fiyatı (kuruş) — sonradan değişmez |
| lineTotal | Int | quantity × unitPrice (kuruş) |

> Not: `unitPrice` kalemde **dondurulur**; birimin fiyatı sonradan değişse bile geçmiş
> alışlar etkilenmez. PurchaseItem, Purchase silinmeden silinmez (başlığa bağlı).

### Payment (Ödeme)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| supplierId | String | Hangi toptancıya |
| amount | Int | Ödenen tutar (kuruş) |
| date | DateTime | Ödeme tarihi |
| method | Enum(NAKIT, HAVALE, KART, CEK, DIGER)? | Ödeme şekli |
| note | String? | Not |
| deletedAt | DateTime? | Soft delete |

### PriceHistory (Fiyat Geçmişi)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | String (cuid) | PK |
| productPackageId | String | Hangi alış birimi |
| supplierId | String? | Hangi toptancıdan (opsiyonel) |
| unitPrice | Int | Birim fiyat (kuruş) |
| effectiveDate | DateTime | Geçerlilik tarihi |
| source | Enum(PURCHASE, MANUAL) | Alıştan mı geldi, elle mi değişti |

### İlişkiler
- `Supplier` 1—N `Product` (defaultSupplier), `Purchase`, `Payment`
- `Product` 1—N `ProductPackage`
- `ProductPackage` 1—N `PurchaseItem`, `PriceHistory`
- `Purchase` 1—N `PurchaseItem`

### Hesaplanan değerler (tablo değil, sorgu)
- **Toptancı bakiyesi (borç):** `Σ(silinmemiş PurchaseItem.lineTotal) − Σ(silinmemiş Payment.amount)`
- **Birim son fiyatı:** `ProductPackage.lastUnitPrice` (alışta otomatik güncellenir)

---

## 5. REST API Tasarımı

Tüm cevaplar JSON. Tutarlar kuruş cinsinden döner.

### Toptancılar
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/suppliers` | Tüm toptancılar (+ bakiye özeti) |
| POST | `/api/suppliers` | Yeni toptancı |
| GET | `/api/suppliers/:id` | Tek toptancı detayı |
| PUT | `/api/suppliers/:id` | Güncelle |
| DELETE | `/api/suppliers/:id` | Sil |
| GET | `/api/suppliers/:id/balance` | Borç durumu (alış toplamı, ödeme toplamı, bakiye) |
| GET | `/api/suppliers/:id/ledger` | Cari hareket dökümü (alışlar + ödemeler kronolojik) |

### Ürünler ve Alış Birimleri
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/products` | Tüm ürünler (+ alış birimleri + son fiyatlar) |
| POST | `/api/products` | Yeni ürün (birlikte alış birimleri tanımlanabilir) |
| GET | `/api/products/:id` | Tek ürün (birimleriyle) |
| PUT | `/api/products/:id` | Güncelle |
| DELETE | `/api/products/:id` | Soft delete (deletedAt) |
| GET | `/api/products/:id/packages` | Ürünün alış birimleri (koli/adet vb.) |
| POST | `/api/products/:id/packages` | Yeni alış birimi ekle |
| PUT | `/api/packages/:id` | Alış birimini güncelle |
| DELETE | `/api/packages/:id` | Alış birimini soft delete |
| GET | `/api/packages/:id/price-history` | O birimin fiyat değişim geçmişi |

> Tüm DELETE uçları **soft delete** yapar (kaydı `deletedAt` ile pasifleştirir),
> fiziksel silmez.

### Alışlar
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/purchases` | Alış listesi (filtre: supplierId, tarih aralığı) |
| POST | `/api/purchases` | Yeni alış (kalemleriyle). Fiyat değiştiyse PriceHistory + ProductPackage.lastUnitPrice güncellenir |
| GET | `/api/purchases/:id` | Alış detayı (kalemler) |
| DELETE | `/api/purchases/:id` | Alış sil |

### Ödemeler
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/payments` | Ödeme listesi (filtre: supplierId, tarih) |
| POST | `/api/payments` | Yeni ödeme |
| DELETE | `/api/payments/:id` | Ödeme sil |

### Özet / Rapor
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/dashboard` | Genel özet: toplam borç, toplam ödeme, toptancı bazında bakiyeler |

### Örnek: Yeni alış oluşturma (POST `/api/purchases`)
```json
{
  "supplierId": "ckxyz...",
  "date": "2026-05-29T10:00:00Z",
  "note": "Haftalık içecek siparişi",
  "items": [
    { "productPackageId": "ckpkg_koli", "quantity": 2, "unitPrice": 20000 },
    { "productPackageId": "ckpkg_adet", "quantity": 5 }
  ]
}
```
> - Her kalem bir **alış birimine** (`productPackageId`) bağlıdır (koli, adet vb.).
> - `unitPrice` gönderilmezse o birimin `lastUnitPrice` değeri kullanılır (otomatik
>   doldurma).
> - Gönderilen fiyat eski fiyattan farklıysa: `PriceHistory`'ye yeni kayıt eklenir ve
>   `ProductPackage.lastUnitPrice` güncellenir.
> - Yukarıdaki örnek: 2 koli + 5 adet Pepsi aynı alışta girilebilir.

---

## 6. Klasör Yapısı (planlanan)

```
open-tab/
├── prisma/
│   └── schema.prisma          # Veri modeli
├── src/
│   ├── app/
│   │   ├── api/               # REST API route'ları
│   │   │   ├── suppliers/
│   │   │   ├── products/
│   │   │   ├── purchases/
│   │   │   ├── payments/
│   │   │   └── dashboard/
│   │   ├── (web)/             # Web arayüzü sayfaları (sonraki faz)
│   │   └── layout.tsx
│   │   └── generated/prisma/  # Üretilen Prisma client (gitignore)
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client (singleton + pg adapter)
│   │   ├── money.ts           # Kuruş ↔ TL dönüşüm yardımcıları
│   │   ├── api.ts             # Ortak cevap zarfı + hata yönetimi
│   │   ├── balance.ts         # Toptancı bakiye/borç hesabı
│   │   └── validations.ts     # Zod şemaları
│   └── components/            # UI bileşenleri (sonraki faz)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                # Örnek veri
├── prisma.config.ts           # Prisma 7 yapılandırma
├── .env / .env.example        # DATABASE_URL (Neon)
├── package.json
└── PROJECT.md                 # Bu dosya
```

---

## 7. Yol Haritası (Roadmap)

### Faz 0 — Kurulum
- [x] Next.js + TypeScript + Tailwind projesi oluştur
- [x] Prisma kur, şemayı yaz (çoklu alış birimi + soft delete)
- [x] Prisma client + driver adapter (pg) + singleton
- [x] lib: money (kuruş↔TL), api (cevap zarfı), validations (Zod), balance
- [x] `.env.example`, seed (örnek veri), build script'leri (`prisma generate`)
- [ ] Neon veritabanı oluştur, `DATABASE_URL` ayarla → ilk migration (`npm run db:migrate`)

### Faz 1 — Çekirdek API (RESTful)
- [x] Toptancı CRUD + bakiye (referans desen: soft delete + cari hesap)
- [ ] Ürün CRUD + alış birimi (package) uçları (+ otomatik son fiyat mantığı)
- [ ] Alış oluşturma (kalemler + fiyat geçmişi + lastUnitPrice güncelleme — transaction)
- [ ] Ödeme CRUD
- [ ] Toptancı ledger (cari hareket dökümü) + dashboard özeti
- [x] Zod ile girdi doğrulama (altyapı hazır)

### Faz 2 — Web Arayüzü
- [ ] Dashboard (genel borç/ödeme özeti)
- [ ] Toptancı listesi + detay (cari döküm)
- [ ] Ürün listesi + fiyat geçmişi grafiği
- [ ] Hızlı alış girişi ekranı (ürün seç → fiyat otomatik dolsun)
- [ ] Ödeme girişi ekranı

### Faz 3 — İyileştirmeler
- [ ] Tarih aralığı filtreleri ve raporlar
- [ ] Fiyat değişim uyarıları ("Bu ürün geçen sefere göre %X zamlandı")
- [ ] (Opsiyonel) Giriş/şifre koruması
- [ ] (Opsiyonel) Excel/CSV dışa aktarma

---

## 8. Açık Konular / İleride Karar Verilecekler

- Fiyat toptancıya göre mi değişmeli? (Şimdilik ürün bazında tek "son fiyat" tutuluyor;
  gerekirse toptancı+ürün bazına genişletilebilir.)
- Borç sadece toplam mı, yoksa her alış kalemiyle eşleşen ödeme takibi mi? (Şimdilik
  toplam cari mantığı: borç = alışlar − ödemeler.)
- Stok takibi (eldeki miktar) bu projenin kapsamında değil; istenirse eklenir.

---

## 9. Kurulum & Çalıştırma

### Gereksinimler
- Node.js 18+ (geliştirme makinesinde Node 24 kullanıldı)
- Bir PostgreSQL veritabanı (Neon / Vercel Postgres önerilir)

### Adımlar
1. **Bağımlılıklar:** `npm install`
2. **Ortam değişkeni:** `.env.example` dosyasını `.env` olarak kopyalayıp
   `DATABASE_URL`'i gerçek Neon bağlantınla doldur.
3. **Veritabanı şeması:** `npm run db:migrate` (ilk migration'ı oluşturup uygular)
4. **(Opsiyonel) Örnek veri:** `npm run db:seed`
5. **Geliştirme sunucusu:** `npm run dev` → http://localhost:3000

### Faydalı script'ler
| Komut | İş |
|-------|----|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | `prisma generate` + production build |
| `npm run db:migrate` | Migration oluştur/uygula (dev) |
| `npm run db:deploy` | Migration'ları uygula (prod/Vercel) |
| `npm run db:studio` | Prisma Studio (görsel DB tarayıcı) |
| `npm run db:seed` | Örnek veri yükle |

### Vercel'e dağıtım notları
- Vercel ortam değişkenlerine `DATABASE_URL` eklenmeli (Neon pooled bağlantısı).
- Build komutu `prisma generate` içerir; üretilen client gitignore'dadır.
- Migration'lar Vercel'de otomatik çalışmaz; deploy öncesi `npm run db:deploy`
  (veya Vercel build komutuna eklenerek) uygulanır.

### Teknik notlar
- **Prisma 7** driver adapter kullanır → `@prisma/adapter-pg` + `pg`. Bağlantı
  `src/lib/prisma.ts` içinde `DATABASE_URL`'den okunur.
- Prisma client `src/generated/prisma` altına üretilir (`@/generated/prisma/client`).
- API cevap zarfı: başarı `{ data }`, hata `{ error: { message, details } }`.
