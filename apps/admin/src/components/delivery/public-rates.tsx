import { database } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { Skeleton } from "@/components/ui/skeleton";
import {
  money,
  operatingLocationLabels,
  operatingLocations,
} from "@/lib/delivery/domain";
const publicRates = unstable_cache(
  () =>
    database().deliveryRate.findMany({
      where: {
        zone: { in: ["MALE", "HULHUMALE_1", "HULHUMALE_2", "BOAT"] },
        destination: { active: true },
      },
      select: {
        origin: true,
        zone: true,
        fee: true,
        destination: { select: { label: true } },
      },
      orderBy: { zone: "asc" },
    }),
  ["delivery-public-rates-v1"],
  { revalidate: 60, tags: ["delivery-public-rates"] },
);
export function PublicRatesSkeleton() {
  return (
    <div
      className="d-origin-rate-grid"
      role="status"
      aria-label="Loading delivery rates"
    >
      {[0, 1, 2].map((key) => (
        <article key={key}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-4 h-8 w-36" />
          <Skeleton className="mt-6 h-40 w-full" />
        </article>
      ))}
    </div>
  );
}
export async function PublicRates() {
  // Only public rate labels/prices are shared; auth and financial data stay live.
  const rates = await publicRates().catch(() => null);
  if (!rates)
    return (
      <div className="d-note">
        Delivery rates are temporarily unavailable. Please contact iGO for a
        quote.
      </div>
    );

  return (
    <div className="d-origin-rate-grid">
      {operatingLocations.map((origin) => (
        <article key={origin}>
          <span className="d-eyebrow">OPERATING FROM</span>
          <h3>{operatingLocationLabels[origin]}</h3>
          <dl>
            {rates
              .filter((r) => r.origin === origin)
              .map((r) => (
                <div key={r.zone}>
                  <dt>{r.destination.label}</dt>
                  <dd>{money(r.fee)}</dd>
                </div>
              ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
