"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { InstallAppButton } from "@/components/install-app";

// Gezinme ikonları — satır içi SVG. Unicode glifler (▦ ❏ ◰) bazı telefonlarda
// emoji ya da boş kutu olarak çiziliyordu; SVG her cihazda aynı görünür.
function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

const nav = [
  {
    href: "/",
    label: "Panel",
    short: "Panel",
    icon: (
      <>
        <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
        <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
        <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
      </>
    ),
  },
  {
    href: "/suppliers",
    label: "Toptancılar",
    short: "Toptancılar",
    icon: (
      <>
        <rect x="2.5" y="6" width="11" height="9.5" rx="1" />
        <path d="M13.5 9.5h3.8l3.2 3.4v2.6h-7" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </>
    ),
  },
  {
    href: "/products",
    label: "Ürünler",
    short: "Ürünler",
    icon: (
      <>
        <path d="M12 3 20.5 7.5v9L12 21l-8.5-4.5v-9L12 3Z" />
        <path d="m3.5 7.5 8.5 4.5 8.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
  },
  {
    href: "/purchases",
    label: "Alışlar",
    short: "Alışlar",
    icon: (
      <>
        <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17Z" />
        <path d="M9 8h6M9 11.5h6M9 15h3.5" />
      </>
    ),
  },
  {
    href: "/prices",
    label: "Fiyat Takibi",
    short: "Fiyatlar",
    icon: (
      <>
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
  },
];

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Tıklanan linkte gezinme tamamlanana kadar dönen küçük gösterge.
// Sabit boyutlu (opacity ile gizlenir) → layout kayması olmaz.
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-auto h-3.5 w-3.5 rounded-full border-[1.5px] border-current border-t-transparent transition-opacity ${
        pending ? "animate-spin opacity-70" : "opacity-0"
      }`}
    />
  );
}

// Alt sekmede bekleme: sekmenin üstünde ince bir ilerleme çizgisi.
function TabPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute inset-x-5 top-0 h-0.5 rounded-full bg-ember transition-opacity ${
        pending ? "animate-pulse opacity-100" : "opacity-0"
      }`}
    />
  );
}

function BrandMark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <span
      className={`grid place-items-center bg-linear-to-br from-ember-bright to-ember ring-1 ring-white/10 ${
        size === "lg"
          ? "h-10 w-10 rounded-xl text-lg shadow-lg shadow-black/40"
          : "h-8 w-8 rounded-lg text-base shadow"
      }`}
    >
      🥙
    </span>
  );
}

/* Masaüstü kenar çubuğu (lg ve üstü) */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="grain hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-espresso-line bg-espresso bg-linear-to-b from-espresso-2 to-espresso text-espresso-text lg:flex">
      <div className="relative z-10 flex items-center gap-3 px-6 py-7">
        <BrandMark />
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold tracking-tight text-white">Konak Kebap</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-espresso-muted">Cari Takip</p>
        </div>
      </div>

      <div className="relative z-10 mx-6 mb-1 h-px bg-linear-to-r from-espresso-line to-transparent" />

      <nav className="relative z-10 mt-2 flex flex-col gap-1 px-3">
        <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-espresso-muted/70">
          Menü
        </p>
        {nav.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-espresso-2 text-white shadow-sm ring-1 ring-white/5"
                  : "text-espresso-text/75 hover:bg-espresso-2/60 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-full bg-ember shadow-[0_0_10px_var(--color-ember)]" />
              )}
              <span
                className={`transition-colors ${active ? "text-ember-bright" : "text-espresso-muted group-hover:text-ember-bright"}`}
              >
                <Icon className="h-4.5 w-4.5">{item.icon}</Icon>
              </span>
              {item.label}
              <NavPending />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto" />
      <InstallAppButton />

      <div className="relative z-10 border-t border-espresso-line px-6 py-5">
        <div className="flex items-center gap-2 text-[11px] text-espresso-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-credit opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-credit" />
          </span>
          Neon · Frankfurt
        </div>
      </div>
    </aside>
  );
}

/* Mobil üst bar (lg altı) — yalnızca marka + "yükle". Gezinme alttaki sekmelerde. */
export function MobileTopBar() {
  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-espresso-line bg-espresso px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-espresso-text lg:hidden">
      <BrandMark size="sm" />
      <p className="font-display text-base font-semibold tracking-tight text-white">Konak Kebap</p>
      <div className="ml-auto">
        <InstallAppButton variant="compact" />
      </div>
    </header>
  );
}

/* Mobil alt sekme çubuğu (lg altı) — başparmakla tek dokunuşta her bölüm.
   Akışın içinde (main'in altında) durur; içeriği örtmez, ek boşluk gerekmez.
   iPhone'da ana ekran çubuğunun altına girmemesi için güvenli alan payı var. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Ana menü"
      className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {nav.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight transition-colors active:bg-surface-2 ${
                  active ? "text-ember" : "text-muted"
                }`}
              >
                <TabPending />
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                    active ? "bg-ember-soft" : ""
                  }`}
                >
                  <Icon className="h-5 w-5">{item.icon}</Icon>
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
