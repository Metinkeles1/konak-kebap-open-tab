"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deletePurchase } from "@/app/actions";
import { formatKurus } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { Money, Badge } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  EditPurchaseForm,
  type ListPurchase,
  type ProductOpt,
} from "./edit-purchase-form";

export function PurchaseModal({
  purchase,
  suppliers,
  products,
  catalog,
  onClose,
}: {
  purchase: ListPurchase;
  suppliers: { id: string; name: string }[];
  products: ProductOpt[];
  catalog: Record<string, ProductOpt[]>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    const fd = new FormData();
    fd.set("id", purchase.id);
    fd.set("supplierId", purchase.supplierId);
    // Silinince liste tazelenir, bu alış kaybolur → modal kendiliğinden kapanır.
    startTransition(async () => {
      await deletePurchase(fd);
    });
  }

  return (
    <Modal
      onClose={onClose}
      title={purchase.supplierName}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <span className="nums">{formatDateTime(purchase.date)}</span>
          {purchase.documentNo && <Badge>{purchase.documentNo}</Badge>}
          <span>· {purchase.items.length} kalem</span>
        </div>
      }
    >
      {editing ? (
        <EditPurchaseForm
          purchase={purchase}
          suppliers={suppliers}
          products={products}
          catalog={catalog}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-5">
          {/* Kalemler */}
          <div className="overflow-hidden rounded-card border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2.5 font-medium">Ürün</th>
                  <th className="px-4 py-2.5 font-medium">Birim</th>
                  <th className="px-4 py-2.5 text-right font-medium">Adet</th>
                  <th className="px-4 py-2.5 text-right font-medium">Birim fiyat</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {purchase.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">{i.productName}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{i.unit}</td>
                    <td className="nums px-4 py-2.5 text-right text-ink-soft">{i.quantity}</td>
                    <td className="nums px-4 py-2.5 text-right text-ink-soft">
                      {formatKurus(i.unitPrice)}
                    </td>
                    <td className="nums px-4 py-2.5 text-right font-medium text-ink">
                      {formatKurus(Math.round(i.unitPrice * i.quantity))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {purchase.vatAmount > 0 && (
                  <>
                    <tr className="border-t border-line">
                      <td colSpan={4} className="px-4 py-1.5 text-right text-xs text-muted">
                        Ara toplam
                      </td>
                      <td className="nums px-4 py-1.5 text-right text-xs text-ink-soft">
                        {formatKurus(purchase.subtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-1.5 text-right text-xs text-muted">
                        KDV %{purchase.vatRate}
                      </td>
                      <td className="nums px-4 py-1.5 text-right text-xs text-ink-soft">
                        {formatKurus(purchase.vatAmount)}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="border-t border-line bg-surface-2/50">
                  <td colSpan={4} className="px-4 py-2.5 text-right text-sm text-muted">
                    {purchase.vatAmount > 0 ? "Genel toplam" : "Toplam"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money kurus={purchase.total} className="font-semibold" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {purchase.note && (
            <p className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-soft">
              <span className="text-muted">Not:</span> {purchase.note}
            </p>
          )}

          {/* Aksiyonlar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
            >
              Düzenle
            </button>
            <Link
              href={`/suppliers/${purchase.supplierId}`}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ember"
            >
              Cari ekstreyi gör
            </Link>
            {confirmDelete ? (
              <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                Silinsin mi?
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-debt px-2.5 py-1 font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
                >
                  {pending && (
                    <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                  )}
                  {pending ? "Siliniyor…" : "Evet, sil"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                  className="rounded-md px-2 py-1 font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
                >
                  Vazgeç
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-debt-soft hover:text-debt"
              >
                Sil
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
