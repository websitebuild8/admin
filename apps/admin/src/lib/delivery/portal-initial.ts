import {
  allTime,
  datedScreens,
  periodQuery,
  periodSelection,
} from "./reporting-period";
import { invoiceFilter, packageFilter } from "./dashboard-filters";
import type { EarningsResult } from "./earnings-period";
import type { RiderSnapshot } from "./rider-contract";

export type ResourceSeed<T = unknown> = { key: string; data: T };
export type PortalInitial = {
  main?: ResourceSeed;
  notices?: ResourceSeed;
  earnings?: ResourceSeed<EarningsResult>;
};
export type RiderInitial = ResourceSeed<RiderSnapshot>;
export function portalResource(screen: string) {
  if (["import", "administrators", "my-workspaces", "finance"].includes(screen))
    return null;
  return screen;
}
export function portalInitialQuery(screen: string, search: URLSearchParams) {
  const selection = datedScreens[screen] ? periodSelection(search) : allTime;
  const filter =
    screen === "packages"
      ? packageFilter(search.get("state"))
      : screen === "invoices"
        ? invoiceFilter(search.get("state"))
        : "";
  return {
    selection,
    query: `page=1&q=&state=${filter}&${periodQuery(selection)}`,
  };
}
export function pageSearch(
  values: Record<string, string | string[] | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined)
      search.set(key, Array.isArray(value) ? value[0] : value);
  return search;
}
