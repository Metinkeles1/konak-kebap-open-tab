import {
  PageHeaderSkeleton,
  FormSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Alışlar sayfası yükleme iskeleti (yeni alış formu + alış defteri).
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mb-6">
        <FormSkeleton fields={3} />
      </div>
      <CardSkeleton rows={6} />
    </>
  );
}
