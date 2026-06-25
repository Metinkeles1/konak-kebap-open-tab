"use client";

import { useEffect, useState } from "react";
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

// Marka kilidi — hem masaüstü kenar çubuğunda hem mobil çekmecede.
function Brand() {
  return (
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
  );
}

// Kenar çubuğunun iç gövdesi — masaüstü ve mobil çekmecede paylaşılır.
function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <Brand />

      <div className="relative z-10 mx-6 mb-1 h-px bg-linear-to-r from-espresso-line to-transparent" />

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
              onClick={onNavigate}
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

      <div className="relative z-10 mt-auto border-t border-espresso-line px-6 py-5">
        <div className="flex items-center gap-2 text-[11px] text-espresso-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-credit opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-credit" />
          </span>
          Neon · Frankfurt
        </div>
      </div>
    </>
  );
}

const asideShell =
  "grain flex h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-espresso-line bg-espresso bg-linear-to-b from-espresso-2 to-espresso text-espresso-text";

export function Sidebar() {
  const [open, setOpen] = useState(false);
  // Rota değişiminde çekmece, link onClick'lerindeki setOpen(false) ile kapanır.

  // Çekmece açıkken Esc ile kapat.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobil üst bar — yalnızca küçük ekran */}
      <header className="grain sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-espresso-line bg-espresso px-4 py-3 text-espresso-text lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menüyü aç"
          className="grid h-9 w-9 place-items-center rounded-lg border border-espresso-line text-espresso-text transition-colors hover:bg-espresso-2"
        >
          <span className="flex flex-col gap-0.75">
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
          </span>
        </button>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-ember-bright to-ember text-base shadow ring-1 ring-white/10">
          🥙
        </span>
        <p className="font-display text-base font-semibold tracking-tight text-white">
          Konak Kebap
        </p>
      </header>

      {/* Masaüstü kenar çubuğu */}
      <aside className={`hidden lg:flex ${asideShell}`}>
        <NavBody />
      </aside>

      {/* Mobil çekmece + karartma */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`${asideShell} relative shadow-pop transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Menüyü kapat"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-lg text-espresso-muted transition-colors hover:bg-espresso-2 hover:text-white"
          >
            ✕
          </button>
          <NavBody onNavigate={() => setOpen(false)} />
        </aside>
      </div>
    </>
  );
}
