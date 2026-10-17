"use client";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

function keyBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
}
function usesKey(subscription: PushSubscription, key: string) {
  const actual = subscription.options.applicationServerKey;
  const expected = keyBytes(key);
  return (
    !!actual &&
    actual.byteLength === expected.byteLength &&
    new Uint8Array(actual).every((value, index) => value === expected[index])
  );
}
async function save(
  subscription: PushSubscription,
  action: "subscribe" | "unsubscribe",
) {
  const json = subscription.toJSON();
  const response = await deliveryFetch("/api/delivery/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "subscribe"
        ? { action, endpoint: subscription.endpoint, keys: json.keys }
        : { action, endpoint: subscription.endpoint },
    ),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not save alert settings.");
}
export function PushAlerts({
  publicKey,
  userId,
}: {
  publicKey: string | null;
  userId: string;
}) {
  const [supported, setSupported] = useState(true),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const possible =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    // Capability detection and subscription recovery do not request permission.
    (async () => {
      if (!possible) {
        if (active) setSupported(false);
        return;
      }
      const registration = await navigator.serviceWorker.register(
        "/rider/sw.js",
        { scope: "/rider/", updateViaCache: "none" },
      );
      const sub = await registration.pushManager.getSubscription();
      const owner = localStorage.getItem("igo-rider-push-owner");
      if (sub && owner === userId && publicKey && usesKey(sub, publicKey)) {
        await save(sub, "subscribe");
        if (active) setEnabled(true);
      }
    })().catch(() => {
      if (active)
        setMessage(
          "Open alert settings to reconnect background notifications.",
        );
    });
    return () => {
      active = false;
    };
  }, [publicKey, userId]);
  async function toggle() {
    if (busy || !publicKey || !supported) return;
    setBusy(true);
    setMessage("");
    try {
      // Permission is requested directly from this rider's button press.
      if (!enabled && (await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Allow notifications in your browser’s site settings, then try again.",
        );
      const registration = await navigator.serviceWorker.register(
        "/rider/sw.js",
        { scope: "/rider/", updateViaCache: "none" },
      );
      await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (enabled && sub) {
        await save(sub, "unsubscribe");
        await sub.unsubscribe();
        localStorage.removeItem("igo-rider-push-owner");
        setEnabled(false);
        setMessage("Alerts disabled on this browser.");
        return;
      }
      if (
        sub &&
        (localStorage.getItem("igo-rider-push-owner") !== userId ||
          !usesKey(sub, publicKey))
      ) {
        if (localStorage.getItem("igo-rider-push-owner") === userId)
          await save(sub, "unsubscribe");
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await save(sub, "subscribe");
      localStorage.setItem("igo-rider-push-owner", userId);
      setEnabled(true);
      setMessage("Assignment alerts enabled on this device.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not enable background alerts.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="r-alerts" aria-label="Assignment alerts">
      <div className="r-alert-icon">
        {enabled ? <BellRing size={19} /> : <Bell size={19} />}
      </div>
      <div>
        <strong>
          {enabled ? "You’re connected" : "Don’t miss your next collection"}
        </strong>
        <p>
          {!publicKey
            ? "Background alerts need server setup. Assignments remain available here."
            : !supported
              ? "On iPhone, add this site to your Home Screen and open it there (iOS 16.4+). Otherwise use a browser that supports web push."
              : "Get an alert when iGO assigns work, even when this page is closed."}
        </p>
        {message && <p role="status">{message}</p>}
      </div>
      {supported && publicKey && (
        <Button variant="outline" size="sm" disabled={busy} onClick={toggle}>
          {busy ? "Connecting…" : enabled ? "Disable alerts" : "Enable alerts"}
        </Button>
      )}
    </section>
  );
}
