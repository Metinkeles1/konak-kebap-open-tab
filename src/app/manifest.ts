import type { MetadataRoute } from "next";

// PWA manifest — telefonda "Ana ekrana ekle" ile uygulama gibi (tam ekran,
// kendi simgesiyle) açılır. Renkler "Ledger & Ember" temasından.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Konak Kebap — Cari Takip",
    short_name: "Konak Cari",
    description: "Toptancı alış, ödeme ve cari borç takibi",
    lang: "tr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4efe6", // --color-paper
    theme_color: "#1a1512", // --color-espresso (mobil üst bar)
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Uzun basınca çıkan hızlı kısayollar (Android).
    shortcuts: [
      { name: "Yeni alış", url: "/purchases", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Sayım modu", url: "/purchases/sayim", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Toptancılar", url: "/suppliers", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
