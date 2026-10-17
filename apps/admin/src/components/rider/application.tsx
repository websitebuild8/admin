"use client";
import { WorkspaceSwitcher } from "@/components/delivery/workspace-switcher";
import { deliveryFetch } from "@/lib/delivery/fetch";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { applicationInput, type Actor } from "@/lib/delivery/domain";

export function RiderApplication({ actor }: { actor: Actor }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const attempt = useRef({ body: "", key: "" });
  const differentRole = !["APPLICANT", "DRIVER"].includes(actor.role);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const parsed = applicationInput.safeParse({
      role: "DRIVER",
      name: form.get("name"),
      phone: form.get("phone"),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) =>
            i.path[0] === "phone"
              ? "Enter a valid seven-digit Maldives phone number."
              : i.message,
          )
          .join(" "),
      );
      return;
    }
    const body = JSON.stringify({ type: "apply", application: parsed.data });
    if (attempt.current.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await deliveryFetch("/api/delivery/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Application could not be submitted.");
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Check your connection and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="r-onboarding">
      <section className="r-onboarding-card">
        <div className="r-onboarding-brand">
          <Link href="/">
            <Image
              src="/brand/igo-delivery.jpg"
              width={132}
              height={74}
              alt="iGO Delivery"
              priority
            />
          </Link>
          <WorkspaceSwitcher actor={actor} />
          <UserButton />
        </div>
        <span className="r-eyebrow">IGO RIDER / YOUR APPLICATION</span>
        {differentRole ? (
          <>
            <h1>
              You’re signed in to your{" "}
              {actor.role === "ADMIN" ? "admin" : "partner"} account.
            </h1>
            <p>
              Rider access uses a separate approved rider account. Use the
              profile menu to switch accounts, or return to your workspace.
            </p>
            <Button
              render={
                <Link
                  href={actor.role === "ADMIN" ? "/delivery" : "/partner"}
                />
              }
            >
              Open my workspace <ArrowRight size={16} />
            </Button>
          </>
        ) : actor.status !== "UNREGISTERED" || sent ? (
          <>
            <h1>
              {sent || actor.status === "PENDING"
                ? "Your next stop: approval."
                : actor.status === "REJECTED"
                  ? "Let’s review your application."
                  : "Your rider access is paused."}
            </h1>
            <p>
              {sent || actor.status === "PENDING"
                ? "Your application is saved. iGO will review it before you can take or receive delivery assignments. Sign in here with this same account to check your status."
                : "Contact iGO to discuss your application or access. Your delivery records are retained."}
            </p>
            <div className="r-status">
              <span className="r-dot" />
              {sent ? "Pending review" : actor.status.toLowerCase()}
            </div>
            <Button onClick={() => router.refresh()}>
              <RefreshCw size={16} /> Check approval
            </Button>
          </>
        ) : (
          <>
            <h1>
              Let’s get you
              <br />
              on the road.
            </h1>
            <p>
              Your account is ready. Send your details for iGO’s review before
              you receive delivery assignments.
            </p>
            <form onSubmit={submit} className="r-application-form">
              <div>
                <Label htmlFor="rider-name">Full name</Label>
                <Input
                  id="rider-name"
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  placeholder="Your full name"
                />
              </div>
              <div>
                <Label htmlFor="rider-phone">Maldives mobile number</Label>
                <Input
                  id="rider-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="(\+960)?[379][0-9]{6}"
                  maxLength={11}
                  required
                  placeholder="7xxxxxx"
                />
              </div>
              <Label className="r-check">
                <Checkbox required name="responsibility" />I will confirm pickup
                only after receiving packages, and record delivery accurately.
              </Label>
              <p className="r-fine">
                Your name and contact number are used to review your application
                and coordinate assigned deliveries.{" "}
                <Link href="/rider/privacy">Privacy notice</Link>
              </p>
              {error && (
                <div role="alert" className="r-error">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit for review"}
                <ArrowRight size={16} />
              </Button>
            </form>
          </>
        )}
        <Link className="r-back" href="/">
          ← Back to iGO Delivery
        </Link>
      </section>
    </main>
  );
}
