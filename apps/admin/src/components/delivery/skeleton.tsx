import { Skeleton } from "@/components/ui/skeleton";
export function DeliverySkeleton() {
  return (
    <div
      className="d-loading"
      role="status"
      aria-label="Loading delivery workspace"
    >
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-4 h-10 w-64 max-w-full" />
      <div className="d-stats">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
      <span className="sr-only">Loading your records…</span>
    </div>
  );
}
