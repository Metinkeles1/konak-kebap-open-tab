"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Panel", icon: "▦" },
  { href: "/suppliers", label: "Toptancılar", icon: "❏" },
  { href: "/products", label: "Ürünler", icon: "◰" },
  { href: "/purchases", label: "Alışlar", icon: "↧" },
];

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="grain sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-r border-espresso-line bg-espresso bg-linear-to-b from-espresso-2 to-espresso text-espresso-text">
      {/* Brand */}
      <div className="relative z-10 flex items-center gap-3 px-6 py-7">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-ember-bright to-ember text-lg shadow-lg shadow-black/40 ring-1 ring-white/10">
          🥙
        </span>
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold tracking-tight text-white">
            Konak Kebap
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-espresso-muted">
            Cari Takip
          </p>
        </div>
      </div>

      <div className="relative z-10 mx-6 mb-1 h-px bg-linear-to-r from-espresso-line to-transparent" />

      {/* Nav */}
      <nav className="relative z-10 mt-2 flex flex-col gap-1 px-3">
        <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-espresso-muted/70">
          Menü
        </p>
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-espresso-2 text-white shadow-sm ring-1 ring-white/5"
                  : "text-espresso-text/75 hover:bg-espresso-2/60 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-full bg-ember shadow-[0_0_10px_var(--color-ember)]" />
              )}
              <span
                className={`text-base transition-colors ${active ? "text-ember-bright" : "text-espresso-muted group-hover:text-ember-bright"}`}
              >
                {item.icon}
              </span>
              {item.label}
              <NavPending />
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="relative z-10 mt-auto border-t border-espresso-line px-6 py-5">
        <div className="flex items-center gap-2 text-[11px] text-espresso-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-credit opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-credit" />
          </span>
          Neon · Frankfurt
        </div>
      </div>
    </aside>
  );
}
