BEGIN;
CREATE TABLE public."DeliveryPaidInvoice" (
 "invoiceId" UUID PRIMARY KEY REFERENCES public."DeliveryInvoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'version'='1'),
 "paidAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."DeliveryPaidInvoiceDispatch" (
 "invoiceId" UUID PRIMARY KEY REFERENCES public."DeliveryPaidInvoice"("invoiceId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "notificationId" UUID NOT NULL UNIQUE REFERENCES public."DeliveryNotification"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "sentBy" TEXT NOT NULL,
 "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."DeliveryInvoiceEvent" (
 id TEXT PRIMARY KEY,
 "invoiceId" UUID NOT NULL REFERENCES public."DeliveryInvoice"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('ISSUED','SENT','PAYMENT_SUBMITTED','PAYMENT_REJECTED','PAYMENT_PARTIAL','PAYMENT_CONFIRMED','PAID','PAID_SENT')),
 "occurredAt" TIMESTAMPTZ(3) NOT NULL,
 amount INTEGER CHECK (amount>=0),
 reference TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 "receiptId" UUID
);
CREATE INDEX "DeliveryInvoiceEvent_invoiceId_occurredAt_id_idx" ON public."DeliveryInvoiceEvent"("invoiceId","occurredAt",id);
ALTER TABLE public."DeliveryPaidInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeliveryPaidInvoiceDispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeliveryInvoiceEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DeliveryPaidInvoice",public."DeliveryPaidInvoiceDispatch",public."DeliveryInvoiceEvent" FROM PUBLIC,anon,authenticated;

-- A paid document is derived from reconciled, bank-confirmed allocations only.
CREATE FUNCTION public.igo_paid_invoice_snapshot(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i public."DeliveryInvoice"; details jsonb; lines jsonb; payments jsonb; line_total bigint; payment_total bigint;
BEGIN
 SELECT * INTO i FROM public."DeliveryInvoice" WHERE id=p_id;
 IF NOT FOUND OR i.paid<>i.total OR i.total<=0 THEN RAISE EXCEPTION 'An invoice must be fully paid by verified allocations'; END IF;
 SELECT sum(l.amount),jsonb_agg(jsonb_build_object('id',l.id,'amount',l.amount,'parcel',jsonb_build_object('publicId',p."publicId",'externalReference',p."externalReference",'recipientName',p."recipientName",'deliveredAt',p."deliveredAt")) ORDER BY l.id)
 INTO line_total,lines FROM public."DeliveryInvoiceLine" l JOIN public."DeliveryParcel" p ON p.id=l."parcelId" WHERE l."invoiceId"=i.id;
 SELECT sum(a.amount),jsonb_agg(jsonb_build_object('id',p.id,'bankReference',p."bankReference",'amount',a.amount,'reviewedAt',p."reviewedAt") ORDER BY p."reviewedAt",p.id)
 INTO payment_total,payments FROM public."DeliveryPaymentAllocation" a JOIN public."DeliveryPayment" p ON p.id=a."paymentId"
 WHERE a."invoiceId"=i.id AND p.status IN ('CONFIRMED','PARTIAL') AND p."confirmedAmount"=a.amount AND p."reviewedAt" IS NOT NULL;
 IF line_total IS DISTINCT FROM i.total::bigint OR payment_total IS DISTINCT FROM i.total::bigint THEN RAISE EXCEPTION 'Paid invoice must reconcile to its lines and verified payments'; END IF;
 SELECT jsonb_build_object('version',1,'id',i.id,'publicId',i."publicId",'createdAt',i."createdAt",'cutoffAt',coalesce(c."cutoffAt",i."manualCutoffAt"),'cycleDate',c."localDate",'total',i.total,'paid',i.paid,'currency','MVR',
 'partner',jsonb_build_object('businessName',p."businessName",'pickupAddress',p."pickupAddress",'account',jsonb_build_object('name',a.name,'phone',a.phone)),
 'settings',jsonb_build_object('businessLegalName',coalesce(s."businessLegalName",''),'registrationNumber',coalesce(s."registrationNumber",''),'supportEmail',coalesce(s."supportEmail",''),'supportPhone',coalesce(s."supportPhone",''),'bankName',coalesce(s."bankName",''),'bankAccount',coalesce(s."bankAccount",''),'beneficiary',coalesce(s.beneficiary,'')),
 'lines',lines,'payments',payments) INTO details FROM public."DeliveryPartner" p JOIN public."DeliveryAccount" a ON a.id=p."accountId"
 LEFT JOIN public."DeliverySettings" s ON s.id='default' LEFT JOIN public."DeliveryBillingCycle" c ON c.id=i."cycleId" WHERE p.id=i."partnerId";
 RETURN details;
END $$;
CREATE FUNCTION public.igo_paid_invoice_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE settled timestamptz;
BEGIN
 SELECT max(p."reviewedAt") INTO settled FROM public."DeliveryPaymentAllocation" a JOIN public."DeliveryPayment" p ON p.id=a."paymentId" WHERE a."invoiceId"=NEW."invoiceId";
 IF NEW.snapshot IS DISTINCT FROM public.igo_paid_invoice_snapshot(NEW."invoiceId") OR NEW."paidAt" IS DISTINCT FROM settled THEN RAISE EXCEPTION 'Paid document must match the verified invoice ledger'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_paid_invoice_guard BEFORE INSERT ON public."DeliveryPaidInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_paid_invoice_guard();
CREATE TRIGGER delivery_paid_invoice_immutable BEFORE UPDATE OR DELETE ON public."DeliveryPaidInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();

CREATE FUNCTION public.igo_paid_invoice_issue() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i public."DeliveryInvoice"; settled timestamptz; inserted uuid;
BEGIN
 SELECT * INTO i FROM public."DeliveryInvoice" WHERE id=NEW.id;
 IF i.paid=i.total AND NOT EXISTS (SELECT 1 FROM public."DeliveryPaidInvoice" WHERE "invoiceId"=i.id) THEN
  SELECT max(p."reviewedAt") INTO settled FROM public."DeliveryPaymentAllocation" a JOIN public."DeliveryPayment" p ON p.id=a."paymentId" WHERE a."invoiceId"=i.id;
  INSERT INTO public."DeliveryPaidInvoice" ("invoiceId",snapshot,"paidAt") VALUES (i.id,public.igo_paid_invoice_snapshot(i.id),settled) ON CONFLICT DO NOTHING RETURNING "invoiceId" INTO inserted;
  IF inserted IS NOT NULL THEN
   INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail) VALUES(gen_random_uuid(),'system:verified-payments','SYSTEM','PAID_INVOICE_ISSUED',i."partnerId",i.id::text,jsonb_build_object('amount',i.total));
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER delivery_paid_invoice_issue AFTER INSERT OR UPDATE ON public."DeliveryInvoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_paid_invoice_issue();

CREATE FUNCTION public.igo_paid_invoice_dispatch_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryInvoice" i JOIN public."DeliveryPartner" p ON p.id=i."partnerId" JOIN public."DeliveryAccount" a ON a.id=p."accountId" JOIN public."DeliveryNotification" n ON n.id=NEW."notificationId" AND n.recipient=a."clerkUserId" WHERE i.id=NEW."invoiceId" AND i.paid=i.total)
 THEN RAISE EXCEPTION 'Paid invoice notice must belong to the settled partner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_paid_dispatch_guard BEFORE INSERT ON public."DeliveryPaidInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_paid_invoice_dispatch_guard();
CREATE TRIGGER delivery_paid_dispatch_immutable BEFORE UPDATE OR DELETE ON public."DeliveryPaidInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();

-- Stable source IDs prevent retries/backfills from duplicating timeline events.
CREATE FUNCTION public.igo_invoice_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='DeliveryInvoice' THEN
  INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference) VALUES('issued:'||NEW.id,NEW.id,'ISSUED',NEW."createdAt",NEW.total,NEW."publicId");
 ELSIF TG_TABLE_NAME='DeliveryPayment' THEN
  IF TG_OP='INSERT' THEN
   INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference,"receiptId") VALUES('submitted:'||NEW.id,NEW."invoiceId",'PAYMENT_SUBMITTED',NEW."createdAt",NEW.amount,NEW."bankReference",NEW."receiptId");
  ELSIF OLD.status='PENDING' AND NEW.status<>'PENDING' THEN
   INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference,note,"receiptId") VALUES('reviewed:'||NEW.id,NEW."invoiceId",CASE NEW.status WHEN 'REJECTED' THEN 'PAYMENT_REJECTED' WHEN 'PARTIAL' THEN 'PAYMENT_PARTIAL' ELSE 'PAYMENT_CONFIRMED' END,NEW."reviewedAt",NEW."confirmedAmount",NEW."bankReference",NEW."reviewNote",NEW."receiptId");
  END IF;
 ELSIF TG_TABLE_NAME='DeliveryInvoiceDispatch' THEN
  INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt") VALUES('sent:'||NEW."invoiceId",NEW."invoiceId",'SENT',NEW."sentAt");
 ELSIF TG_TABLE_NAME='DeliveryPaidInvoice' THEN
  INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount) VALUES('paid:'||NEW."invoiceId",NEW."invoiceId",'PAID',NEW."paidAt",(NEW.snapshot->>'total')::integer);
 ELSIF TG_TABLE_NAME='DeliveryPaidInvoiceDispatch' THEN
  INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt") VALUES('paid-sent:'||NEW."invoiceId",NEW."invoiceId",'PAID_SENT',NEW."sentAt");
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_invoice_history AFTER INSERT ON public."DeliveryInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_history();
CREATE TRIGGER delivery_payment_history AFTER INSERT OR UPDATE ON public."DeliveryPayment" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_history();
CREATE TRIGGER delivery_dispatch_history AFTER INSERT ON public."DeliveryInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_history();
CREATE TRIGGER delivery_paid_history AFTER INSERT ON public."DeliveryPaidInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_history();
CREATE TRIGGER delivery_paid_dispatch_history AFTER INSERT ON public."DeliveryPaidInvoiceDispatch" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_history();
CREATE TRIGGER delivery_invoice_history_immutable BEFORE UPDATE OR DELETE ON public."DeliveryInvoiceEvent" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();

INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference)
 SELECT 'issued:'||id,id,'ISSUED',"createdAt",total,"publicId" FROM public."DeliveryInvoice";
INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference,"receiptId")
 SELECT 'submitted:'||id,"invoiceId",'PAYMENT_SUBMITTED',"createdAt",amount,"bankReference","receiptId" FROM public."DeliveryPayment";
INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt",amount,reference,note,"receiptId")
 SELECT 'reviewed:'||id,"invoiceId",CASE status WHEN 'REJECTED' THEN 'PAYMENT_REJECTED' WHEN 'PARTIAL' THEN 'PAYMENT_PARTIAL' ELSE 'PAYMENT_CONFIRMED' END,"reviewedAt","confirmedAmount","bankReference","reviewNote","receiptId" FROM public."DeliveryPayment" WHERE status<>'PENDING';
INSERT INTO public."DeliveryInvoiceEvent"(id,"invoiceId",kind,"occurredAt")
 SELECT 'sent:'||"invoiceId","invoiceId",'SENT',"sentAt" FROM public."DeliveryInvoiceDispatch";
-- Existing settled invoices gain a paid copy now, preserving their original
-- settlement time and the business profile available at migration time.
INSERT INTO public."DeliveryPaidInvoice"("invoiceId",snapshot,"paidAt")
 SELECT i.id,public.igo_paid_invoice_snapshot(i.id),(SELECT max(p."reviewedAt") FROM public."DeliveryPaymentAllocation" a JOIN public."DeliveryPayment" p ON p.id=a."paymentId" WHERE a."invoiceId"=i.id)
 FROM public."DeliveryInvoice" i WHERE i.paid=i.total;
INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail)
 SELECT gen_random_uuid(),'system:paid-invoice-migration','SYSTEM','PAID_INVOICE_ISSUED',i."partnerId",i.id::text,jsonb_build_object('amount',i.total,'historic',true)
 FROM public."DeliveryPaidInvoice" p JOIN public."DeliveryInvoice" i ON i.id=p."invoiceId";
REVOKE ALL ON FUNCTION public.igo_paid_invoice_snapshot(uuid),public.igo_paid_invoice_guard(),public.igo_paid_invoice_issue(),public.igo_paid_invoice_dispatch_guard(),public.igo_invoice_history() FROM PUBLIC,anon,authenticated;

COMMIT;
