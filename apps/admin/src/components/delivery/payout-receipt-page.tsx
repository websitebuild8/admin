import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { deliveryActor } from "@/lib/delivery/auth";
import { fullCodPayoutReceipt } from "@/lib/delivery/cod-receipts";
import { DeliveryError } from "@/lib/delivery/domain";
import { PayoutReceiptPrint } from "./payout-receipt";
export async function PayoutReceiptPage({
  params,
  partner,
}: {
  params: Promise<{ id: string }>;
  partner: boolean;
}) {
  let actor;
  try {
    actor = await deliveryActor();
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 401)
      redirect(partner ? "/partner/sign-in" : "/delivery/sign-in");
    throw error;
  }
  if (
    actor.role !== (partner ? "PARTNER" : "ADMIN") ||
    actor.status !== "APPROVED"
  )
    notFound();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let document;
  try {
    document = await fullCodPayoutReceipt(actor, id);
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 404) notFound();
    throw error;
  }
  return <PayoutReceiptPrint document={document} partner={partner} />;
}
