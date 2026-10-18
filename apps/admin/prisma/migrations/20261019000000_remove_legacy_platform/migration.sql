BEGIN;

-- Current delivery forms use this shared table for rate limiting. Retain its
-- physical name for compatibility with the published site during deployment;
-- the Prisma model is now DeliveryRequestBucket. Remove obsolete map counters.
CREATE TABLE IF NOT EXISTS public."MapUsageBucket" (
  key text PRIMARY KEY, count integer NOT NULL, "expiresAt" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "MapUsageBucket_expiresAt_idx" ON public."MapUsageBucket"("expiresAt");
DELETE FROM public."MapUsageBucket" WHERE key NOT LIKE 'delivery:%';
ALTER TABLE public."MapUsageBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."MapUsageBucket" FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.igo_prune_delivery_requests() RETURNS void
LANGUAGE sql SET search_path='' AS $$
  DELETE FROM public."MapUsageBucket" WHERE "expiresAt" < clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.igo_prune_delivery_requests() FROM PUBLIC,anon,authenticated;

-- Stop only the retired Google Places cleanup. Current invoicing/push jobs and
-- their extensions, credentials and tables remain untouched. QA schemas never
-- change real scheduler jobs.
DO $$ DECLARE old_job bigint; BEGIN
  IF current_schema() = 'public' AND current_schema() !~ '^igo_qa_' AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    FOR old_job IN SELECT jobid FROM cron.job WHERE jobname='igo-google-content-prune' LOOP
      PERFORM cron.unschedule(old_job);
      DELETE FROM cron.job_run_details WHERE jobid=old_job;
    END LOOP;
    PERFORM cron.schedule('igo-delivery-request-prune','17 * * * *','SELECT public.igo_prune_delivery_requests();');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.igo_prune_google_content();
DROP FUNCTION IF EXISTS public.igo_expired_google_address(jsonb);

DO $$ BEGIN
  IF current_schema() = 'public' AND current_schema() !~ '^igo_qa_' AND to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS igo_menu_images_objects_server_only ON storage.objects;
    DROP POLICY IF EXISTS igo_menu_images_bucket_server_only ON storage.buckets;
  END IF;
END $$;

-- Explicit list, deliberately without CASCADE. An unexpected external dependency
-- aborts the transaction rather than silently removing a current feature.
DROP TABLE IF EXISTS
  public."PaymentAttempt", public."CheckoutQuote", public."PolicyAcceptance",
  public."SavedAddress", public."RoleApplication", public."Profile",
  public."MenuItem", public."MenuImage", public."RefundReview",
  public."SupportCase", public."Order", public."Restaurant", public."Rider",
  public."Notification", public."AuditEvent", public."ServiceSettings",
  public."DemoSession",
  public."DeliveryRetiredCodParcel", public."DeliveryCodReceipt",
  public."DeliveryCodRemittance", public."DeliveryCashHandover";
DROP FUNCTION IF EXISTS public.igo_retired_money_guard();

-- The permanent-deletion feature now traverses only the active delivery model.
CREATE OR REPLACE FUNCTION public.igo_deletion_allows(t text, r jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE permit text; key text;
BEGIN
  IF t NOT IN ('DeliveryParcel','DeliveryParcelUnassign','DeliveryInvoice','DeliveryInvoiceLine','DeliveryPayment','DeliveryPaymentAllocation','DeliveryBillingCycle','DeliveryInvoiceDispatch','DeliveryPaidInvoice','DeliveryPaidInvoiceDispatch','DeliveryInvoiceEvent','DeliveryAccount','DeliveryPartner') THEN RETURN false; END IF;
  permit:=current_setting('igo.deletion_id',true);
  IF permit IS NULL OR permit='' THEN RETURN false; END IF;
  key:=CASE WHEN t IN ('DeliveryInvoiceDispatch','DeliveryPaidInvoice','DeliveryPaidInvoiceDispatch') THEN r->>'invoiceId' ELSE r->>'id' END;
  RETURN EXISTS(SELECT 1 FROM public."DeliveryDeletion" d WHERE d.id::text=permit AND d."transactionId"=txid_current() AND (d.manifest->t) ? key);
END $$;
REVOKE ALL ON FUNCTION public.igo_deletion_allows(text,jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
