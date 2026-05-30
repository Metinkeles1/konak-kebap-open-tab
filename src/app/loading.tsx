import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Panel (dashboard) yükleme iskeleti — sayfa düzenini taklit eder.
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <CardSkeleton rows={4} className="lg:col-span-3" />
        <CardSkeleton rows={4} className="lg:col-span-2" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={3} />
      </div>

      <div className="mt-6">
        <CardSkeleton rows={4} />
      </div>
    </>
  );
}
