CREATE SEQUENCE public.igo_delivery_parcel_number;
CREATE SEQUENCE public.igo_delivery_invoice_number;
INSERT INTO public."DeliveryRate" (zone,fee,"updatedAt") VALUES
 ('BOAT',2500,now()),('MALE',2500,now()),('HULHUMALE_1',3500,now()),('HULHUMALE_2',4500,now());
INSERT INTO public."DeliverySettings" (id,"updatedAt") VALUES ('default',now());

ALTER TABLE public."DeliveryPartner" ADD CONSTRAINT delivery_cutoff CHECK ("cutoffMinutes" BETWEEN 0 AND 1439);
ALTER TABLE public."DeliveryRate" ADD CONSTRAINT delivery_rate_positive CHECK (fee > 0 AND fee <= 1000000);
ALTER TABLE public."DeliveryParcel" ADD CONSTRAINT delivery_parcel_money CHECK (fee > 0 AND "codAmount" BETWEEN 0 AND 99999999);
ALTER TABLE public."DeliveryInvoice" ADD CONSTRAINT delivery_invoice_money CHECK (total > 0 AND paid >= 0 AND paid <= total);
ALTER TABLE public."DeliveryInvoiceLine" ADD CONSTRAINT delivery_line_positive CHECK (amount > 0);
ALTER TABLE public."DeliveryPaymentAllocation" ADD CONSTRAINT delivery_allocation_positive CHECK (amount > 0);
ALTER TABLE public."DeliveryPayment" ADD CONSTRAINT delivery_payment_state CHECK (
 amount > 0 AND "confirmedAmount" BETWEEN 0 AND amount AND
 ((status IN ('PENDING','REJECTED') AND "confirmedAmount"=0) OR
  (status='PARTIAL' AND "confirmedAmount">0 AND "confirmedAmount"<amount AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR
  (status='CONFIRMED' AND "confirmedAmount"=amount AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL)));

CREATE FUNCTION public.igo_parcel_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE identity text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state <> 'REGISTERED' OR NEW."pickedUpAt" IS NOT NULL OR NEW."deliveredAt" IS NOT NULL OR NEW."handoverId" IS NOT NULL OR NEW."remittanceId" IS NOT NULL THEN RAISE EXCEPTION 'Registration is not pickup or delivery'; END IF;
 ELSE
  IF (NEW."partnerId",NEW."publicId",NEW."externalReference",NEW.fee,NEW."codAmount",NEW."registeredAt") IS DISTINCT FROM (OLD."partnerId",OLD."publicId",OLD."externalReference",OLD.fee,OLD."codAmount",OLD."registeredAt") THEN RAISE EXCEPTION 'Package identity and quoted amounts are immutable'; END IF;
  IF OLD.state IN ('DELIVERED','CANCELLED') AND NEW.state <> OLD.state THEN RAISE EXCEPTION 'Final package state is immutable'; END IF;
  IF NEW.state <> OLD.state AND NOT ((OLD.state='REGISTERED' AND NEW.state IN ('PICKED_UP','CANCELLED')) OR (OLD.state='PICKED_UP' AND NEW.state='DELIVERED')) THEN RAISE EXCEPTION 'Invalid delivery transition'; END IF;
  IF OLD."pickedUpAt" IS NOT NULL AND (NEW."driverId",NEW."pickedUpAt",NEW."pickedUpBy") IS DISTINCT FROM (OLD."driverId",OLD."pickedUpAt",OLD."pickedUpBy") THEN RAISE EXCEPTION 'Physical pickup attribution is immutable'; END IF;
  IF OLD."deliveredAt" IS NOT NULL AND (NEW."deliveredAt",NEW."deliveredBy",NEW."codCollectedAt") IS DISTINCT FROM (OLD."deliveredAt",OLD."deliveredBy",OLD."codCollectedAt") THEN RAISE EXCEPTION 'Delivery attribution is immutable'; END IF;
  IF OLD."handoverId" IS NOT NULL AND NEW."handoverId" IS DISTINCT FROM OLD."handoverId" THEN RAISE EXCEPTION 'Cash handover is immutable'; END IF;
  IF OLD."remittanceId" IS NOT NULL AND NEW."remittanceId" IS DISTINCT FROM OLD."remittanceId" THEN RAISE EXCEPTION 'COD remittance is immutable'; END IF;
 END IF;
 IF NEW.state IN ('PICKED_UP','DELIVERED') THEN
  SELECT "clerkUserId" INTO identity FROM public."DeliveryAccount" WHERE id=NEW."driverId" AND role='DRIVER';
  IF identity IS NULL OR NEW."pickedUpBy" IS DISTINCT FROM identity OR NEW."pickedUpAt" IS NULL OR NEW."pickedUpAt"<NEW."registeredAt" THEN RAISE EXCEPTION 'Physical receipt requires assigned driver identity and timestamp'; END IF;
 END IF;
 IF NEW.state='DELIVERED' AND (NEW."deliveredBy" IS DISTINCT FROM identity OR NEW."deliveredAt" IS NULL OR NEW."deliveredAt"<NEW."pickedUpAt" OR (NEW."codAmount">0 AND NEW."codCollectedAt" IS NULL)) THEN RAISE EXCEPTION 'Delivery requires driver attribution and COD confirmation'; END IF;
 IF NEW.state IN ('REGISTERED','CANCELLED') AND (NEW."pickedUpAt" IS NOT NULL OR NEW."deliveredAt" IS NOT NULL OR NEW."codCollectedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Unpicked packages cannot have delivery milestones'; END IF;
 IF NEW."handoverId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."DeliveryCashHandover" h WHERE h.id=NEW."handoverId" AND h."driverId"=NEW."driverId" AND NEW.state='DELIVERED' AND NEW."codAmount">0) THEN RAISE EXCEPTION 'Invalid cash handover'; END IF;
 IF NEW."remittanceId" IS NOT NULL AND (NEW."handoverId" IS NULL OR NOT EXISTS (SELECT 1 FROM public."DeliveryCodRemittance" r WHERE r.id=NEW."remittanceId" AND r."partnerId"=NEW."partnerId")) THEN RAISE EXCEPTION 'COD payout requires received cash and matching partner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_parcel_guard BEFORE INSERT OR UPDATE ON public."DeliveryParcel" FOR EACH ROW EXECUTE FUNCTION public.igo_parcel_guard();

CREATE FUNCTION public.igo_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Financial and audit history is append-only'; END $$;
CREATE TRIGGER delivery_audit_immutable BEFORE UPDATE OR DELETE ON public."DeliveryActivity" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_lines_immutable BEFORE UPDATE OR DELETE ON public."DeliveryInvoiceLine" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_allocations_immutable BEFORE UPDATE OR DELETE ON public."DeliveryPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_handover_immutable BEFORE UPDATE OR DELETE ON public."DeliveryCashHandover" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_remittance_immutable BEFORE UPDATE OR DELETE ON public."DeliveryCodRemittance" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();

CREATE FUNCTION public.igo_invoice_line_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryParcel" p JOIN public."DeliveryInvoice" i ON i.id=NEW."invoiceId" JOIN public."DeliveryBillingCycle" c ON c.id=i."cycleId"
 WHERE p.id=NEW."parcelId" AND p.state='DELIVERED' AND p."partnerId"=i."partnerId" AND c."partnerId"=i."partnerId" AND p."deliveredAt"<=c."cutoffAt" AND p.fee=NEW.amount)
 THEN RAISE EXCEPTION 'Only eligible delivered packages at their frozen fee can be invoiced'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_line_eligible BEFORE INSERT ON public."DeliveryInvoiceLine" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_line_guard();

CREATE FUNCTION public.igo_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' AND (NEW.status<>'PENDING' OR NEW."confirmedAmount"<>0) THEN RAISE EXCEPTION 'New bank evidence must be pending'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'PENDING' THEN RAISE EXCEPTION 'Reviewed payments are immutable'; END IF;
  IF (NEW."partnerId",NEW."invoiceId",NEW."receiptId",NEW.amount,NEW."bankReference") IS DISTINCT FROM (OLD."partnerId",OLD."invoiceId",OLD."receiptId",OLD.amount,OLD."bankReference") THEN RAISE EXCEPTION 'Payment evidence is immutable'; END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryInvoice" i JOIN public."DeliveryReceipt" r ON r.id=NEW."receiptId" WHERE i.id=NEW."invoiceId" AND i."partnerId"=NEW."partnerId" AND r."partnerId"=NEW."partnerId" AND r.ready) THEN RAISE EXCEPTION 'Payment, invoice and receipt must belong to the same partner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_payment_guard BEFORE INSERT OR UPDATE ON public."DeliveryPayment" FOR EACH ROW EXECUTE FUNCTION public.igo_payment_guard();

CREATE FUNCTION public.igo_allocation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public."DeliveryPayment" p WHERE p.id=NEW."paymentId" AND p."invoiceId"=NEW."invoiceId" AND p.status IN ('PARTIAL','CONFIRMED') AND p."confirmedAmount"=NEW.amount) THEN RAISE EXCEPTION 'Only verified transfers can credit their own invoice'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_allocation_guard BEFORE INSERT ON public."DeliveryPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION public.igo_allocation_guard();

CREATE FUNCTION public.igo_invoice_reconcile() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target uuid; inv public."DeliveryInvoice"; line_total bigint; paid_total bigint;
BEGIN
 IF TG_TABLE_NAME='DeliveryInvoice' THEN target:=NEW.id; ELSE target:=NEW."invoiceId"; END IF;
 SELECT * INTO inv FROM public."DeliveryInvoice" WHERE id=target;
 SELECT coalesce(sum(amount),0) INTO line_total FROM public."DeliveryInvoiceLine" WHERE "invoiceId"=target;
 SELECT coalesce(sum(amount),0) INTO paid_total FROM public."DeliveryPaymentAllocation" WHERE "invoiceId"=target;
 IF inv.total<>line_total OR inv.paid<>paid_total THEN RAISE EXCEPTION 'Invoice lines and confirmed payments must reconcile'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER delivery_invoice_reconciled AFTER INSERT OR UPDATE ON public."DeliveryInvoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_reconcile();
CREATE CONSTRAINT TRIGGER delivery_line_reconciled AFTER INSERT ON public."DeliveryInvoiceLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_reconcile();
CREATE CONSTRAINT TRIGGER delivery_allocation_reconciled AFTER INSERT ON public."DeliveryPaymentAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_reconcile();

-- Database-native scheduling: no HTTP origin, public key or web cron required.
CREATE FUNCTION public.igo_invoice_due(p_now timestamptz DEFAULT clock_timestamp()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE partner public."DeliveryPartner"; cutoff timestamptz; day text; cycle uuid; inv uuid;
 parcel_ids uuid[]; amount integer; cycles integer:=0; made integer:=0; partner_cycles integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(819201016) THEN RETURN jsonb_build_object('busy',true); END IF;
 FOR partner IN SELECT * FROM public."DeliveryPartner" WHERE "nextInvoiceAt"<=p_now ORDER BY "nextInvoiceAt" LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  partner_cycles:=0; cutoff:=partner."nextInvoiceAt";
  WHILE cutoff<=p_now AND partner_cycles<31 LOOP
   day:=to_char(cutoff AT TIME ZONE 'Indian/Maldives','YYYY-MM-DD');
   cycle:=NULL;
   INSERT INTO public."DeliveryBillingCycle" (id,"partnerId","localDate","cutoffAt") VALUES (gen_random_uuid(),partner.id,day,cutoff)
    ON CONFLICT ("partnerId","localDate") DO NOTHING RETURNING id INTO cycle;
   IF cycle IS NOT NULL THEN
    SELECT array_agg(eligible.id),sum(eligible.fee)::integer INTO parcel_ids,amount FROM
     (SELECT p.id,p.fee FROM public."DeliveryParcel" p WHERE p."partnerId"=partner.id AND p.state='DELIVERED' AND p."deliveredAt"<=cutoff
      AND NOT EXISTS (SELECT 1 FROM public."DeliveryInvoiceLine" l WHERE l."parcelId"=p.id) FOR UPDATE OF p) eligible;
    IF parcel_ids IS NOT NULL THEN
     inv:=gen_random_uuid();
     INSERT INTO public."DeliveryInvoice" (id,"publicId","partnerId","cycleId",total) VALUES
      (inv,'INV-'||replace(day,'-','')||'-'||lpad(nextval('public.igo_delivery_invoice_number')::text,6,'0'),partner.id,cycle,amount);
     INSERT INTO public."DeliveryInvoiceLine" (id,"invoiceId","parcelId",amount) SELECT gen_random_uuid(),inv,id,fee FROM public."DeliveryParcel" WHERE id=ANY(parcel_ids);
     INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail) VALUES
      (gen_random_uuid(),'system:invoice-scheduler','SYSTEM','INVOICE_ISSUED',partner.id,inv::text,jsonb_build_object('total',amount,'packageCount',cardinality(parcel_ids),'cutoff',cutoff));
     INSERT INTO public."DeliveryNotification" (id,recipient,title,message) SELECT gen_random_uuid(),a."clerkUserId",'Daily delivery invoice','An invoice for delivered packages is ready. Previous unpaid invoices remain outstanding.' FROM public."DeliveryAccount" a WHERE a.id=partner."accountId";
     made:=made+1;
    END IF;
   END IF;
   cutoff:=cutoff+interval '1 day'; cycles:=cycles+1; partner_cycles:=partner_cycles+1;
  END LOOP;
  UPDATE public."DeliveryPartner" SET "nextInvoiceAt"=cutoff WHERE id=partner.id;
 END LOOP;
 RETURN jsonb_build_object('cycles',cycles,'invoices',made,'checkedAt',p_now);
END $$;
REVOKE ALL ON FUNCTION public.igo_invoice_due(timestamptz) FROM PUBLIC;

DO $$ DECLARE item text; client_role text;
BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Delivery%' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',item,client_role); END IF;
  END LOOP;
 END LOOP;
END $$;
