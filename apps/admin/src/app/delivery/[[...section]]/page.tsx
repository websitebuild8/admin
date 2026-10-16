import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { deliveryActor } from "@/lib/delivery/auth";
import { DeliveryError } from "@/lib/delivery/domain";
import {
  DeliveryPortal,
  DeliveryApplication,
} from "@/components/delivery/portal";
import { DeliverySkeleton } from "@/components/delivery/skeleton";
export const dynamic = "force-dynamic";
async function Workspace({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  let actor;
  let unavailable = "";
  try {
    actor = await deliveryActor();
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 401)
      redirect("/delivery/sign-in");
    if (error instanceof DeliveryError && error.status === 503)
      unavailable = error.message;
    else throw error;
  }
  if (!actor)
    return (
      <main className="setup-page">
        <div className="setup-card">
          <h1>Connect iGO Delivery</h1>
          <p>{unavailable}</p>
          <p>
            Configure Clerk and Supabase in the server environment before
            opening the portal.
          </p>
        </div>
      </main>
    );
  const { section } = await params;
  if (actor.role === "PARTNER")
    redirect(`/partner${section?.length ? `/${section.join("/")}` : ""}`);
  if (actor.role === "DRIVER" || actor.role === "APPLICANT")
    redirect(
      `/rider${section?.[0] === "cod" ? "/cash" : section?.length ? `/${section.join("/")}` : ""}`,
    );
  if (actor.status !== "APPROVED") return <DeliveryApplication actor={actor} />;
  const screen = section?.[0] ?? "overview";
  const allowed =
    actor.role === "ADMIN"
      ? [
          "overview",
          "packages",
          "partners",
          "applications",
          "drivers",
          "invoices",
          "payments",
          "cod",
          "reports",
          "audit",
          "settings",
          "notifications",
          "import",
        ]
      : ["collections", "deliveries", "cod", "notifications"];
  if ((section && section.length > 1) || !allowed.includes(screen)) notFound();
  return <DeliveryPortal key={screen} actor={actor} screen={screen} />;
}
export default function Page(props: {
  params: Promise<{ section?: string[] }>;
}) {
  return (
    <Suspense fallback={<DeliverySkeleton />}>
      <Workspace {...props} />
    </Suspense>
  );
}
