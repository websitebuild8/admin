import { riderInitialData } from "@/lib/delivery/initial-data";
import { pageSearch } from "@/lib/delivery/portal-initial";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { deliveryActor } from "@/lib/delivery/auth";
import { DeliveryError } from "@/lib/delivery/domain";
import { riderScreens } from "@/lib/delivery/rider-contract";
import { RiderApplication } from "@/components/rider/application";
import { RiderWorkspace, RiderSkeleton } from "@/components/rider/workspace";
export const dynamic = "force-dynamic";
async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (!section?.length) redirect("/rider/collections");
  if (
    section.length === 1 &&
    ["available", "deliveries"].includes(section[0])
  ) {
    const search = pageSearch(await searchParams);
    search.set(
      "stage",
      section[0] === "available" ? "AVAILABLE" : "TO_DELIVER",
    );
    redirect(`/rider/collections?${search}`);
  }
  let actor;
  try {
    actor = await deliveryActor("DRIVER", false);
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 401)
      redirect("/rider/sign-in");
    throw error;
  }
  const screen = section?.[0] ?? "collections";
  if (
    (section?.length ?? 0) > 1 ||
    !riderScreens.includes(screen as (typeof riderScreens)[number])
  )
    notFound();
  if (actor.role !== "DRIVER" || actor.status !== "APPROVED")
    return <RiderApplication actor={actor} />;
  const initial = await riderInitialData(
    actor,
    screen as (typeof riderScreens)[number],
    pageSearch(await searchParams),
  );
  return (
    <RiderWorkspace
      key={screen}
      actor={actor}
      initial={initial}
      screen={screen as (typeof riderScreens)[number]}
    />
  );
}
export default function Page(props: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<RiderSkeleton />}>
      <Workspace {...props} />
    </Suspense>
  );
}
