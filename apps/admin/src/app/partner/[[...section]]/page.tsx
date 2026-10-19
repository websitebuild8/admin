import { portalInitialData } from "@/lib/delivery/initial-data";
import { pageSearch } from "@/lib/delivery/portal-initial";
import { Suspense } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
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
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let actor;
  try {
    actor = await deliveryActor("PARTNER", false);
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 401)
      redirect("/partner/sign-in");
    throw error;
  }
  if (actor.role === "APPLICANT" && actor.status === "UNREGISTERED")
    redirect("/join?notice=registration-required");
  if (actor.role !== "PARTNER")
    return (
      <main className="d-auth">
        <span className="d-eyebrow">PARTNER WORKSPACE</span>
        <h1>Use your approved business account.</h1>
        <p>
          {actor.role === "ADMIN"
            ? "You are currently signed in as an administrator. Partner dashboards are separate and only open to approved business accounts."
            : "Partner access opens after your application is approved and a setup invitation has been sent to your verified email."}
        </p>
        <div className="d-import-actions">
          <UserButton />
          <Link href="/join">Business application</Link>
          {actor.role === "ADMIN" && (
            <Link href="/delivery">Administration</Link>
          )}
        </div>
      </main>
    );
  if (actor.status !== "APPROVED") return <DeliveryApplication actor={actor} />;
  const { section } = await params;
  const screen = section?.[0] ?? "overview";
  if (section?.length === 1 && ["invoices", "payments"].includes(screen)) {
    const search = pageSearch(await searchParams);
    search.set("tab", screen === "payments" ? "transfers" : "invoices");
    if (search.get("state") === "OUTSTANDING") search.set("status", "OUTSTANDING");
    search.delete("state");
    redirect(`/partner/finance?${search}`);
  }
  if (
    (section && section.length > 1) ||
    ![
      "overview",
      "packages",
      "import",
      "finance",
      "invoices",
      "payments",
      "notifications",
      "settings",
    ].includes(screen)
  )
    notFound();
  const initial = await portalInitialData(
    actor,
    screen,
    pageSearch(await searchParams),
  );
  return (
    <DeliveryPortal
      key={screen}
      actor={actor}
      screen={screen}
      initial={initial}
    />
  );
}
export default function Page(props: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<DeliverySkeleton />}>
      <Workspace {...props} />
    </Suspense>
  );
}
