"use client";

// WhatsApp cari mutabakat — alış sonrası (kalemler + önceki bakiye → güncel borç)
// ya da genel bakiye (son hareketler + bugünkü borç). Mesaj önizlenir, istenirse
// düzenlenir, tek tuşla toptancının WhatsApp sohbetine gönderilir.
import { useEffect, useState } from "react";
import { loadBalanceReconciliation, loadPurchaseReconciliation } from "@/app/actions";
import { formatKurus } from "@/lib/money";
import type { BalanceReconciliation, PurchaseReconciliation } from "@/lib/reconciliation";
import { Modal } from "@/components/modal";
import {
  buildBalanceReconText,
  buildPurchaseReconText,
  waPhone,
  WhatsAppButton,
} from "@/components/whatsapp";

export type ReconSource =
  | { type: "purchase"; purchaseId: string }
  | { type: "balance"; supplierId: string };

type Data = PurchaseReconciliation | BalanceReconciliation;

function balanceText(k: number) {
  return k < 0 ? `${formatKurus(-k)} alacak` : formatKurus(k);
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`nums mt-0.5 text-sm ${strong ? "font-semibold text-debt" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

/** Pencere içeriği — hem bağımsız pencerede hem alış detay modalında kullanılır. */
export function ReconciliationPanel({
  source,
  savedNote,
  onClose,
}: {
  source: ReconSource;
  /** Alış yeni kaydedildiyse üstte gösterilen onay satırı. */
  savedNote?: string;
  onClose?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sourceKey = source.type === "purchase" ? source.purchaseId : source.supplierId;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d =
          source.type === "purchase"
            ? await loadPurchaseReconciliation(source.purchaseId)
            : await loadBalanceReconciliation(source.supplierId);
        if (!alive) return;
        if (!d) return setError("Kayıt bulunamadı (silinmiş olabilir).");
        setData(d);
        setText(d.kind === "purchase" ? buildPurchaseReconText(d) : buildBalanceReconText(d));
      } catch {
        if (alive) setError("Mutabakat bilgisi alınamadı. Bağlantıyı kontrol edip tekrar deneyin.");
      }
    })();
    return () => {
      alive = false;
    };
    // source nesnesi her render'da yeni olabilir; kimlik değişince yeniden yükle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.type, sourceKey]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Pano izni yoksa kullanıcı metni kutudan elle kopyalayabilir.
    }
  }

  return (
    <div className="space-y-4">
      {savedNote && (
        <p className="rounded-lg border border-credit/20 bg-credit-soft px-3 py-2.5 text-sm font-medium text-credit">
          ✓ {savedNote}
        </p>
      )}

      {error ? (
        <p className="rounded-lg border border-debt/20 bg-debt-soft px-3 py-2.5 text-sm text-debt">
          {error}
        </p>
      ) : !data ? (
        <div className="space-y-2" aria-busy>
          <div className="h-14 animate-pulse rounded-lg bg-line/70" />
          <div className="h-48 animate-pulse rounded-lg bg-line/70" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.kind === "purchase" ? (
              <>
                <Figure label="Önceki bakiye" value={balanceText(data.balanceBefore)} />
                <Figure label="Bu alış" value={`+${formatKurus(data.total)}`} />
                <Figure label="Toplam borç" value={balanceText(data.balanceAfter)} strong />
              </>
            ) : (
              <Figure label="Güncel borç" value={balanceText(data.balanceNow)} strong />
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            Gönderilecek mesaj · istersen düzenle
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(18, text.split("\n").length + 1)}
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[12.5px] normal-case leading-relaxed tracking-normal text-ink outline-none transition focus:border-ember focus:ring-2 focus:ring-ember/15"
            />
          </label>

          {!waPhone(data.supplierPhone) && (
            <p className="text-xs text-muted">
              {data.supplierName} için telefon kayıtlı değil — WhatsApp açılınca kişiyi sen
              seçersin. Toptancılar sayfasından telefon eklersen doğrudan onun sohbeti açılır.
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
            <WhatsAppButton
              phone={data.supplierPhone}
              text={text}
              disabled={!text.trim()}
              label="WhatsApp ile mutabakat gönder"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 sm:py-2"
            >
              {copied ? "Kopyalandı ✓" : "Metni kopyala"}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink sm:ml-auto sm:py-2"
              >
                Kapat
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Bağımsız mutabakat penceresi (alış kaydından sonra / toptancı sayfasından). */
export function ReconciliationDialog({
  source,
  supplierName,
  savedNote,
  onClose,
}: {
  source: ReconSource;
  supplierName?: string;
  savedNote?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Mutabakat gönder"
      subtitle={supplierName}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <ReconciliationPanel source={source} savedNote={savedNote} onClose={onClose} />
    </Modal>
  );
}

/** Toptancı sayfası başlığındaki "Mutabakat" düğmesi (genel bakiye mutabakatı). */
export function BalanceReconButton({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card transition-colors hover:bg-surface-2"
      >
        Mutabakat gönder
      </button>
      {open && (
        <ReconciliationDialog
          source={{ type: "balance", supplierId }}
          supplierName={supplierName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
