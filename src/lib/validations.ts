import { z } from "zod";

// API girdilerini doğrulayan Zod şemaları.
// Para alanları kuruş (integer) olarak gelir.

export const unitEnum = z.enum(["ADET", "LITRE", "KG", "ML", "GR", "PAKET"]);
export const paymentMethodEnum = z.enum([
  "NAKIT",
  "HAVALE",
  "KART",
  "CEK",
  "DIGER",
]);

const kurus = z.number().int().nonnegative();

// --- Toptancı ---
export const supplierCreateSchema = z.object({
  name: z.string().min(1, "İsim zorunlu"),
  phone: z.string().optional(),
  note: z.string().optional(),
  openingBalance: z.number().int().optional(), // devir borcu (kuruş), negatif olabilir
});
export const supplierUpdateSchema = supplierCreateSchema.partial();

// --- Alış birimi (paket) ---
export const packageInputSchema = z.object({
  name: z.string().min(1, "Birim adı zorunlu"), // "Koli", "Adet" ...
  quantityInBase: z.number().int().positive().default(1),
  lastUnitPrice: kurus.optional(),
});

// --- Ürün ---
export const productCreateSchema = z.object({
  name: z.string().min(1, "Ürün adı zorunlu"),
  baseUnit: unitEnum.default("ADET"),
  defaultSupplierId: z.string().optional(),
  packages: z.array(packageInputSchema).optional(), // ürünle birlikte birim tanımı
});
export const productUpdateSchema = productCreateSchema.partial();

// --- Alış ---
export const purchaseItemSchema = z.object({
  productPackageId: z.string().min(1),
  quantity: z.number().positive(), // kg gibi ondalık olabilir
  // gönderilmezse o birimin lastUnitPrice değeri kullanılır
  unitPrice: kurus.optional(),
});
// KDV oranı (% tam sayı). Opsiyonel; girilmezse KDV uygulanmaz.
const vatRate = z.number().int().min(0).max(100);
export const purchaseCreateSchema = z.object({
  supplierId: z.string().min(1),
  date: z.coerce.date().optional(),
  documentNo: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  vatRate: vatRate.optional(),
  note: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, "En az bir kalem gerekli"),
});
// Alış kalemleri DONDURULDUĞU için yalnızca başlık alanları güncellenebilir.
export const purchaseUpdateSchema = z.object({
  date: z.coerce.date().optional(),
  vatRate: vatRate.optional(),
  note: z.string().optional(),
});

// --- Ödeme ---
export const paymentCreateSchema = z.object({
  supplierId: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.coerce.date().optional(),
  method: paymentMethodEnum.optional(),
  note: z.string().optional(),
});
export const paymentUpdateSchema = paymentCreateSchema.partial();

export type SupplierCreate = z.infer<typeof supplierCreateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type PurchaseCreate = z.infer<typeof purchaseCreateSchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
