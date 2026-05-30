import { formatKurus } from "@/lib/money";

/* Yatay sıralı çubuk listesi — örn. en çok harcanan ürünler */
export function BarList({
  items,
  emptyText = "Veri yok",
}: {
  items: { label: string; value: number; sub?: string }[];
  emptyText?: string;
}) {
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-ink">{item.label}</span>
            <span className="nums shrink-0 font-medium text-ink-soft">
              {formatKurus(item.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-ember"
                style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
              />
            </div>
            {item.sub && (
              <span className="nums w-16 shrink-0 text-right text-xs text-muted">
                {item.sub}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Küçük çizgi grafiği (fiyat trendi) */
export function Sparkline({
  points,
  width = 120,
  height = 36,
  tone = "ember",
}: {
  points: number[];
  width?: number;
  height?: number;
  tone?: "ember" | "debt" | "credit";
}) {
  const stroke =
    tone === "debt"
      ? "var(--color-debt)"
      : tone === "credit"
        ? "var(--color-credit)"
        : "var(--color-ember)";

  if (points.length < 2) {
    return (
      <svg width={width} height={height} className="overflow-visible">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-line-strong)"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 3;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = pad + (1 - (p - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  const last = coords[coords.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={area} fill={stroke} opacity={0.08} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

/* Yüzde değişim göstergesi (artış kırmızı = maliyet arttı) */
export function TrendDelta({ pct }: { pct: number }) {
  if (!isFinite(pct) || pct === 0) {
    return <span className="text-xs text-muted">—</span>;
  }
  const up = pct > 0;
  return (
    <span
      className={`nums inline-flex items-center gap-0.5 text-xs font-semibold ${
        up ? "text-debt" : "text-credit"
      }`}
    >
      {up ? "▲" : "▼"} %{Math.abs(pct).toFixed(1)}
    </span>
  );
}
