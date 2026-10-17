import { PartnerApplicationForm } from "@/components/delivery/partner-application-form";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return (
    <PublicPageTransition>
      <PartnerApplicationForm registrationRequired={notice === "registration-required"} />
    </PublicPageTransition>
  );
}
