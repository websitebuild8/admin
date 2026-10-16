CREATE TABLE public."DeliveryCodReceipt" (
  "id" UUID PRIMARY KEY REFERENCES public."DeliveryCodRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "snapshot" JSONB NOT NULL CHECK (jsonb_typeof("snapshot")='object' AND "snapshot"->>'version'='1'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."DeliveryCodReceipt" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "DeliveryParcel_remittanceId_idx" ON public."DeliveryParcel"("remittanceId");
REVOKE ALL ON public."DeliveryCodReceipt" FROM PUBLIC, anon, authenticated;

-- Build the document from the ledger, never from client-supplied amounts.
CREATE FUNCTION public.igo_cod_receipt_snapshot(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public."DeliveryCodRemittance"; details jsonb; collected bigint; items jsonb;
BEGIN
 SELECT * INTO r FROM public."DeliveryCodRemittance" WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'COD payout does not exist'; END IF;
 SELECT sum(p."codAmount"), jsonb_agg(jsonb_build_object(
   'id',p.id,'publicId',p."publicId",'externalReference',p."externalReference",
   'recipientName',p."recipientName",'zone',p.zone,'amount',p."codAmount",'deliveredAt',p."deliveredAt"
 ) ORDER BY p."publicId",p.id) INTO collected,items FROM public."DeliveryParcel" p WHERE p."remittanceId"=r.id;
 IF collected IS NULL OR collected<>r.amount THEN RAISE EXCEPTION 'COD receipt must reconcile to the recorded payout'; END IF;
 SELECT jsonb_build_object(
   'version',1,'id',r.id,'number','COD-'||upper(r.id::text),'reference',r.reference,
   'amount',r.amount,'recordedAt',r."createdAt",'currency','MVR',
   'issuer',jsonb_build_object('brand','iGO Delivery','legalName',coalesce(s."businessLegalName",''),'registrationNumber',coalesce(s."registrationNumber",''),'supportPhone',coalesce(s."supportPhone",''),'supportEmail',coalesce(s."supportEmail",'')),
   'partner',jsonb_build_object('id',p.id,'businessName',p."businessName",'address',p."pickupAddress",'area',p."pickupArea",'contactName',a.name,'phone',a.phone),
   'lines',items
 ) INTO details FROM public."DeliveryPartner" p JOIN public."DeliveryAccount" a ON a.id=p."accountId"
 LEFT JOIN public."DeliverySettings" s ON s.id='default' WHERE p.id=r."partnerId";
 RETURN details;
END $$;
REVOKE ALL ON FUNCTION public.igo_cod_receipt_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.igo_cod_receipt_issue() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public."DeliveryCodReceipt" (id,snapshot) VALUES (NEW.id,public.igo_cod_receipt_snapshot(NEW.id));
 INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail)
 VALUES (gen_random_uuid(),NEW."verifiedBy",'ADMIN','COD_RECEIPT_ISSUED',NEW."partnerId",NEW.id::text,jsonb_build_object('amount',NEW.amount,'reference',NEW.reference));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.igo_cod_receipt_issue() FROM PUBLIC, anon, authenticated;
-- The payout header is inserted before package links. Issue the document only
-- when the whole transaction is ready to commit and all lines can be frozen.
CREATE CONSTRAINT TRIGGER delivery_cod_receipt_issue AFTER INSERT ON public."DeliveryCodRemittance"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_cod_receipt_issue();

-- Historic payouts receive a document now, preserving their original payment
-- timestamp and using business profile details captured at this issuance time.
INSERT INTO public."DeliveryCodReceipt" (id,snapshot)
 SELECT r.id,public.igo_cod_receipt_snapshot(r.id) FROM public."DeliveryCodRemittance" r;
INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail)
 SELECT gen_random_uuid(),'system:cod-receipt-migration','SYSTEM','COD_RECEIPT_ISSUED',r."partnerId",r.id::text,jsonb_build_object('amount',r.amount,'reference',r.reference,'historic',true)
 FROM public."DeliveryCodRemittance" r;
CREATE TRIGGER delivery_cod_receipt_immutable BEFORE UPDATE OR DELETE ON public."DeliveryCodReceipt"
 FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
