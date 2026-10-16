ALTER TABLE public."DeliveryInvoice" ALTER COLUMN "cycleId" DROP NOT NULL;
ALTER TABLE public."DeliveryInvoice" ADD COLUMN "manualCutoffAt" TIMESTAMPTZ(3);
ALTER TABLE public."DeliveryInvoice" ADD CONSTRAINT delivery_invoice_source CHECK (
 ("cycleId" IS NOT NULL AND "manualCutoffAt" IS NULL) OR ("cycleId" IS NULL AND "manualCutoffAt" IS NOT NULL)
);
CREATE OR REPLACE FUNCTION public.igo_invoice_header_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.id,NEW."publicId",NEW."partnerId",NEW."cycleId",NEW."manualCutoffAt",NEW.total,NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."publicId",OLD."partnerId",OLD."cycleId",OLD."manualCutoffAt",OLD.total,OLD."createdAt") THEN RAISE EXCEPTION 'Invoice identity, issued charges and billing window are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.igo_invoice_line_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryParcel" p JOIN public."DeliveryInvoice" i ON i.id=NEW."invoiceId" LEFT JOIN public."DeliveryBillingCycle" c ON c.id=i."cycleId"
 WHERE p.id=NEW."parcelId" AND p.state='DELIVERED' AND p."partnerId"=i."partnerId"
 AND (i."cycleId" IS NULL OR c."partnerId"=i."partnerId")
 AND p."deliveredAt"<=coalesce(c."cutoffAt",i."manualCutoffAt") AND p.fee=NEW.amount)
 THEN RAISE EXCEPTION 'Only eligible delivered packages at their frozen fee can be invoiced'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.igo_invoice_header_guard(),public.igo_invoice_line_guard() FROM PUBLIC, anon, authenticated;

CREATE TABLE public."DeliveryInvoiceDispatch" (
 "invoiceId" UUID PRIMARY KEY REFERENCES public."DeliveryInvoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "notificationId" UUID NOT NULL UNIQUE REFERENCES public."DeliveryNotification"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "sentBy" TEXT NOT NULL,
 "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."DeliveryInvoiceDispatch" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DeliveryInvoiceDispatch" FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.igo_invoice_dispatch_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryInvoice" i JOIN public."DeliveryPartner" p ON p.id=i."partnerId" JOIN public."DeliveryAccount" a ON a.id=p."accountId" JOIN public."DeliveryNotification" n ON n.id=NEW."notificationId" AND n.recipient=a."clerkUserId" WHERE i.id=NEW."invoiceId")
 THEN RAISE EXCEPTION 'Invoice notice must belong to the invoiced partner'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.igo_invoice_dispatch_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER delivery_invoice_dispatch_guard BEFORE INSERT ON public."DeliveryInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_dispatch_guard();
CREATE TRIGGER delivery_invoice_dispatch_immutable BEFORE UPDATE OR DELETE ON public."DeliveryInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
