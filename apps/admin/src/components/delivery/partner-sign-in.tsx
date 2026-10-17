"use client";
import { useEffect, useState, type FormEvent } from "react";
import { SignIn, useClerk } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PartnerSignIn() {
  const clerk = useClerk(),
    router = useRouter(),
    pathname = usePathname();
  useEffect(() => {
    if (clerk.session) router.replace("/partner");
  }, [clerk.session, router]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clerk.loaded || !clerk.client || busy) return;
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    setBusy(true);
    setError("");
    try {
      // Clerk performs identifier discovery and applies its configured abuse
      // protections. Passwords, MFA and recovery remain in the prebuilt flow.
      await clerk.client.signIn.create({ identifier: email });
      setReady(true);
    } catch (failure) {
      const errors = (
        failure as { errors?: { code?: string; longMessage?: string }[] }
      ).errors;
      if (errors?.some((e) => e.code === "form_identifier_not_found")) {
        router.push("/join?notice=registration-required");
      } else
        setError(
          errors?.[0]?.longMessage ??
            "We couldn’t start sign-in. Please try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  if (ready || pathname !== "/partner/sign-in")
    return (
      <SignIn
        routing="path"
        path="/partner/sign-in"
        signUpUrl="/join?notice=registration-required"
        forceRedirectUrl="/partner"
      />
    );
  return (
    <form className="d-card d-card-pad w-full max-w-sm" onSubmit={identify}>
      <Label htmlFor="partner-login-email">Your approved business email</Label>
      <Input
        id="partner-login-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        className="mt-2 mb-4"
      />
      {error && (
        <p className="d-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!clerk.loaded || busy}>
        {busy ? "Checking…" : "Continue to sign in"}
      </Button>
      <p className="mt-4 text-sm">
        New to iGO? If you haven’t registered, we’ll guide you to the business
        application. Approval is required before your dashboard opens.
      </p>
    </form>
  );
}
