"use client";
import { useSearchParams } from "next/navigation";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { operatingLocationLabels } from "@/lib/delivery/domain";
import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type PartnerApplicationRecord = {
  id: string;
  publicId: string;
  businessName: string;
  businessType: string;
  ownerName: string;
  email: string;
  phone: string;
  pageUrl: string;
  pickupAddress: string;
  pickupArea: string;
  operatingLocation: string | null;
  logoReady: boolean;
  dailyDeliveries: number;
  status: string;
  reviewNote: string;
  createdAt: string;
  invitationState: string;
  invitationSentAt: string | null;
  canInvite: boolean;
  partner: { id: string } | null;
};
const decisions = [
  { value: "APPROVED", label: "Approve application" },
  { value: "REJECTED", label: "Reject application" },
];
export function PartnerApplications({
  items,
  onRefresh,
}: {
  items: PartnerApplicationRecord[];
  onRefresh: () => void;
}) {
  const params = useSearchParams();
  const [selected, setSelected] = useState<PartnerApplicationRecord | null>(
    items.find(i => i.id === params.get("applicationId")) ?? null,
  );
  const [decision, setDecision] = useState("APPROVED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ body: string; key: string; resource: string } | null>(
    null,
  );
  async function send(resource: string, payload: unknown) {
    const body = JSON.stringify(payload);
    if (retry.current?.body !== body || retry.current.resource !== resource)
      retry.current = { body, resource, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await deliveryFetch(`/api/delivery/${resource}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retry.current.key,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save this action.");
      toast.success(result.message);
      setSelected(null);
      onRefresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("partner-review", {
      applicationId: selected!.id,
      status: decision,
      note: String(new FormData(event.currentTarget).get("note") ?? ""),
      operatingLocation: String(
        new FormData(event.currentTarget).get("operatingLocation") ?? "",
      ),
    });
  }
  return (
    <section className="d-card">
      <div className="d-card-header">
        <div>
          <h2>Business applications</h2>
        </div>
      </div>
      {error && !selected && (
        <div className="d-error" role="alert">
          {error}
        </div>
      )}
      {items.length ? (
        <div className="d-application-list">
          {items.map((application) => (
            <article className="d-review-card" key={application.id}>
              <div className="d-review-business">
                <ApplicationLogo application={application} size={56} />
                <div>
                  <h3>{application.businessName}</h3>
                  <p>
                    {application.ownerName} · {application.phone}
                  </p>
                  <p>{application.email}</p>
                  <small>{application.publicId}</small>
                </div>
                <span className="d-status">
                  {application.partner ? "ACTIVATED" : application.status}
                </span>
              </div>
              <div className="d-review-summary">
                <span>{application.pickupArea}</span>
                <span>
                  About {application.dailyDeliveries} deliveries / day
                </span>
                <span>
                  {application.invitationState === "SENT"
                    ? "Setup email requested"
                    : application.invitationState === "FAILED"
                      ? "Invitation needs retry"
                      : application.invitationState === "SENDING"
                        ? "Preparing invitation"
                        : "No invitation sent"}
                </span>
              </div>
              <div className="d-row-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSelected(application);
                    setDecision(
                      application.status === "REJECTED"
                        ? "REJECTED"
                        : "APPROVED",
                    );
                    setError("");
                    retry.current = null;
                  }}
                >
                  Review application
                </Button>
                {application.status === "APPROVED" && !application.partner && (
                  <Button
                    disabled={busy || !application.canInvite}
                    onClick={() =>
                      void send("partner-invitation", {
                        applicationId: application.id,
                      })
                    }
                  >
                    {!application.canInvite
                      ? "Setup email requested"
                      : busy
                        ? "Working…"
                        : "Send setup invitation"}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="d-empty">
          <strong>No business applications yet</strong>
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelected(null);
            setError("");
          }
        }}
      >
        <DialogContent className="d-modal d-review-modal">
          <DialogHeader>
            <DialogTitle>Review business application</DialogTitle>
            <DialogDescription className="sr-only">
              Approval alone does not create a login. Send the invitation
              afterwards.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="d-review-business">
                <ApplicationLogo application={selected} size={80} />
                <div>
                  <strong>{selected.businessName}</strong>
                  <p>{selected.publicId}</p>
                </div>
              </div>
              <dl className="d-review-details">
                <div>
                  <dt>Owner / manager</dt>
                  <dd>{selected.ownerName}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {selected.email}
                    <br />
                    {selected.phone}
                  </dd>
                </div>
                <div>
                  <dt>Page / business</dt>
                  <dd>
                    {selected.businessType}
                    {selected.pageUrl && (
                      <a
                        href={selected.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View business page
                      </a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Expected volume</dt>
                  <dd>{selected.dailyDeliveries} deliveries / day</dd>
                </div>
                <div className="full">
                  <dt>Pickup address</dt>
                  <dd>
                    {selected.pickupAddress} · {selected.pickupArea}
                  </dd>
                </div>
              </dl>
              {selected.partner ? (
                <div className="d-note">
                  This business has activated its partner account. Use Partner
                  pages to suspend or manage its access.
                </div>
              ) : (
                <form className="d-form" onSubmit={review}>
                  <div className="d-field full">
                    <Label htmlFor="partner-review-decision">Decision</Label>
                    <Select
                      items={decisions}
                      value={decision}
                      onValueChange={(value) => setDecision(String(value))}
                    >
                      <SelectTrigger id="partner-review-decision">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {decisions.map((item) => (
                          <SelectItem value={item.value} key={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="d-field full">
                    <Label htmlFor="partner-operating-location">
                      Business operating location
                    </Label>
                    <Select
                      name="operatingLocation"
                      defaultValue={selected.operatingLocation ?? undefined}
                      items={Object.entries(operatingLocationLabels).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    >
                      <SelectTrigger id="partner-operating-location">
                        <SelectValue placeholder="Choose the operating location" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(operatingLocationLabels).map(
                          ([value, label]) => (
                            <SelectItem value={value} key={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="d-field full">
                    <Label htmlFor="partner-review-note">Review note</Label>
                    <Textarea
                      id="partner-review-note"
                      name="note"
                      required
                      minLength={3}
                      maxLength={500}
                      defaultValue={selected.reviewNote}
                    />
                  </div>
                  {error && (
                    <div className="d-error full" role="alert">
                      {error}
                    </div>
                  )}
                  <div className="d-form-footer">
                    <Button type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save review decision"}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ApplicationLogo({
  application,
  size,
}: {
  application: PartnerApplicationRecord;
  size: number;
}) {
  return application.logoReady ? (
    <Image
      src={`/api/delivery/partner-logo?id=${application.id}`}
      alt={`${application.businessName} logo`}
      width={size}
      height={size}
      unoptimized
    />
  ) : (
    <div
      className="d-business-initials"
      role="img"
      aria-label={`${application.businessName} — no logo provided`}
      style={{ width: size, height: size }}
    >
      {application.businessName.trim().slice(0, 2).toUpperCase()}
    </div>
  );
}
