"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deliveryFetch } from "@/lib/delivery/fetch";

export function ClearNotifications({
  total,
  onCleared,
}: {
  total: number;
  onCleared: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false),
    key = useRef<string | null>(null);

  async function clear() {
    if (locked.current || !total) return;
    locked.current = true;
    setBusy(true);
    key.current ??= crypto.randomUUID();
    try {
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify({ type: "clearNotices" }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Could not clear notifications. Please retry.",
        );
      key.current = null;
      onCleared();
      window.dispatchEvent(new Event("igo:delivery-data-changed"));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("igo-delivery-data");
        channel.postMessage("refresh");
        channel.close();
      }
      router.refresh();
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Check your connection and retry.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={() => void clear()}
      disabled={busy || !total}
      aria-busy={busy}
      title="Permanently clear all notifications in this workspace"
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <CheckCheck size={16} />
      )}
      {busy ? "Clearing…" : "Mark all read & clear"}
    </Button>
  );
}
