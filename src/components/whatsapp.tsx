// WhatsApp mesajları — sipariş (klasik form + sayım modu) ve cari mutabakat.
// Mesaj biçimleri tek yerde; her ekran aynı metni üretir.
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { PurchaseReconciliation, BalanceReconciliation } from "@/lib/reconciliation";

export type OrderLine = {
  quantity: number;
  unit: string;
  name: string;
  price: number | null; // kuruş; tahminî (toptancının son fiyatı) — "~" ile yazılır
};

export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("tr-TR"));

// Telefonu WhatsApp (wa.me) için uluslararası biçime indirger: yalnız rakam,
// başına 90. "0532…" → "90532…", "532…" (10 hane) → "90532…".
export function waPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) return "90" + d.slice(1);
  if (d.length === 10) return "90" + d;
  return d;
}

// Ürünler satır satır, en altta KDV ve toplam; toptancı adı sadece en altta.
export function buildOrderText({
  lines,
  supplierName,
  vatRate,
  vatAmount,
  total,
}: {
  lines: OrderLine[];
  supplierName: string;
  vatRate: number;
  vatAmount: number;
  total: number;
}): string {
  const out: string[] = ["Merhaba, Konak Kebap sipariş:", ""];
  for (const l of lines) {
    const priceTxt = l.price != null && l.price > 0 ? ` (~${formatKurus(l.price)})` : "";
    out.push(`• ${fmtQty(l.quantity)} ${l.unit} ${l.name}${priceTxt}`);
  }
  out.push("");
  if (vatAmount > 0) out.push(`KDV %${vatRate}: ${formatKurus(vatAmount)}`);
  out.push(`Toplam: ${formatKurus(total)}`);
  out.push("", `— ${supplierName}`);
  return out.join("\n");
}

// Bakiye metni: + borç, − alacak (toptancıya fazla ödenmiş).
function fmtBalance(k: number): string {
  return k < 0 ? `${formatKurus(-k)} (alacağımız)` : formatKurus(k);
}

function balanceLine(k: number): string {
  if (k > 0) return `*Toplam borcumuz: ${formatKurus(k)}*`;
  if (k < 0) return `*Alacağımız: ${formatKurus(-k)}*`;
  return "*Hesabımız kapalı: ₺0,00*";
}

const RECON_CLOSING =
  "Kayıtlarınızla uyuşuyorsa onaylar mısınız? Fark varsa lütfen yazın, birlikte düzeltelim. 🙏";

// Alış sonrası mutabakat: kalemlerin maliyeti + önceki bakiye → güncel borç.
export function buildPurchaseReconText(r: PurchaseReconciliation): string {
  const out: string[] = ["Merhaba, Konak Kebap — cari mutabakat", ""];
  out.push(`*Alış: ${formatDate(r.date)}*${r.documentNo ? ` · ${r.documentNo}` : ""}`);
  for (const i of r.items) {
    out.push(
      `• ${fmtQty(i.quantity)} ${i.unit} ${i.name} × ${formatKurus(i.unitPrice)} = ${formatKurus(i.lineTotal)}`,
    );
  }
  out.push("");
  if (r.vatAmount > 0) {
    out.push(`Ara toplam: ${formatKurus(r.subtotal)}`);
    out.push(`KDV %${r.vatRate}: ${formatKurus(r.vatAmount)}`);
  }
  out.push(`*Alış toplamı: ${formatKurus(r.total)}*`);
  out.push("");
  out.push(`Önceki bakiye: ${fmtBalance(r.balanceBefore)}`);
  out.push(`Bu alış: +${formatKurus(r.total)}`);
  out.push(balanceLine(r.balanceAfter));
  // Bu alıştan sonra başka alış/ödeme girildiyse bugünkü durumu da ayrıca yaz.
  if (r.balanceNow !== r.balanceAfter) {
    out.push(`(Sonraki hareketlerle bugünkü bakiye: ${fmtBalance(r.balanceNow)})`);
  }
  out.push("", RECON_CLOSING);
  return out.join("\n");
}

// Genel bakiye mutabakatı: son hareketler + bugünkü bakiye.
export function buildBalanceReconText(r: BalanceReconciliation): string {
  const out: string[] = ["Merhaba, Konak Kebap — cari mutabakat", ""];
  if (r.recent.length) {
    out.push("Son hareketler:");
    for (const t of r.recent) {
      const amt = t.amount < 0 ? `−${formatKurus(-t.amount)}` : formatKurus(t.amount);
      out.push(`• ${formatDate(t.date)} ${t.label}${t.documentNo ? ` ${t.documentNo}` : ""}: ${amt}`);
    }
    out.push("");
  }
  out.push(`${balanceLine(r.balanceNow)} (${formatDate(r.asOf)} itibarıyla)`);
  out.push("", RECON_CLOSING);
  return out.join("\n");
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.044zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

// Toptancının telefonu varsa doğrudan onun sohbetini, yoksa WhatsApp'ı açar
// (kişiyi kullanıcı seçer). Kalem yokken pasif durur.
export function WhatsAppButton({
  phone,
  text,
  disabled,
  className = "",
  label = "WhatsApp ile sipariş",
}: {
  phone: string | null | undefined;
  text: string;
  disabled: boolean;
  className?: string;
  label?: string;
}) {
  const base = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors sm:py-2 ${className}`;
  if (disabled) {
    return (
      <button type="button" disabled title="Önce adet girin" className={`${base} cursor-not-allowed bg-[#25D366]/50`}>
        <WaIcon />
        {label}
      </button>
    );
  }
  const num = waPhone(phone);
  const href = `${num ? `https://wa.me/${num}` : "https://wa.me/"}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={
        num
          ? "WhatsApp'tan toptancıya gönder"
          : "Bu toptancıda telefon yok — WhatsApp açılır, kişiyi sen seçersin"
      }
      className={`${base} bg-[#25D366] hover:bg-[#1ebe5d]`}
    >
      <WaIcon />
      {label}
    </a>
  );
}
