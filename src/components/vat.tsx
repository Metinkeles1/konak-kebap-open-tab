// Ürün bazlı KDV için ortak arayüz parçaları: oran seçici + toplam dökümü.
// Klasik alış, sayım modu ve alış düzenleme aynı görünümü kullanır.
import { formatKurus } from "@/lib/money";
import { vatOptions, type VatLine } from "@/lib/vat";

/** KDV oranı seçici (%0, %1, %10, %20 + kayıtlı farklı bir oran varsa o). */
export function VatSelect({
  value,
  onChange,
  className = "",
  label = "KDV oranı",
  size = "md",
}: {
  value: number;
  onChange: (rate: number) => void;
  className?: string;
  label?: string;
  /** sm: sayım satırı gibi dar yerler için kompakt (yine 16px — iOS yakınlaştırmaz). */
  size?: "md" | "sm";
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      title="KDV oranı — ürüne kaydedilir, sonraki alışlarda bu oran gelir"
      className={`nums rounded-lg border bg-surface text-base outline-none ${
        size === "sm" ? "px-1.5 py-1" : "px-2 py-2"
      } transition focus:border-ember focus:ring-2 focus:ring-ember/15 sm:text-sm ${
        value > 0 ? "border-ember/40 text-ink" : "border-line text-muted"
      } ${className}`}
    >
      {vatOptions(value).map((r) => (
        <option key={r} value={r}>
          {r === 0 ? "KDV yok" : `KDV %${r}`}
        </option>
      ))}
    </select>
  );
}

/** Ara toplam + orana göre KDV satırları + genel toplam. */
export function VatSummary({
  subtotal,
  vatLines,
  total,
  className = "",
}: {
  subtotal: number;
  vatLines: VatLine[];
  total: number;
  className?: string;
}) {
  return (
    <div className={`text-sm ${className}`}>
      {vatLines.length > 0 && (
        <div className="space-y-0.5 text-[12px] text-muted">
          <div>
            Ara toplam <span className="nums ml-1 text-ink-soft">{formatKurus(subtotal)}</span>
          </div>
          {vatLines.map((v) => (
            <div key={v.rate}>
              KDV %{v.rate}{" "}
              <span className="text-muted/70">
                ({formatKurus(v.base)} üzerinden)
              </span>{" "}
              <span className="nums ml-1 text-ink-soft">{formatKurus(v.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-0.5 text-muted">
        {vatLines.length > 0 ? "Genel toplam" : "Toplam"}{" "}
        <span className="nums ml-1 text-lg font-semibold text-ink">{formatKurus(total)}</span>
      </div>
    </div>
  );
}
