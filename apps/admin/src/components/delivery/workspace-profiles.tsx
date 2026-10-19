"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Store, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deliveryFetch } from "@/lib/delivery/fetch";
import {
  operatingLocations,
  operatingLocationLabels,
} from "@/lib/delivery/domain";
type Profile = {
  id: string;
  role: "PARTNER" | "DRIVER";
  status: string;
  name: string;
  phone: string;
  partner: null | {
    businessName: string;
    pickupAddress: string;
    operatingLocation: string | null;
    pageUrl: string;
  };
};
export function WorkspaceProfiles() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const retry = useRef({ body: "", key: "" });
  const locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    deliveryFetch("/api/delivery/workspace-profiles", {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load your workspaces.");
        if (!abort.signal.aborted) {
          setProfiles(data.profiles);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [revision]);
  async function save(event: FormEvent<HTMLFormElement>, profile: Profile) {
    event.preventDefault();
    if (locked.current) return;
    const form = new FormData(event.currentTarget),
      data = Object.fromEntries(form);
    const body = JSON.stringify({ ...data, role: profile.role });
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await deliveryFetch("/api/delivery/workspace-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retry.current.key,
        },
        body,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Could not save your details.");
      toast.success(value.message);
      setRevision((v) => v + 1);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Retry to save.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="d-own-workspaces">
      <section className="d-card d-card-pad">
        <span className="d-eyebrow">ONE SIGN-IN · THREE WORKSPACES</span>
        <h2>Your workspaces are already included.</h2>
      </section>
      {error && (
        <div className="d-error" role="alert">
          {error}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            Reload workspaces
          </Button>
        </div>
      )}
      {!profiles && !error && <Skeleton className="h-64" />}
      <div className="d-own-workspace-grid">
        {profiles?.map((profile) => (
          <section className="d-card" key={profile.id}>
            <div className="d-card-header">
              <div>
                <h2>
                  {profile.role === "PARTNER" ? (
                    <Store size={18} />
                  ) : (
                    <Bike size={18} />
                  )}{" "}
                  {profile.role === "PARTNER"
                    ? "Partner workspace"
                    : "Rider workspace"}
                </h2>
              </div>
              <Button
                variant="outline"
                render={
                  <Link
                    href={profile.role === "PARTNER" ? "/partner" : "/rider"}
                  />
                }
              >
                Open <ArrowUpRight size={14} />
              </Button>
            </div>
            <form
              className="d-form d-card-pad"
              onSubmit={(event) => void save(event, profile)}
            >
              {[
                ["name", "Contact name", profile.name],
                ["phone", "Contact number", profile.phone],
                ...(profile.partner
                  ? [
                      [
                        "businessName",
                        "Business name",
                        profile.partner.businessName,
                      ],
                      [
                        "pickupAddress",
                        "Pickup address",
                        profile.partner.pickupAddress,
                      ],
                      [
                        "pageUrl",
                        "Website or social page (optional)",
                        profile.partner.pageUrl,
                      ],
                    ]
                  : []),
              ].map(([name, label, value]) => (
                <div
                  className={`d-field ${name === "pickupAddress" || name === "pageUrl" ? "full" : ""}`}
                  key={`${profile.id}-${name}`}
                >
                  <Label htmlFor={`${profile.id}-${name}`}>{label}</Label>
                  <Input
                    id={`${profile.id}-${name}`}
                    name={name}
                    defaultValue={value}
                    required={name !== "pageUrl"}
                    disabled={busy}
                    maxLength={
                      name === "pickupAddress" || name === "pageUrl" ? 500 : 120
                    }
                  />
                </div>
              ))}
              {profile.partner && (
                <div className="d-field full">
                  <Label htmlFor={`${profile.id}-location`}>
                    Operating location
                  </Label>
                  <Select
                    name="operatingLocation"
                    defaultValue={profile.partner.operatingLocation ?? null}
                    required
                    disabled={busy}
                    items={operatingLocations.map((value) => ({
                      value,
                      label: operatingLocationLabels[value],
                    }))}
                  >
                    <SelectTrigger id={`${profile.id}-location`}>
                      <SelectValue placeholder="Select your business operating location" />
                    </SelectTrigger>
                    <SelectContent>
                      {operatingLocations.map((location) => (
                        <SelectItem key={location} value={location}>
                          {operatingLocationLabels[location]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {profile.partner &&
                (!profile.partner.pickupAddress ||
                  !profile.partner.operatingLocation ||
                  !profile.phone) && (
                  <p className="full d-workspace-setup-note">
                    Your partner workspace is ready. Add your pickup address,
                    contact number and operating location before registering
                    deliveries.
                  </p>
                )}
              <div className="d-form-footer">
                <Button disabled={busy} type="submit">
                  {busy ? "Saving…" : "Save details"}
                </Button>
              </div>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
