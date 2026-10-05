import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Sidebar, MobileTopBar, MobileTabBar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Konak Kebap — Cari Takip",
  description: "Toptancı tedarik, alış ve cari borç takibi",
  applicationName: "Konak Cari",
  // iPhone'da "Ana Ekrana Ekle" → tam ekran uygulama gibi açılır.
  appleWebApp: { capable: true, title: "Konak Cari", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

// Tarayıcı/durum çubuğu rengi mobil üst barla (espresso) aynı.
// viewportFit "cover": iPhone'da env(safe-area-inset-*) değerleri dolar; alt sekme
// çubuğu ana ekran çizgisinin, üst bar çentiğin altına girmez.
export const viewport: Viewport = {
  themeColor: "#1a1512",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full`}
    >
      <body className="h-dvh overflow-hidden">
        {/* Uygulama kabuğu: masaüstünde sidebar solda sabit; mobilde üstte ince
            bar, altta sekme çubuğu. Yalnızca <main> kayar — barlar yerinde kalır. */}
        <div className="flex h-dvh flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:flex-row">
          <MobileTopBar />
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="stagger mx-auto w-full max-w-425 px-4 py-5 sm:px-8 sm:py-8 2xl:px-12">
              {children}
            </div>
          </main>
          <MobileTabBar />
        </div>
      </body>
    </html>
  );
}
