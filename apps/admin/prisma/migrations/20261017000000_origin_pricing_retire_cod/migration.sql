BEGIN;
-- Preserve historical money records privately. No operational API or ORM model
-- exposes these retired tables; no historical payment or receipt is deleted.
CREATE TABLE public."DeliveryRetiredCodParcel" (
 "parcelId" uuid PRIMARY KEY REFERENCES public."DeliveryParcel"(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL, "archivedAt" timestamptz(3) NOT NULL DEFAULT now()
);
INSERT INTO public."DeliveryRetiredCodParcel" ("parcelId",snapshot)
 SELECT id,jsonb_build_object('codAmount',"codAmount",'codCollectedAt',"codCollectedAt",'handoverId',"handoverId",'remittanceId',"remittanceId")
 FROM public."DeliveryParcel" WHERE "codAmount">0 OR "handoverId" IS NOT NULL OR "remittanceId" IS NOT NULL;
DROP TRIGGER delivery_cash_parcels_reconciled ON public."DeliveryParcel";
DROP TRIGGER delivery_handover_reconciled ON public."DeliveryCashHandover";
DROP TRIGGER delivery_remittance_reconciled ON public."DeliveryCodRemittance";
DROP TRIGGER delivery_cod_receipt_issue ON public."DeliveryCodRemittance";
DROP FUNCTION public.igo_cash_reconcile();
DROP FUNCTION public.igo_cod_receipt_issue();
DROP FUNCTION public.igo_cod_receipt_snapshot(uuid);
CREATE FUNCTION public.igo_retired_money_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
 BEGIN RAISE EXCEPTION 'Retired financial history is read-only'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['DeliveryRetiredCodParcel','DeliveryCashHandover','DeliveryCodRemittance','DeliveryCodReceipt'] LOOP
  EXECUTE format('CREATE TRIGGER delivery_retired_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.igo_retired_money_guard()',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.igo_retired_money_guard() FROM PUBLIC, anon, authenticated;
ALTER TABLE public."DeliveryParcel" DROP CONSTRAINT delivery_parcel_money;
ALTER TABLE public."DeliveryParcel" DROP COLUMN "codAmount", DROP COLUMN "codCollectedAt", DROP COLUMN "handoverId", DROP COLUMN "remittanceId";
ALTER TABLE public."DeliveryParcel" ADD CONSTRAINT delivery_parcel_money CHECK(fee>0);

ALTER TABLE public."DeliveryPartner" ADD COLUMN "operatingLocation" text;
ALTER TABLE public."DeliveryPartnerApplication" ADD COLUMN "operatingLocation" text;
-- Generic Hulhumalé addresses are deliberately left for admin review: the phase
-- affects the price and cannot be inferred safely from the old area field.
UPDATE public."DeliveryPartner" SET "operatingLocation"=CASE "pickupArea" WHEN 'Malé' THEN 'MALE' WHEN 'Hulhumalé Phase 1' THEN 'HULHUMALE_1' WHEN 'Hulhumalé Phase 2' THEN 'HULHUMALE_2' END;
UPDATE public."DeliveryPartnerApplication" SET "operatingLocation"=CASE "pickupArea" WHEN 'Malé' THEN 'MALE' WHEN 'Hulhumalé Phase 1' THEN 'HULHUMALE_1' WHEN 'Hulhumalé Phase 2' THEN 'HULHUMALE_2' END;
ALTER TABLE public."DeliveryPartner" ADD CONSTRAINT delivery_partner_origin CHECK("operatingLocation" IN ('MALE','HULHUMALE_1','HULHUMALE_2'));
ALTER TABLE public."DeliveryPartnerApplication" ADD CONSTRAINT delivery_application_origin CHECK("operatingLocation" IN ('MALE','HULHUMALE_1','HULHUMALE_2'));
CREATE TABLE public."DeliveryDestination" (code text PRIMARY KEY, label text NOT NULL, active boolean NOT NULL DEFAULT true,
 CONSTRAINT delivery_destination_code CHECK(code ~ '^[A-Z][A-Z0-9_]{1,39}$'), CONSTRAINT delivery_destination_label CHECK(length(trim(label)) BETWEEN 2 AND 100));
INSERT INTO public."DeliveryDestination" (code,label) VALUES ('MALE','Malé'),('HULHUMALE_1','Hulhumalé Phase 1'),('HULHUMALE_2','Hulhumalé Phase 2'),('BOAT','Boat');
ALTER TABLE public."DeliveryRate" DROP CONSTRAINT "DeliveryRate_pkey";
ALTER TABLE public."DeliveryRate" ALTER COLUMN zone TYPE text USING zone::text;
ALTER TABLE public."DeliveryRate" ADD COLUMN origin text;
DELETE FROM public."DeliveryRate";
INSERT INTO public."DeliveryRate" (origin,zone,fee,"updatedAt") VALUES
 ('MALE','MALE',2500,now()),('MALE','HULHUMALE_1',3500,now()),('MALE','HULHUMALE_2',4500,now()),('MALE','BOAT',2500,now()),
 ('HULHUMALE_1','MALE',3500,now()),('HULHUMALE_1','HULHUMALE_1',2500,now()),('HULHUMALE_1','HULHUMALE_2',3000,now()),('HULHUMALE_1','BOAT',3500,now()),
 ('HULHUMALE_2','MALE',4500,now()),('HULHUMALE_2','HULHUMALE_1',3000,now()),('HULHUMALE_2','HULHUMALE_2',2500,now()),('HULHUMALE_2','BOAT',4500,now());
ALTER TABLE public."DeliveryRate" ALTER COLUMN origin SET NOT NULL;
ALTER TABLE public."DeliveryRate" ADD PRIMARY KEY(origin,zone), ADD CONSTRAINT delivery_rate_origin CHECK(origin IN ('MALE','HULHUMALE_1','HULHUMALE_2')),
 ADD CONSTRAINT "DeliveryRate_zone_fkey" FOREIGN KEY(zone) REFERENCES public."DeliveryDestination"(code) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Replace the guard before changing existing rows: old charges stay untouched.
DROP TRIGGER delivery_parcel_guard ON public."DeliveryParcel";
ALTER TABLE public."DeliveryParcel" ALTER COLUMN zone TYPE text USING zone::text;
ALTER TABLE public."DeliveryParcel" ADD COLUMN origin text, ADD COLUMN "destinationLabel" text;
UPDATE public."DeliveryParcel" p SET "destinationLabel"=d.label FROM public."DeliveryDestination" d WHERE d.code=p.zone;
ALTER TABLE public."DeliveryParcel" ALTER COLUMN "destinationLabel" SET NOT NULL;
ALTER TABLE public."DeliveryParcel" ADD CONSTRAINT delivery_parcel_origin CHECK(origin IN ('MALE','HULHUMALE_1','HULHUMALE_2')),
 ADD CONSTRAINT "DeliveryParcel_zone_fkey" FOREIGN KEY(zone) REFERENCES public."DeliveryDestination"(code) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP TYPE public."DeliveryZone";
CREATE OR REPLACE FUNCTION public.igo_parcel_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE identity text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'REGISTERED' OR NEW."pickedUpAt" IS NOT NULL OR NEW."pickedUpBy" IS NOT NULL OR NEW."deliveredAt" IS NOT NULL OR NEW."deliveredBy" IS NOT NULL THEN RAISE EXCEPTION 'Registration is not pickup or delivery'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."DeliveryPartner" p JOIN public."DeliveryRate" r ON r.origin=p."operatingLocation" AND r.zone=NEW.zone JOIN public."DeliveryDestination" d ON d.code=r.zone WHERE p.id=NEW."partnerId" AND NEW.origin=p."operatingLocation" AND NEW.fee=r.fee AND NEW."destinationLabel"=d.label AND d.active) THEN RAISE EXCEPTION 'Package requires a configured origin and destination rate'; END IF;
 ELSE
  IF (NEW."partnerId",NEW."publicId",NEW."externalReference",NEW.fee,NEW.origin,NEW.zone,NEW."destinationLabel",NEW.destination,NEW."registeredAt") IS DISTINCT FROM (OLD."partnerId",OLD."publicId",OLD."externalReference",OLD.fee,OLD.origin,OLD.zone,OLD."destinationLabel",OLD.destination,OLD."registeredAt") THEN RAISE EXCEPTION 'Package identity, route and quoted fee are immutable'; END IF;
  IF OLD.state IN ('DELIVERED','CANCELLED') AND NEW.state<>OLD.state THEN RAISE EXCEPTION 'Final package state is immutable'; END IF;
  IF NEW.state<>OLD.state AND NOT ((OLD.state='REGISTERED' AND NEW.state IN ('PICKED_UP','CANCELLED')) OR (OLD.state='PICKED_UP' AND NEW.state='DELIVERED')) THEN RAISE EXCEPTION 'Invalid delivery transition'; END IF;
  IF OLD."pickedUpAt" IS NOT NULL AND (NEW."driverId",NEW."pickedUpAt",NEW."pickedUpBy") IS DISTINCT FROM (OLD."driverId",OLD."pickedUpAt",OLD."pickedUpBy") THEN RAISE EXCEPTION 'Physical pickup attribution is immutable'; END IF;
  IF OLD."deliveredAt" IS NOT NULL AND (NEW."deliveredAt",NEW."deliveredBy") IS DISTINCT FROM (OLD."deliveredAt",OLD."deliveredBy") THEN RAISE EXCEPTION 'Delivery attribution is immutable'; END IF;
 END IF;
 IF NEW.state IN ('PICKED_UP','DELIVERED') THEN
  SELECT "clerkUserId" INTO identity FROM public."DeliveryAccount" WHERE id=NEW."driverId" AND role='DRIVER';
  IF identity IS NULL OR NEW."pickedUpBy" IS DISTINCT FROM identity OR NEW."pickedUpAt" IS NULL OR NEW."pickedUpAt"<NEW."registeredAt" THEN RAISE EXCEPTION 'Physical receipt requires assigned driver identity and timestamp'; END IF;
 END IF;
 IF NEW.state='DELIVERED' AND (NEW."deliveredBy" IS DISTINCT FROM identity OR NEW."deliveredAt" IS NULL OR NEW."deliveredAt"<NEW."pickedUpAt") THEN RAISE EXCEPTION 'Delivery requires driver attribution'; END IF;
 IF NEW.state IN ('REGISTERED','CANCELLED') AND (NEW."pickedUpAt" IS NOT NULL OR NEW."pickedUpBy" IS NOT NULL OR NEW."deliveredAt" IS NOT NULL OR NEW."deliveredBy" IS NOT NULL) THEN RAISE EXCEPTION 'Unpicked packages cannot have delivery milestones'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_parcel_guard BEFORE INSERT OR UPDATE ON public."DeliveryParcel" FOR EACH ROW EXECUTE FUNCTION public.igo_parcel_guard();
ALTER TABLE public."DeliveryDestination" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DeliveryDestination" FROM PUBLIC, anon, authenticated;
COMMIT;
