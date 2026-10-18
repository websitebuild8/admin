import "server-only";
import { deliveryQuery } from "./queries";
import type { Actor } from "./domain";
import type { EarningsResult } from "./earnings-period";
import type { RiderSnapshot, RiderScreen } from "./rider-contract";
import { periodSelection, periodQuery } from "./reporting-period";
import {
  portalResource,
  portalInitialQuery,
  type PortalInitial,
  type ResourceSeed,
  type RiderInitial,
} from "./portal-initial";

// Flight supports Dates, but API consumers expect ISO strings. Keep one shape
// for streamed initial data, periodic refreshes and document timestamps.
const clientData = <T>(value: T): T => JSON.parse(JSON.stringify(value));
async function seed<T>(
  actor: Actor,
  resource: string,
  query: string,
): Promise<ResourceSeed<T> | undefined> {
  try {
    return {
      key: `${resource}?${query}`,
      data: clientData(
        await deliveryQuery(actor, resource, new URLSearchParams(query)),
      ) as T,
    };
  } catch (error) {
    console.error(
      "Initial delivery data unavailable",
      error instanceof Error ? error.name : "unknown",
    );
    // Preserve the existing client retry/error UI if an initial read fails.
    return undefined;
  }
}
export async function portalInitialData(
  actor: Actor,
  screen: string,
  search: URLSearchParams,
): Promise<PortalInitial> {
  let plan;
  try {
    plan = portalInitialQuery(screen, search);
  } catch {
    return {};
  }
  const resource = portalResource(screen);
  const earningsQuery = new URLSearchParams(plan.selection).toString();
  const [main, notices, earnings] = await Promise.all([
    resource ? seed(actor, resource, plan.query) : undefined,
    seed(actor, "notifications", "page=1"),
    actor.role === "ADMIN" && ["overview", "reports"].includes(screen)
      ? seed<EarningsResult>(actor, "earnings", earningsQuery)
      : undefined,
  ]);
  return {
    main,
    notices,
    earnings: earnings ? { ...earnings, key: earningsQuery } : undefined,
  };
}
export async function riderInitialData(
  actor: Actor,
  screen: RiderScreen,
  search: URLSearchParams,
): Promise<RiderInitial | undefined> {
  let period;
  try {
    period = periodQuery(periodSelection(search));
  } catch {
    return undefined;
  }
  const query = `${new URLSearchParams({ screen, page: "1", q: "" })}&${period}`;
  const initial = await seed<RiderSnapshot>(actor, "rider-workspace", query);
  return initial
    ? { key: `${screen}:${period}`, data: initial.data }
    : undefined;
}
