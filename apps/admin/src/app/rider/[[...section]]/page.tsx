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
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  if (!section?.length) redirect("/rider/collections");
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
  return (
    <RiderWorkspace
      key={screen}
      actor={actor}
      screen={screen as (typeof riderScreens)[number]}
    />
  );
}
export default function Page(props: {
  params: Promise<{ section?: string[] }>;
}) {
  return (
    <Suspense fallback={<RiderSkeleton />}>
      <Workspace {...props} />
    </Suspense>
  );
}
