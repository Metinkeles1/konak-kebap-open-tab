import Link from "next/link";
import { getSuppliersWithBalance } from "@/lib/analytics";
import { createSupplier } from "@/app/actions";
import { PageHeader, Card, Money, EmptyState, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";

export default async function SuppliersPage() {
  const suppliers = await getSuppliersWithBalance();

  return (
    <>
      <PageHeader title="Toptancılar" subtitle={`${suppliers.length} kayıt`} />

      <Card title="Yeni toptancı" className="mb-6">
        <form
          action={createSupplier}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]"
        >
          <input name="name" required placeholder="Toptancı adı *" className={inputClass} />
          <input name="phone" placeholder="Telefon" className={inputClass} />
          <input name="openingBalance" inputMode="decimal" placeholder="Devir borcu (TL)" className={inputClass} />
          <input name="note" placeholder="Not" className={inputClass} />
          <SubmitButton variant="accent">Ekle</SubmitButton>
        </form>
      </Card>

      <Card bodyClassName="">
        {suppliers.length === 0 ? (
          <EmptyState title="Henüz toptancı yok." hint="Yukarıdan ilk toptancıyı ekleyin." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">Toptancı</th>
                <th className="px-5 py-3 font-medium">Telefon</th>
                <th className="px-5 py-3 text-right font-medium">Alış</th>
                <th className="px-5 py-3 text-right font-medium">Ödeme</th>
                <th className="px-5 py-3 text-right font-medium">Borç</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {suppliers.map((s) => (
                <tr key={s.id} className="group transition-colors hover:bg-surface-2">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/suppliers/${s.id}`}
                      className="font-medium text-ink transition-colors group-hover:text-ember"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="nums px-5 py-3.5 text-ink-soft">{s.phone ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Money kurus={s.balance.totalPurchased} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Money kurus={s.balance.totalPaid} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Money kurus={s.balance.balance} colored className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
