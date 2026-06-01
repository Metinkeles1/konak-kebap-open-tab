import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
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
        {/* Uygulama kabuğu: sidebar sabit, yalnızca içerik kendi içinde kayar. */}
        <div className="flex h-dvh">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="stagger mx-auto w-full max-w-425 px-5 py-7 sm:px-8 sm:py-8 2xl:px-12">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
