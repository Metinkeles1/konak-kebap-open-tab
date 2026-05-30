import {
  PageHeaderSkeleton,
  FormSkeleton,
  CardSkeleton,
} from "@/components/skeleton";

// Toptancılar sayfası yükleme iskeleti.
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton action={false} />
      <div className="mb-6">
        <FormSkeleton fields={4} />
      </div>
      <CardSkeleton rows={6} />
    </>
  );
}
