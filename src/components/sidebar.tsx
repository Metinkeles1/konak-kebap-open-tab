"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Panel", icon: "▦" },
  { href: "/suppliers", label: "Toptancılar", icon: "❏" },
  { href: "/products", label: "Ürünler", icon: "◰" },
  { href: "/purchases", label: "Alışlar", icon: "↧" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-espresso text-espresso-text">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-7">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ember text-lg shadow-lg shadow-black/30">
          🥙
        </span>
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold text-white">
            Konak Kebap
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-espresso-muted">
            Cari Takip
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex flex-col gap-1 px-3">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-espresso-2 text-white"
                  : "text-espresso-text/80 hover:bg-espresso-2/60 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-ember" />
              )}
              <span
                className={`text-base ${active ? "text-ember-bright" : "text-espresso-muted group-hover:text-ember-bright"}`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto border-t border-espresso-line px-6 py-5">
        <div className="flex items-center gap-2 text-[11px] text-espresso-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-credit" />
          Neon · Frankfurt
        </div>
      </div>
    </aside>
  );
}
