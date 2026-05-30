// Yükleme iskeletleri — route loading.tsx dosyalarında kullanılır.
// Sunucu bileşeni (etkileşim yok); sayfa düzenine benzeyen "shimmer" bloklar.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} aria-hidden />;
}

/* Sayfa başlığı + aksiyon iskeleti */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      {action && <Skeleton className="h-9 w-28 rounded-lg" />}
    </div>
  );
}

/* KPI istatistik kartı iskeleti */
export function StatSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-7 w-28" />
      <Skeleton className="mt-2.5 h-3 w-16" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatSkeleton key={i} />
      ))}
    </div>
  );
}

const ROW_WIDTHS = ["w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-4/5", "w-3/5"];

/* Başlıklı kart + satır iskeletleri */
export function CardSkeleton({
  rows = 4,
  title = true,
  className = "",
}: {
  rows?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      {title && (
        <div className="border-b border-line px-5 py-3.5">
          <Skeleton className="h-3.5 w-32" />
        </div>
      )}
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${ROW_WIDTHS[i % ROW_WIDTHS.length]}`} />
        ))}
      </div>
    </div>
  );
}

/* Form satırı (alanlar yan yana) iskeleti */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <Skeleton className="mb-4 h-3.5 w-24" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: fields }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
