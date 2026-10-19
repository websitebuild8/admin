"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { noticeId } from "@/lib/delivery/notification-contract";
import { money } from "@/lib/delivery/domain";
import {
  googleDirections,
  pickupAddress,
  dropoffAddress,
  type RiderParcel,
} from "@/lib/delivery/rider-contract";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Message = { title: string; message: string; createdAt: string };
export function NotificationNavigation() {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const open = noticeId(params.get("open")),
    messageId = noticeId(params.get("messageId")),
    packageId = noticeId(params.get("packageId"));
  const key = open
    ? `open:${open}`
    : packageId
      ? `package:${packageId}`
      : messageId
        ? `message:${messageId}`
        : "";
  const [state, setState] = useState<{
    key: string;
    data?: Message | RiderParcel;
    error?: string;
  }>();
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (!key) return;
    const c = new AbortController();
    (async () => {
      let response;
      if (open) {
        if (!requests.current.has(open))
          requests.current.set(open, crypto.randomUUID());
        response = await deliveryFetch("/api/delivery/commands", {
          method: "POST",
          signal: c.signal,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requests.current.get(open)!,
          },
          body: JSON.stringify({ type: "openNotice", id: open }),
        });
      } else
        response = await deliveryFetch(
          `/api/delivery/${packageId ? "package-detail" : "notification-detail"}?id=${packageId ?? messageId}`,
          { signal: c.signal, cache: "no-store" },
        );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not open this update.");
      if (c.signal.aborted) return;
      if (open) {
        // The destination is derived from an owned database record by the server.
        if (
          typeof data.href !== "string" ||
          !/^\/(delivery|partner|rider)\//.test(data.href)
        )
          throw new Error("This update is unavailable.");
        window.dispatchEvent(new Event("igo:delivery-data-changed"));
        router.replace(data.href, { scroll: false });
      } else setState({ key, data });
    })().catch((e) => {
      if (!c.signal.aborted) setState({ key, error: e.message });
    });
    return () => c.abort();
  }, [key, open, packageId, messageId, router]);
  function close() {
    const next = new URLSearchParams(params.toString());
    for (const k of ["open", "messageId", "packageId"]) next.delete(k);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  if (!key) return null;
  const current = state?.key === key ? state : undefined;
  const parcel = packageId
    ? (current?.data as RiderParcel | undefined)
    : undefined;
  const message = messageId
    ? (current?.data as Message | undefined)
    : undefined;
  const stamp = (v: string) =>
    new Date(v).toLocaleString("en-GB", { timeZone: "Indian/Maldives" });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="d-notification-dialog">
        <DialogHeader>
          <DialogTitle>
            {parcel?.publicId ??
              message?.title ??
              (packageId ? "Package details" : "Notification")}
          </DialogTitle>
          <DialogDescription>
            {parcel
              ? parcel.state.replaceAll("_", " ")
              : message
                ? `${stamp(message.createdAt)} MVT`
                : "iGO Delivery"}
          </DialogDescription>
        </DialogHeader>
        {current?.error ? (
          <p className="d-error" role="alert">
            {current.error}
          </p>
        ) : !current?.data ? (
          <p role="status">Opening…</p>
        ) : parcel ? (
          <div className="d-linked-package">
            <section>
              <h3>Pickup · {parcel.partner.businessName}</h3>
              <p>{pickupAddress(parcel)}</p>
              <Button
                variant="outline"
                render={
                  <a
                    href={googleDirections(pickupAddress(parcel)) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Directions to pickup
              </Button>
            </section>
            <section>
              <h3>Customer · {parcel.recipientName}</h3>
              <p>{parcel.recipientPhone}</p>
              <p>{dropoffAddress(parcel)}</p>
              <Button
                variant="outline"
                render={
                  <a
                    href={googleDirections(dropoffAddress(parcel)) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Directions to customer
              </Button>
            </section>
            {parcel.description && <p>{parcel.description}</p>}
            <dl>
              <dt>Delivery fee</dt>
              <dd>{money(parcel.fee)}</dd>
              <dt>Registered</dt>
              <dd>{stamp(parcel.registeredAt)} MVT</dd>
              {parcel.pickedUpAt && (
                <>
                  <dt>Picked up</dt>
                  <dd>{stamp(parcel.pickedUpAt)} MVT</dd>
                </>
              )}
              {parcel.deliveredAt && (
                <>
                  <dt>Delivered</dt>
                  <dd>{stamp(parcel.deliveredAt)} MVT</dd>
                </>
              )}
            </dl>
          </div>
        ) : message ? (
          <p className="d-message-body">{message.message}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
