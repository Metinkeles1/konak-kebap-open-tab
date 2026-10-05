import { getPriceTracking } from "@/lib/analytics";
import { PageHeader } from "@/components/ui";
import { PriceTracker } from "./price-tracker";

// Fiyat Takibi: hangi ürüne, hangi toptancıdan, ne kadar zam geldiğini toplu gösterir.
// Tüm hatlar bir kez yüklenir; dönem/filtre değişimi istemcide anında hesaplanır.
// Dönem sınırı (`now`) sayfa üretilirken sabitlenir (her kayıttan sonra yenilenir).
// Zaman bazlı `revalidate` bilerek YOK — bkz. src/app/page.tsx notu.
export default async function PricesPage() {
  const { lines, now } = await getPriceTracking();

  return (
    <>
      <PageHeader
        title="Fiyat Takibi"
        subtitle="Ürünlere gelen zamlar ve indirimler · toptancı bazında"
      />
      <PriceTracker lines={lines} now={now} />
    </>
  );
}
