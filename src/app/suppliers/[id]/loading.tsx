import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Toptancı detayı (cari ekstre) yükleme iskeleti.
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={3} />
      <div className="mt-6">
        <CardSkeleton rows={8} />
      </div>
    </>
  );
}
