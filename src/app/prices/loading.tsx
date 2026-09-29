import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Fiyat Takibi yükleme iskeleti (özet kartları + toptancı özeti + kalem listesi).
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <StatGridSkeleton />
      <CardSkeleton rows={3} className="mt-6" />
      <CardSkeleton rows={6} className="mt-6" />
    </>
  );
}
