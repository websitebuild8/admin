ALTER TABLE public."DeliveryNotification" ADD COLUMN "targetType" TEXT, ADD COLUMN "targetId" UUID;
ALTER TABLE public."DeliveryNotification" ADD CONSTRAINT "DeliveryNotification_target_check" CHECK ((
  ("targetType" IS NULL AND "targetId" IS NULL) OR
  ("targetType" IN ('INVOICE','PAYMENT','PACKAGE','ACCOUNT','APPLICATION') AND "targetId" IS NOT NULL) OR
  ("targetType" IN ('COLLECTION','SETTINGS') AND "targetId" IS NULL)
) IS TRUE);
-- Only explicit existing relations can safely identify historical messages.
UPDATE public."DeliveryNotification" n SET "targetType"='INVOICE', "targetId"=d."invoiceId",workspace='PARTNER'
FROM public."DeliveryInvoiceDispatch" d WHERE d."notificationId"=n.id;
UPDATE public."DeliveryNotification" n SET "targetType"='INVOICE', "targetId"=d."invoiceId",workspace='PARTNER'
FROM public."DeliveryPaidInvoiceDispatch" d WHERE d."notificationId"=n.id;

-- Queue in the same transaction, including notifications emitted by SQL invoicing.
-- driverId is the historical column name; it references either operational account.
CREATE FUNCTION public.igo_queue_workspace_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public."DeliveryPushMessage" (id,"notificationId","subscriptionId")
 SELECT gen_random_uuid(),NEW.id,s.id FROM public."DeliveryPushSubscription" s
 JOIN public."DeliveryAccount" a ON a.id=s."driverId"
 WHERE a."clerkUserId"=NEW.recipient AND a.status='APPROVED' AND a.role IN ('PARTNER','DRIVER')
 AND (NEW.workspace='ACCOUNT' OR NEW.workspace=a.role::text)
 ON CONFLICT ("notificationId","subscriptionId") DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.igo_queue_workspace_push() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER igo_workspace_notification_push AFTER INSERT ON public."DeliveryNotification"
 FOR EACH ROW EXECUTE FUNCTION public.igo_queue_workspace_push();

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
     INSERT INTO public."DeliveryNotification" (id,recipient,title,message,workspace,"targetType","targetId") SELECT gen_random_uuid(),a."clerkUserId",'Daily delivery invoice','An invoice for delivered packages is ready. Previous unpaid invoices remain outstanding.','PARTNER','INVOICE',inv FROM public."DeliveryAccount" a WHERE a.id=partner."accountId";
     made:=made+1;
    END IF;
   END IF;
   cutoff:=cutoff+interval '1 day'; cycles:=cycles+1; partner_cycles:=partner_cycles+1;
  END LOOP;
  UPDATE public."DeliveryPartner" SET "nextInvoiceAt"=cutoff WHERE id=partner.id;
 END LOOP;
 RETURN jsonb_build_object('cycles',cycles,'invoices',made,'checkedAt',p_now);
END $$;
