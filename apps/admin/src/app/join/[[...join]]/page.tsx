import { PartnerApplicationForm } from "@/components/delivery/partner-application-form";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
export default function Page() {
  return (
    <PublicPageTransition>
      <PartnerApplicationForm />
    </PublicPageTransition>
  );
}
