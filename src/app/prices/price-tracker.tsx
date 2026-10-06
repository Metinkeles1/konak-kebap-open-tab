"use client";

import { useMemo, useState } from "react";
import { formatKurus } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  summarizeLine,
  SUSPECT_PCT,
  type LineSummary,
  type PriceLine,
} from "@/lib/price-tracking";
import { Card, Stat, EmptyState, inputClass } from "@/components/ui";
import { Sparkline, TrendDelta } from "@/components/charts";

const DAY = 24 * 60 * 60 * 1000;

const PERIODS = [
  { id: "30", label: "30 gün", days: 30 },
  { id: "90", label: "3 ay", days: 90 },
  { id: "180", label: "6 ay", days: 180 },
  { id: "365", label: "1 yıl", days: 365 },
  { id: "all", label: "Tümü", days: null },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

const DIRECTIONS = [
  { id: "up", label: "Zamlananlar" },
  { id: "down", label: "İndirimler" },
  { id: "all", label: "Tüm değişenler" },
] as const;
type Direction = (typeof DIRECTIONS)[number]["id"];

const SORTS = [
  { id: "pct", label: "Zam oranı" },
  { id: "extra", label: "Fazla ödenen" },
  { id: "recent", label: "En son değişen" },
  { id: "name", label: "Ürün adı" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

const NO_SUPPLIER = "-";
const lc = (s: string) => s.trim().toLocaleLowerCase("tr");
// İşaret ile tutar arasına kelime birleştirici (U+2060) → dar kartta satır bölünmez.
const fmtSignedKurus = (k: number) =>
  `${k > 0 ? "+" : k < 0 ? "−" : ""}⁠${formatKurus(Math.abs(k))}`;
const fmtPct = (pct: number) =>
  `${pct > 0 ? "+" : pct < 0 ? "−" : ""}%${Math.abs(pct).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

// Seçili düğme stili — dönem ve yön seçicilerinde ortak.
// Telefonda tam genişlik, eşit paylı düğmeler (başparmakla kolay); geniş ekranda içerik kadar.
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-lg border border-line bg-surface-2 p-1 sm:inline-flex sm:w-auto">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`flex-1 whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:py-1.5 ${
            value === o.id
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Fazla ödenen / indirim kazancı — işarete göre renkli.
function ExtraCost({ kurus }: { kurus: number }) {
  if (kurus === 0) return <span className="text-muted">—</span>;
  return (
    <span className={`nums font-medium ${kurus > 0 ? "text-debt" : "text-credit"}`}>
      {kurus > 0 ? "+" : "−"}
      {formatKurus(Math.abs(kurus))}
    </span>
  );
}

export function PriceTracker({ lines, now }: { lines: PriceLine[]; now: number }) {
  const [period, setPeriod] = useState<PeriodId>("180");
  const [direction, setDirection] = useState<Direction>("up");
  const [sort, setSort] = useState<SortId>("pct");
  const [supplier, setSupplier] = useState<string>("");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const days = PERIODS.find((p) => p.id === period)!.days;
  const since = days == null ? null : now - days * DAY;

  // Dönem değişince tüm hatlar yeniden özetlenir (istemcide, anında).
  const summaries = useMemo(
    () => lines.map((l) => summarizeLine(l, since)).filter((s): s is LineSummary => !!s),
    [lines, since],
  );
  const changed = useMemo(() => summaries.filter((s) => s.changes.length > 0), [summaries]);

  // Özet metrikler
  // Olası hatalı girişler (tek adımda ≥%60) toplamları bozmasın diye hariç tutulur;
  // listede "kontrol et" rozetiyle görünmeye devam eder.
  const stats = useMemo(() => {
    const reliable = changed.filter((s) => !s.suspect);
    const up = reliable.filter((s) => s.pct > 0);
    const down = reliable.filter((s) => s.pct < 0);
    // Alışlara yansıyan zam = aynı alışlar dönem başı fiyatlarıyla yapılsaydı
    // ne tutardı, ona göre fark (harcama ağırlıklı; fiyatı değişmeyenler de dahil).
    let spend = 0;
    let baseCost = 0;
    for (const s of summaries) {
      if (s.suspect) continue;
      spend += s.spend;
      baseCost += s.baseCost;
    }
    const top = up.reduce<LineSummary | null>((m, s) => (!m || s.pct > m.pct ? s : m), null);
    return {
      upCount: up.length,
      downCount: down.length,
      extra: spend - baseCost,
      weightedPct: baseCost > 0 ? ((spend - baseCost) / baseCost) * 100 : 0,
      hasBuys: baseCost > 0,
      top,
      suspectCount: changed.length - reliable.length,
    };
  }, [changed, summaries]);

  // Toptancı bazında zam özeti
  const bySupplier = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; up: number; down: number; pctSum: number; extra: number }
    >();
    for (const s of changed) {
      if (s.suspect || s.pct === 0) continue;
      const id = s.line.supplierId ?? NO_SUPPLIER;
      const cur = map.get(id) ?? {
        id,
        name: s.line.supplierName ?? "Toptancı belirtilmemiş",
        up: 0,
        down: 0,
        pctSum: 0,
        extra: 0,
      };
      if (s.pct > 0) cur.up++;
      if (s.pct < 0) cur.down++;
      cur.pctSum += s.pct;
      cur.extra += s.extraCost;
      map.set(id, cur);
    }
    return [...map.values()]
      .map((r) => ({ ...r, avgPct: r.pctSum / (r.up + r.down || 1) }))
      .sort((a, b) => b.extra - a.extra || b.avgPct - a.avgPct);
  }, [changed]);

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lines) {
      map.set(l.supplierId ?? NO_SUPPLIER, l.supplierName ?? "Toptancı belirtilmemiş");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
  }, [lines]);

  const rows = useMemo(() => {
    const needle = lc(q);
    const list = changed.filter((s) => {
      if (direction === "up" && s.pct <= 0) return false;
      if (direction === "down" && s.pct >= 0) return false;
      if (supplier && (s.line.supplierId ?? NO_SUPPLIER) !== supplier) return false;
      if (
        needle &&
        !lc(s.line.productName).includes(needle) &&
        !lc(s.line.packageName).includes(needle)
      )
        return false;
      return true;
    });
    const byName = (a: LineSummary, b: LineSummary) =>
      a.line.productName.localeCompare(b.line.productName, "tr") ||
      a.line.packageName.localeCompare(b.line.packageName, "tr");
    return list.sort((a, b) => {
      switch (sort) {
        case "pct":
          // İndirim görünümünde en büyük indirim üstte.
          return direction === "down" ? a.pct - b.pct : b.pct - a.pct;
        case "extra":
          return direction === "down" ? a.extraCost - b.extraCost : b.extraCost - a.extraCost;
        case "recent":
          return (b.lastChange ?? 0) - (a.lastChange ?? 0);
        default:
          return byName(a, b);
      }
    });
  }, [changed, direction, supplier, q, sort]);

  const periodLabel = days == null ? "tüm zamanlar" : `son ${PERIODS.find((p) => p.id === period)!.label}`;

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card">
        <EmptyState
          title="Henüz fiyat kaydı yok."
          hint="Alış girdikçe ya da ürün fiyatlarını güncelledikçe zamlar burada görünür."
          cta={{ href: "/purchases", label: "Alış gir" }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Dönem seçimi */}
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        <p className="text-xs text-muted">
          {since != null ? `${formatDate(since)} → bugün` : "İlk kayıttan bugüne"} · aynı
          toptancının aynı birim fiyatı karşılaştırılır
        </p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Zamlanan kalem"
          value={String(stats.upCount)}
          tone={stats.upCount > 0 ? "debt" : "ink"}
          hint={`${stats.downCount} indirim · ${periodLabel}`}
        />
        <Stat
          label="Alışlara yansıyan zam"
          value={stats.hasBuys ? fmtPct(stats.weightedPct) : "—"}
          tone={stats.weightedPct > 0 ? "debt" : stats.weightedPct < 0 ? "credit" : "ink"}
          hint={stats.hasBuys ? "Harcamaya göre ağırlıklı" : "Bu dönemde alış yok"}
        />
        <Stat
          label="Zam farkı"
          value={fmtSignedKurus(stats.extra)}
          tone={stats.extra > 0 ? "debt" : stats.extra < 0 ? "credit" : "ink"}
          hint="Eski fiyatla alsaydın ödeyeceğine göre"
        />
        <Stat
          label="En yüksek zam"
          value={stats.top ? fmtPct(stats.top.pct) : "—"}
          tone={stats.top ? "ember" : "ink"}
          hint={
            stats.top ? (
              <span className="block truncate">
                {stats.top.line.productName} · {stats.top.line.packageName}
              </span>
            ) : (
              "Zam yok"
            )
          }
        />
      </div>

      {/* Şüpheli giriş uyarısı — telefonda yer kaplamasın diye tek satır özet;
          ayrıntı dokununca açılır. */}
      {stats.suspectCount > 0 && (
        <details className="group mt-4 rounded-lg border border-ember/25 bg-ember-soft/60 px-4 py-2.5 text-xs text-ink-soft">
          <summary className="cursor-pointer list-none">
            <span className="font-semibold text-ember">⚠ {stats.suspectCount} kalem kontrol edilmeli</span>
            <span className="text-muted"> — toplamlara katılmadı </span>
            <span className="text-ember underline-offset-2 group-open:hidden">ayrıntı</span>
          </summary>
          <p className="mt-1.5">
            Fiyat tek seferde %{SUSPECT_PCT}&apos;tan fazla değişmiş — büyük olasılıkla yanlış girilmiş (ör.
            koli yerine adet fiyatı). Listede <span className="font-medium">“kontrol et”</span> ile
            işaretli. Fiyatı Ürünler sayfasından düzeltebilirsin.
          </p>
        </details>
      )}

      {/* Toptancı bazında */}
      {/* Toptancı bazında — dokununca listeyi o toptancıya filtreler.
          Telefonda yatay kaydırılan kompakt kartlar (eskiden toptancı başına ~100px'lik
          satırlar listeyi ekranın çok altına itiyordu); geniş ekranda satır listesi. */}
      {bySupplier.length > 0 && (
        <Card title="Toptancı bazında · seçince liste filtrelenir" className="mt-6" bodyClassName="p-0">
          <ul className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain p-3 md:block md:divide-y md:divide-line md:overflow-visible md:p-0">
            {bySupplier.map((r) => {
              const active = supplier === r.id;
              return (
                <li key={r.id} className="w-44 shrink-0 snap-start md:w-auto">
                  <button
                    type="button"
                    onClick={() => setSupplier(active ? "" : r.id)}
                    aria-pressed={active}
                    className={`flex h-full w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 md:flex-row md:items-center md:justify-between md:gap-4 md:rounded-none md:border-0 md:px-5 md:py-3 ${
                      active ? "border-ember/50 bg-ember-soft/60" : "border-line"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      <span className="text-xs text-muted">
                        {r.up} zam{r.down > 0 ? ` · ${r.down} indirim` : ""}
                        {active ? " · filtre açık" : ""}
                      </span>
                    </span>
                    <span className="flex items-end justify-between gap-3 text-sm md:items-center md:gap-4">
                      <span className="md:text-right">
                        <span className="block text-[10px] uppercase tracking-wider text-muted">Ort.</span>
                        <TrendDelta pct={r.avgPct} />
                      </span>
                      <span className="text-right md:w-28">
                        <span className="block text-[10px] uppercase tracking-wider text-muted">Fazla ödenen</span>
                        <ExtraCost kurus={r.extra} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Kalem listesi */}
      <section className="mt-6 rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
            <div className="relative col-span-2 sm:w-56">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                ⌕
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ürün ara…"
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className={`${inputClass} min-w-0 truncate sm:w-44`}
              aria-label="Toptancı"
            >
              <option value="">Tüm toptancılar</option>
              {supplierOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className={`${inputClass} min-w-0 truncate sm:w-40`}
              aria-label="Sıralama"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  ↕ {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            {changed.length === 0
              ? `Bu dönemde (${periodLabel}) fiyatı değişen kalem yok.`
              : "Bu filtreye uyan kalem yok."}
          </p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_190px_80px_120px] gap-4 border-b border-line px-5 py-2.5 text-[11px] uppercase tracking-wider text-muted md:grid">
              <span>Ürün · toptancı</span>
              <span>Seyir</span>
              <span className="text-right">Dönem başı → güncel</span>
              <span className="text-right">Değişim</span>
              <span className="text-right">Fazla ödenen</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((s) => (
                <PriceRow
                  key={s.line.key}
                  s={s}
                  open={openKey === s.line.key}
                  onToggle={() => setOpenKey(openKey === s.line.key ? null : s.line.key)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function PriceRow({
  s,
  open,
  onToggle,
}: {
  s: LineSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const { line } = s;
  return (
    <li className="cv-row">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 md:gap-x-4 md:px-5 md:grid-cols-[minmax(0,1fr)_120px_190px_80px_120px] ${
          open ? "bg-surface-2" : ""
        }`}
      >
        <span className="col-start-1 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
          <span className="block text-sm font-medium text-ink group-hover:text-ember md:truncate">
            {line.productName} <span className="font-normal text-muted">· {line.packageName}</span>
            {s.suspect && (
              <span
                title="Fiyat tek seferde çok büyük değişmiş; yanlış giriş olabilir. Toplamlara katılmadı."
                className="ml-2 inline-block whitespace-nowrap rounded-full border border-ember/25 bg-ember-soft px-1.5 py-px align-middle text-[10px] font-medium text-ember"
              >
                ⚠ kontrol et
              </span>
            )}
          </span>
          <span className="block text-xs text-muted md:truncate">
            {line.supplierName ?? "Toptancı belirtilmemiş"} ·{" "}
            <span className="nums">{s.changes.length}</span> değişim · son{" "}
            <span className="nums">{s.lastChange ? formatDate(s.lastChange) : "—"}</span>
          </span>
        </span>

        <span className="hidden md:block">
          <Sparkline points={s.series} tone={s.pct > 0 ? "debt" : "credit"} width={110} height={30} />
        </span>

        <span className="nums col-start-1 row-start-2 text-sm text-muted md:col-start-auto md:row-start-auto md:text-right">
          {formatKurus(s.basePrice)} →{" "}
          <span className="font-medium text-ink">{formatKurus(s.currentPrice)}</span>
        </span>

        <span className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto">
          <TrendDelta pct={s.pct} />
          <span
            className={`nums block text-[11px] ${s.diff > 0 ? "text-debt" : s.diff < 0 ? "text-credit" : "text-muted"}`}
          >
            {s.diff > 0 ? "+" : s.diff < 0 ? "−" : ""}
            {formatKurus(Math.abs(s.diff))}
          </span>
        </span>

        <span className="col-start-2 row-start-2 text-right text-sm md:col-start-auto md:row-start-auto">
          <span className="mr-1 text-[11px] text-muted md:hidden">Fazla ödenen:</span>
          <ExtraCost kurus={s.extraCost} />
        </span>
      </button>

      {open && (
        <div className="border-t border-line bg-surface-2/60 px-4 py-4 md:px-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
            Fiyat değişimleri
          </p>
          <ol className="space-y-1.5">
            {[...s.changes].reverse().map((c, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-sm"
              >
                <span className="text-muted">
                  <span className="nums">{formatDate(c.t)}</span>
                  <span className="ml-2 rounded-full border border-line bg-surface px-1.5 py-px text-[10px]">
                    {c.source === "PURCHASE" ? "alış" : "elle"}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="nums text-muted">
                    {formatKurus(c.from)} →{" "}
                    <span className="font-medium text-ink">{formatKurus(c.to)}</span>
                  </span>
                  <span className="w-16 text-right">
                    <TrendDelta pct={c.pct} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
            {s.spend > 0 ? (
              <>
                Bu dönemde bu kalemden <span className="nums font-medium text-ink">{formatKurus(s.spend)}</span>{" "}
                alış yapıldı; dönem başı fiyatıyla <span className="nums">{formatKurus(s.baseCost)}</span>{" "}
                tutardı.
              </>
            ) : (
              "Bu dönemde bu kalemden alış yapılmadı (yalnızca fiyat güncellendi)."
            )}
          </p>
        </div>
      )}
    </li>
  );
}
