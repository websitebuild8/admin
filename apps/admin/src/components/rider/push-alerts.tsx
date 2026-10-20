"use client";
import { waitForPushWorker, pushOwnerKey } from "@/lib/delivery/browser-push";
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
async function alertRegistration(base: string) {
  const registration = await navigator.serviceWorker.register(`${base}/sw.js`, {
    scope: `${base}/`,
    updateViaCache: "none",
  });
  return waitForPushWorker(registration);
}
export function PushAlerts({
  publicKey,
  userId,
  workspace = "DRIVER",
}: {
  publicKey: string | null;
  userId: string;
  workspace?: "PARTNER" | "DRIVER";
}) {
  const base = workspace === "PARTNER" ? "/partner" : "/rider";
  const ownerKey = pushOwnerKey(workspace);
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
      if (!publicKey) return;
      const registration = await alertRegistration(base);
      const sub = await registration.pushManager.getSubscription();
      const owner = localStorage.getItem(ownerKey);
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
  }, [publicKey, userId, base, ownerKey]);
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
      const registration = await alertRegistration(base);
      let sub = await registration.pushManager.getSubscription();
      if (enabled && sub) {
        await save(sub, "unsubscribe");
        await sub.unsubscribe();
        localStorage.removeItem(ownerKey);
        setEnabled(false);
        setMessage("Alerts disabled on this browser.");
        return;
      }
      if (
        sub &&
        (localStorage.getItem(ownerKey) !== userId || !usesKey(sub, publicKey))
      ) {
        if (localStorage.getItem(ownerKey) === userId)
          await save(sub, "unsubscribe");
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await save(sub, "subscribe");
      localStorage.setItem(ownerKey, userId);
      setEnabled(true);
      setMessage("Browser alerts enabled on this device.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not enable background alerts.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="r-alerts" aria-label="Browser alerts">
      <div className="r-alert-icon">
        {enabled ? <BellRing size={19} /> : <Bell size={19} />}
      </div>
      <div>
        <strong>{enabled ? "Browser alerts on" : "Browser alerts"}</strong>
        {(!publicKey || !supported) && (
          <p role="status">
            {!publicKey
              ? "Browser alerts need server configuration."
              : "On iPhone, add this site to your Home Screen, open it there, then enable alerts. Other devices need a browser that supports notifications."}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {enabled && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const r = await deliveryFetch("/api/delivery/commands", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": crypto.randomUUID(),
                },
                body: JSON.stringify({ type: "testPush" }),
              });
              const v = await r.json();
              if (!r.ok) throw new Error(v.error);
              setMessage(v.message);
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Could not send the test alert.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Test alert
        </Button>
      )}
      {supported && publicKey && (
        <Button variant="outline" size="sm" disabled={busy} onClick={toggle}>
          {busy ? "Connecting…" : enabled ? "Disable alerts" : "Enable alerts"}
        </Button>
      )}
    </section>
  );
}
