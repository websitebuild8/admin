"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { money } from "@/lib/delivery/domain";
import type {
  DeletionKind,
  DeletionPreview,
} from "@/lib/delivery/deletion-contract";

export function DeleteDataButton({
  kind,
  id,
  label,
  changed,
}: {
  kind: DeletionKind;
  id: string;
  label: string;
  changed: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState<DeletionPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState("");
  const retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    deliveryFetch(`/api/delivery/deletion-preview?kind=${kind}&id=${id}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ?? "Could not load the deletion preview.",
          );
        if (!abort.signal.aborted) setPreview(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [open, kind, id]);
  async function remove() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      kind,
      id,
      fingerprint: preview.fingerprint,
      confirmation,
      reason,
    });
    if (retry.current?.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    try {
      const response = await deliveryFetch("/api/delivery/delete-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retry.current.key,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ??
            "Deletion could not be confirmed. Retry this same request.",
        );
      setOpen(false);
      toast.success(
        result.files.pending
          ? "Data deleted. Private file cleanup is queued; retry it under Settings & rates."
          : "Data and related cached responses deleted.",
      );
      window.dispatchEvent(new Event("igo:delivery-data-changed"));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("igo-delivery-data");
        channel.postMessage("refresh");
        channel.close();
      }
      changed();
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Retry the same deletion request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        className="d-delete-button"
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
        onClick={() => {
          setPreview(null);
          setError("");
          setConfirmation("");
          setReason("");
          retry.current = null;
          setOpen(true);
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="d-modal d-delete-modal">
          <DialogHeader>
            <DialogTitle>Permanently delete {kind.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              Super admin only. Review all linked records below. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {!preview && !error && <p role="status">Checking linked records…</p>}
          {preview && (
            <form
              className="d-form"
              onSubmit={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              <strong>{preview.label}</strong>
              <dl className="d-delete-counts">
                {preview.counts.map((v) => (
                  <div key={v.label}>
                    <dt>{v.label}</dt>
                    <dd>{v.count}</dd>
                  </div>
                ))}
              </dl>
              {preview.invoiceTotal > 0 && (
                <p className="d-error">
                  Invoices: {money(preview.invoiceTotal)} · Verified payments
                  being removed: {money(preview.verifiedPayments)}. Outstanding
                  balances and iGO earnings will be recalculated.
                </p>
              )}
              <ul className="d-delete-warnings">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <Label htmlFor={`delete-reason-${id}`}>Reason for deletion</Label>
              <Textarea
                id={`delete-reason-${id}`}
                value={reason}
                minLength={5}
                maxLength={500}
                required
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: removing test data before launch"
              />
              <Label htmlFor={`delete-confirm-${id}`}>
                Type <strong>{preview.label}</strong> to confirm
              </Label>
              <Input
                id={`delete-confirm-${id}`}
                value={confirmation}
                autoComplete="off"
                required
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              {error && (
                <p role="alert" className="d-error">
                  {error}
                </p>
              )}
              <div className="d-row-actions">
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Keep records
                </Button>
                <Button
                  type="submit"
                  className="d-delete-confirm"
                  disabled={
                    busy ||
                    confirmation !== preview.label ||
                    reason.trim().length < 5
                  }
                >
                  <Trash2 size={16} />{" "}
                  {busy ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </form>
          )}
          {!preview && error && (
            <p role="alert" className="d-error">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeletionFileCleanup({ revision }: { revision: number }) {
  const [pending, setPending] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    deliveryFetch("/api/delivery/deletion-cleanup", {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        if (!abort.signal.aborted) setPending(result.pending);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Could not check deleted-file cleanup.");
      });
    return () => abort.abort();
  }, [revision]);
  async function retryCleanup() {
    setBusy(true);
    setError("");
    try {
      const response = await deliveryFetch("/api/delivery/deletion-cleanup", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPending(result.pending);
      if (result.pending)
        setError(
          "Some files are still queued. Check Supabase server storage settings and retry.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="d-card d-card-pad">
      <h2>Deleted private files</h2>
      <p>
        {pending === null
          ? "Checking cleanup…"
          : `${pending} private file${pending === 1 ? "" : "s"} awaiting removal from Supabase Storage.`}{" "}
        Database records are removed immediately; failed file removals stay
        queued for retry.
      </p>
      {error && (
        <p className="d-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="outline" disabled={busy} onClick={retryCleanup}>
        <RefreshCw size={15} />
        {busy ? "Retrying…" : "Retry file cleanup"}
      </Button>
    </section>
  );
}
