import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { deliveryActor } from "@/lib/delivery/auth";
import {
  invoiceDocument,
  paidInvoiceDocument,
} from "@/lib/delivery/invoice-document";
import { DeliveryError } from "@/lib/delivery/domain";
import { InvoicePrint } from "./invoice-print";

export async function InvoicePage({
  params,
  partner,
  paid = false,
}: {
  params: Promise<{ id: string }>;
  partner: boolean;
  paid?: boolean;
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
  let proof;
  try {
    if (paid) {
      const result = await paidInvoiceDocument(actor, id);
      document = result.document;
      proof = result.proof;
    } else document = await invoiceDocument(actor, id);
  } catch (error) {
    if (error instanceof DeliveryError && error.status === 404) notFound();
    throw error;
  }
  return (
    <InvoicePrint document={document} partner={partner} paidProof={proof} />
  );
}
