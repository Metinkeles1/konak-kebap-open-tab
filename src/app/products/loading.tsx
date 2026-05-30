import {
  PageHeaderSkeleton,
  FormSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Ürünler sayfası yükleme iskeleti.
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mb-6">
        <FormSkeleton fields={5} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={3} />
        <CardSkeleton rows={2} />
        <CardSkeleton rows={2} />
      </div>
    </>
  );
}
