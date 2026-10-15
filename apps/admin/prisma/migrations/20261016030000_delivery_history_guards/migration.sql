CREATE TRIGGER delivery_parcel_no_delete BEFORE DELETE ON public."DeliveryParcel" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE FUNCTION public.igo_invoice_header_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.id,NEW."publicId",NEW."partnerId",NEW."cycleId",NEW.total,NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."publicId",OLD."partnerId",OLD."cycleId",OLD.total,OLD."createdAt") THEN RAISE EXCEPTION 'Invoice identity, issued charges and cycle are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_invoice_header_immutable BEFORE UPDATE ON public."DeliveryInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_invoice_header_guard();
REVOKE ALL ON FUNCTION public.igo_invoice_header_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.igo_invoice_due(p_now timestamptz DEFAULT clock_timestamp()) RETURNS jsonb
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
      (inv,'INV-'||replace(day,'-','')||'-'||to_char(nextval('public.igo_delivery_invoice_number'),'FM000000000000'),partner.id,cycle,amount);
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
