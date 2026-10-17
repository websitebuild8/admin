import { database } from "@/lib/db";
import {
  money,
  operatingLocationLabels,
  operatingLocations,
} from "@/lib/delivery/domain";
export async function PublicRates() {
  const rates = await (async () =>
    database().deliveryRate.findMany({
      where: {
        zone: { in: ["MALE", "HULHUMALE_1", "HULHUMALE_2", "BOAT"] },
        destination: { active: true },
      },
      include: { destination: true },
      orderBy: { zone: "asc" },
    }))().catch(() => null);
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
        <article key={origin} data-reveal>
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
