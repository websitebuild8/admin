import { PartnerApplicationForm } from "@/components/delivery/partner-application-form";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deliveryActor } from "@/lib/delivery/auth";
import { DeliveryError, type Actor } from "@/lib/delivery/domain";
import { hasClerkKeys } from "@/lib/mode";
import { Button } from "@/components/ui/button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  let actor: Actor | undefined;
  if (hasClerkKeys()) {
    try {
      actor = await deliveryActor("PARTNER", false);
    } catch (error) {
      if (!(error instanceof DeliveryError && error.status === 401))
        throw error;
    }
  }
  if (actor?.role === "PARTNER") redirect("/partner");
  if (actor?.role === "DRIVER")
    return (
      <PublicPageTransition>
        <main className="d-auth">
          <span className="d-eyebrow">YOUR EXISTING ACCOUNT</span>
          <h1>Your account is registered as a rider.</h1>
          <p>
            This email already has a Rider workspace. Only approved
            administrators can also use a Partner workspace with the same
            sign-in. Continue to your rider account, or contact iGO if you need
            help with your account.
          </p>
          <Button render={<Link href="/rider" />}>Open Rider workspace</Button>
          <Link href="/">Back to home</Link>
        </main>
      </PublicPageTransition>
    );
  return (
    <PublicPageTransition>
      <PartnerApplicationForm
        registrationRequired={notice === "registration-required"}
      />
    </PublicPageTransition>
  );
}
