import { database } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { Skeleton } from "@/components/ui/skeleton";
import {
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
const rateNumber = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
});
const localLabels = {
  MALE: "Within Malé",
  HULHUMALE_1: "Within Phase 1",
  HULHUMALE_2: "Within Phase 2",
};
const destinationOrder = ["MALE", "HULHUMALE_1", "HULHUMALE_2", "BOAT"];
function RateAmount({ fee }: { fee: number }) {
  return (
    <dd className="d-rate-amount">
      <span className="d-rate-currency">MVR</span>{" "}
      <strong>{rateNumber.format(fee / 100)}</strong>
    </dd>
  );
}
export function PublicRatesSkeleton() {
  return (
    <div
      className="d-origin-rate-grid"
      role="status"
      aria-label="Loading delivery rates"
    >
      {[0, 1, 2].map((key) => (
        <article
          className="d-origin-rate-card d-rate-skeleton"
          key={key}
          aria-hidden="true"
        >
          <header className="d-rate-card-header">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-9 w-48 max-w-full" />
          </header>
          <div className="d-rate-local">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="mt-4 h-16 w-32" />
          </div>
          <div className="d-rate-destinations">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="my-5 h-5 w-full" />
            ))}
          </div>
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
      {operatingLocations.map((origin) => {
        const originRates = rates.filter((r) => r.origin === origin);
        const local = originRates.find((r) => r.zone === origin);
        const otherRates = originRates
          .filter((r) => r.zone !== origin)
          .sort(
            (a, b) =>
              destinationOrder.indexOf(a.zone) -
              destinationOrder.indexOf(b.zone),
          );
        return (
          <article
            className="d-origin-rate-card"
            key={origin}
            data-reveal
            aria-labelledby={`rate-${origin}`}
          >
            <header className="d-rate-card-header">
              <span className="d-eyebrow">OPERATING FROM</span>
              <h3 id={`rate-${origin}`}>
                {origin === "MALE" ? "Malé" : "Hulhumalé"}
                {origin !== "MALE" && (
                  <span className="d-rate-phase">
                    {origin === "HULHUMALE_1" ? "Phase 1" : "Phase 2"}
                  </span>
                )}
              </h3>
            </header>
            {local ? (
              <dl className="d-rate-local">
                <div>
                  <dt>{localLabels[origin]}</dt>
                  <RateAmount fee={local.fee} />
                </div>
              </dl>
            ) : (
              <p className="d-rate-local d-rate-unavailable">
                Local delivery rate unavailable.
              </p>
            )}
            <dl
              className="d-rate-destinations"
              aria-label={`Other delivery rates from ${operatingLocationLabels[origin]}`}
            >
              {otherRates.map((rate) => (
                <div key={rate.zone}>
                  <dt>To {rate.destination.label}</dt>
                  <RateAmount fee={rate.fee} />
                </div>
              ))}
              {!otherRates.length && (
                <div>
                  <dt>Other destinations</dt>
                  <dd>Contact us</dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
