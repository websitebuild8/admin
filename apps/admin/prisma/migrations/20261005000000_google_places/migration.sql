ALTER TABLE "SavedAddress" ADD COLUMN "google" JSONB;
CREATE TABLE "MapUsageBucket" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MapUsageBucket_expiresAt_idx" ON "MapUsageBucket"("expiresAt");
ALTER TABLE "MapUsageBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MapUsageBucket" FROM anon, authenticated;

-- Remove only expired Google-derived entrance coordinates, retaining user
-- supplied order/account details and permanently permitted Place IDs.
CREATE FUNCTION public.igo_expired_google_address(value jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT COALESCE((value->'google'->>'expiresAt')::timestamptz <= now(), false);
$$;
CREATE FUNCTION public.igo_prune_google_content() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM public."SavedAddress" WHERE public.igo_expired_google_address(jsonb_build_object('google', "google"));
  UPDATE public."Restaurant" SET "pickupAddress" = NULL, "location" = NULL, "acceptingOrders" = false
    WHERE public.igo_expired_google_address("pickupAddress");
  UPDATE public."Restaurant" SET "pendingPickupAddress" = NULL WHERE public.igo_expired_google_address("pendingPickupAddress");
  UPDATE public."Order" SET "pickupAddress" = NULL WHERE public.igo_expired_google_address("pickupAddress");
  UPDATE public."Order" SET "addressSnapshot" = NULL, "destination" = NULL WHERE public.igo_expired_google_address("addressSnapshot");
  UPDATE public."CheckoutQuote" SET "snapshot" = "snapshot" - 'pickup' WHERE public.igo_expired_google_address("snapshot"->'pickup');
  UPDATE public."CheckoutQuote" SET "snapshot" = "snapshot" - 'destination' WHERE public.igo_expired_google_address("snapshot"->'destination');
  DELETE FROM public."MapUsageBucket" WHERE "expiresAt" < now();
END;
$$;
REVOKE ALL ON FUNCTION public.igo_expired_google_address(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.igo_prune_google_content() FROM PUBLIC, anon, authenticated;
-- Supabase Cron may need enabling in the dashboard first. The API fails closed
-- until this job is installed; see docs/google-maps-setup.md.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('igo-google-content-prune', '17 * * * *', 'SELECT public.igo_prune_google_content();');
  END IF;
END $$;
