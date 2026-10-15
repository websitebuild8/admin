import { DeliverySkeleton } from "@/components/delivery/skeleton";
export default function Loading() {
  return (
    <main className="d-loading-page">
      <DeliverySkeleton />
    </main>
  );
}
