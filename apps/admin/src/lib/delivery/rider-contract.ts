import { z } from "zod";

export const riderScreens = [
  "collections",
  "deliveries",
  "history",
  "available",
  "notifications",
] as const;
export type RiderScreen = (typeof riderScreens)[number];
export type RiderParcel = {
  id: string;
  publicId: string;
  externalReference: string;
  recipientName: string;
  recipientPhone: string;
  destination: string;
  zone: string;
  destinationLabel: string;
  description: string;
  fee: number;
  state: string;
  partnerId: string;
  registeredAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  partner: {
    businessName: string;
    pickupAddress: string;
    pickupArea: string;
    account: { name: string; phone: string };
  };
};
export type RiderNotice = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export type RiderList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type AvailableJob = {
  id: string;
  publicId: string;
  destination: string;
  zone: string;
  destinationLabel: string;
  registeredAt: string;
  partner: { businessName: string; pickupAddress: string; pickupArea: string };
};
export type RiderSnapshot = {
  work:
    RiderList<RiderParcel> | RiderList<RiderNotice> | RiderList<AvailableJob>;
  notices: RiderList<RiderNotice> & { unread: number };
  summary: {
    collections: number;
    onBoard: number;
    deliveredToday: number;
    available: number;
  };
  config: { mapsEmbedKey: string | null; pushPublicKey: string | null };
};

export function pickupAddress(
  parcel: Pick<RiderParcel, "partner"> | AvailableJob,
) {
  return `${parcel.partner.pickupAddress}, ${parcel.partner.pickupArea}, Maldives`;
}
export function dropoffAddress(
  parcel: Pick<RiderParcel, "destination" | "zone" | "destinationLabel">,
) {
  const island =
    parcel.zone === "BOAT"
      ? ""
      : (parcel.destinationLabel ??
        (
          {
            MALE: "Malé",
            HULHUMALE_1: "Hulhumalé Phase 1",
            HULHUMALE_2: "Hulhumalé Phase 2",
          } as Record<string, string>
        )[parcel.zone] ??
        "");
  return [parcel.destination, island, "Maldives"].filter(Boolean).join(", ");
}
export function googleDirections(destination: string, origin?: string) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", "driving");
  if (origin) url.searchParams.set("origin", origin);
  return url.href.length <= 2048 ? url.href : null;
}
export function googleRouteEmbed(key: string, parcel: RiderParcel) {
  const url = new URL(
    `https://www.google.com/maps/embed/v1/${parcel.zone === "BOAT" ? "place" : "directions"}`,
  );
  url.searchParams.set("key", key);
  if (parcel.zone === "BOAT") url.searchParams.set("q", dropoffAddress(parcel));
  else {
    url.searchParams.set("origin", pickupAddress(parcel));
    url.searchParams.set("destination", dropoffAddress(parcel));
    url.searchParams.set("mode", "driving");
  }
  return url.href.length <= 2048 ? url.href : null;
}

export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname !== "/" &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}
const endpoint = z
  .string()
  .max(2048)
  .refine(allowedPushEndpoint, "This browser's push service is not supported.");
export const pushSubscriptionInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("subscribe"),
      endpoint,
      keys: z
        .object({
          p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,1}$/),
          auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
        })
        .strict(),
    })
    .strict(),
  z.object({ action: z.literal("unsubscribe"), endpoint }).strict(),
]);
export function riderPushPayload(notice: { id: string; title: string }) {
  const assigned = notice.title === "Collection assigned";
  return {
    title: "iGO Delivery",
    body: assigned
      ? "New packages assigned. Open iGO to see your collection stops."
      : "You have an update in your rider workspace.",
    tag: `igo-${notice.id}`,
    url: assigned ? "/rider/collections" : "/rider/notifications",
  };
}
export function pushRetry(attempt: number, status?: number) {
  if (status === 404 || status === 410) return "expired" as const;
  if (
    attempt >= 5 ||
    (status !== undefined &&
      status >= 400 &&
      status < 500 &&
      ![408, 429].includes(status))
  )
    return "failed" as const;
  return Math.min(60, 2 ** Math.max(0, attempt - 1)) * 60000;
}
