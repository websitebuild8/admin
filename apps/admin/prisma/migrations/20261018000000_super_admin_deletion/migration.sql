BEGIN;
ALTER TABLE public."DeliveryCommand" ADD COLUMN subjects text[] NOT NULL DEFAULT '{}', ADD COLUMN invalidated boolean NOT NULL DEFAULT false;
CREATE INDEX delivery_command_subjects ON public."DeliveryCommand" USING gin(subjects);
CREATE TABLE public."DeliveryDeletion" (
 id uuid PRIMARY KEY, actor text NOT NULL, kind text NOT NULL CHECK(kind IN ('RIDER','PARTNER','PACKAGE','INVOICE')),
 "targetId" uuid NOT NULL, reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object'), "transactionId" bigint NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE public."DeliveryDeletedFile" (
 id uuid PRIMARY KEY, "deletionId" uuid NOT NULL, bucket text NOT NULL CHECK(bucket IN ('igo-partner-logos','igo-delivery-receipts')),
 path text NOT NULL, attempts integer NOT NULL DEFAULT 0, "lastError" text NOT NULL DEFAULT '', "notBefore" timestamptz(3) NOT NULL DEFAULT now(), "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(bucket,path)
);
ALTER TABLE public."DeliveryDeletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DeliveryDeletedFile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DeliveryDeletion",public."DeliveryDeletedFile" FROM PUBLIC,anon,authenticated;

-- No global trigger bypass. Each deletion permit is limited to this transaction
-- and these exact primary keys. Browser roles cannot create/use a permit.
CREATE FUNCTION public.igo_deletion_allows(t text, r jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE permit text; key text;
BEGIN
 IF t NOT IN ('DeliveryParcel','DeliveryParcelUnassign','DeliveryInvoice','DeliveryInvoiceLine','DeliveryPayment','DeliveryPaymentAllocation','DeliveryBillingCycle','DeliveryInvoiceDispatch','DeliveryPaidInvoice','DeliveryPaidInvoiceDispatch','DeliveryInvoiceEvent','DeliveryRetiredCodParcel','DeliveryCashHandover','DeliveryCodRemittance','DeliveryCodReceipt','DeliveryAccount','DeliveryPartner') THEN RETURN false; END IF;
 permit:=current_setting('igo.deletion_id',true);
 IF permit IS NULL OR permit='' THEN RETURN false; END IF;
 key:=CASE WHEN t IN ('DeliveryInvoiceDispatch','DeliveryPaidInvoice','DeliveryPaidInvoiceDispatch') THEN r->>'invoiceId' WHEN t='DeliveryRetiredCodParcel' THEN r->>'parcelId' ELSE r->>'id' END;
 RETURN EXISTS(SELECT 1 FROM public."DeliveryDeletion" d WHERE d.id::text=permit AND d."transactionId"=txid_current() AND (d.manifest->t) ? key);
END $$;
CREATE OR REPLACE FUNCTION public.igo_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND public.igo_deletion_allows(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Financial and audit history is append-only';
END $$;
CREATE OR REPLACE FUNCTION public.igo_retired_money_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND public.igo_deletion_allows(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Retired financial history is read-only';
END $$;
CREATE TRIGGER delivery_deletion_immutable BEFORE UPDATE OR DELETE ON public."DeliveryDeletion" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_account_no_delete BEFORE DELETE ON public."DeliveryAccount" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_partner_no_delete BEFORE DELETE ON public."DeliveryPartner" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();

-- Deleting a rider may detach completed deliveries, preserving their immutable
-- pickedUpBy/deliveredBy identities and timestamps. In-transit work blocks it.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.igo_parcel_guard()'::regprocedure) INTO definition;
 definition:=replace(definition,E'\nBEGIN\n',E'\nBEGIN\n IF TG_OP=\'UPDATE\' AND OLD.state<>\'PICKED_UP\' AND OLD."driverId" IS NOT NULL AND NEW."driverId" IS NULL AND (to_jsonb(NEW)-\'driverId\')=(to_jsonb(OLD)-\'driverId\') AND public.igo_deletion_allows(\'DeliveryParcelUnassign\',to_jsonb(OLD)) THEN RETURN NEW; END IF;\n');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION public.igo_deletion_allows(text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
