"use client"; // Hata sınırları Client Component olmak zorunda

import { useEffect } from "react";

// Sayfa segmentlerinde (panel, toptancılar, alışlar, ürünler) oluşan beklenmeyen
// hataları yakalar. Önceden bir bağlantı hatası kullanıcıya hiç gösterilmiyordu;
// artık anlamlı bir mesaj + "Tekrar dene" ile kurtarılabiliyor.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Sunucu loglarıyla eşleştirmek için (digest) konsola yaz.
    console.error(error);
  }, [error]);

  // Mesaj/digest'ten bağlantı kaynaklı hata mı diye tahmin et — kullanıcıya
  // teknik metin yerine "veritabanına ulaşılamadı, tekrar deneyin" diyelim.
  const text = `${error.message ?? ""}`;
  const looksLikeConnection =
    /reach database|connection|timed out|timeout|ECONN|ETIMEDOUT|P100\d/i.test(
      text,
    );

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-card border border-line bg-surface px-8 py-10 shadow-card">
        <p className="font-display text-xl font-semibold text-ink">
          {looksLikeConnection
            ? "Veritabanına şu an ulaşılamadı"
            : "Bir şeyler ters gitti"}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {looksLikeConnection
            ? "Veritabanı uykudan kalkıyor olabilir. Birkaç saniye sonra tekrar deneyin — kaydetmeye çalıştığınız veri kaybolmadı."
            : "İşlem tamamlanamadı. Tekrar deneyebilir ya da sayfayı yenileyebilirsiniz."}
        </p>
        <button
          onClick={() => unstable_retry()}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-ember px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ember-bright"
        >
          Tekrar dene
        </button>
        {error.digest && (
          <p className="mt-4 text-[11px] text-muted/70">
            Hata kodu: <span className="nums">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
