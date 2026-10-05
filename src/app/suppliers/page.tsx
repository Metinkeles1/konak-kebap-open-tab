import Link from "next/link";
import { getSuppliersWithBalance } from "@/lib/analytics";
import { createSupplier } from "@/app/actions";
import { PageHeader, Card, Money, EmptyState, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { MobileCollapsible } from "@/components/mobile-collapsible";

export default async function SuppliersPage() {
  const suppliers = await getSuppliersWithBalance();

  return (
    <>
      <PageHeader title="Toptancılar" subtitle={`${suppliers.length} kayıt`} />

      <MobileCollapsible title="Yeni toptancı" className="mb-6" defaultOpen={suppliers.length === 0}>
        <form
          action={createSupplier}
          className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]"
        >
          {/* Telefonda: ad ve not tam genişlik, telefon + devir yan yana. */}
          <input name="name" required placeholder="Toptancı adı *" className={`${inputClass} col-span-2 sm:col-span-1`} />
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="Telefon" className={inputClass} />
          <input name="openingBalance" inputMode="decimal" placeholder="Devir borcu (TL)" className={inputClass} />
          <input name="note" placeholder="Not" className={`${inputClass} col-span-2 sm:col-span-1`} />
          <SubmitButton variant="accent" className="col-span-2 py-2.5 sm:col-span-1 sm:py-2">
            Ekle
          </SubmitButton>
        </form>
      </MobileCollapsible>

      <Card bodyClassName="">
        {suppliers.length === 0 ? (
          <EmptyState title="Henüz toptancı yok." hint="Yukarıdan ilk toptancıyı ekleyin." />
        ) : (
          // Tek DOM, iki düzen: telefonda "ad + telefon | borç" kartı (satırın
          // tamamı dokunulabilir), geniş ekranda 5 sütunlu tablo görünümü.
          // Eskiden <table> telefonda ekranın dışına (607px) taşıyordu.
          <div className="text-sm">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-4 border-b border-line px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
              <span>Toptancı</span>
              <span>Telefon</span>
              <span className="text-right">Alış</span>
              <span className="text-right">Ödeme</span>
              <span className="text-right">Borç</span>
            </div>
            <ul className="divide-y divide-line">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/suppliers/${s.id}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-surface-2 active:bg-surface-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))] sm:px-5 sm:py-3.5"
                  >
                    <span className="truncate font-medium text-ink transition-colors group-hover:text-ember">
                      {s.name}
                    </span>
                    <span className="nums col-start-1 row-start-2 truncate text-xs text-muted sm:col-start-auto sm:row-start-auto sm:text-sm sm:text-ink-soft">
                      {s.phone ?? "—"}
                    </span>
                    <span className="hidden text-right sm:block">
                      <Money kurus={s.balance.totalPurchased} />
                    </span>
                    <span className="hidden text-right sm:block">
                      <Money kurus={s.balance.totalPaid} />
                    </span>
                    <span className="col-start-2 row-span-2 row-start-1 flex items-center gap-2 text-right sm:col-start-auto sm:row-span-1 sm:row-start-auto sm:block">
                      <Money kurus={s.balance.balance} colored className="font-semibold" />
                      <span className="text-muted sm:hidden" aria-hidden>
                        ›
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  );
}
