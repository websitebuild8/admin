BEGIN;

-- Admin alerts belong to the administrator identity, independently of optional
-- partner/rider profiles. Existing subscriptions and their queues are retained.
ALTER TABLE public."DeliveryPushSubscription"
  ALTER COLUMN "driverId" DROP NOT NULL,
  ADD COLUMN "adminUserId" TEXT,
  ADD CONSTRAINT "DeliveryPushSubscription_owner_check" CHECK (
    ("driverId" IS NOT NULL AND "adminUserId" IS NULL) OR
    ("driverId" IS NULL AND "adminUserId" IS NOT NULL AND length("adminUserId")>0)
  );
CREATE INDEX "DeliveryPushSubscription_adminUserId_idx" ON public."DeliveryPushSubscription"("adminUserId");

CREATE OR REPLACE FUNCTION public.igo_queue_workspace_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public."DeliveryPushMessage" (id,"notificationId","subscriptionId")
 SELECT gen_random_uuid(),NEW.id,s.id FROM public."DeliveryPushSubscription" s
 LEFT JOIN public."DeliveryAccount" a ON a.id=s."driverId"
 WHERE (s."adminUserId"=NEW.recipient AND NEW.workspace='ADMIN')
 OR (a."clerkUserId"=NEW.recipient AND a.status='APPROVED' AND a.role IN ('PARTNER','DRIVER')
   AND (NEW.workspace='ACCOUNT' OR NEW.workspace=a.role::text))
 ON CONFLICT ("notificationId","subscriptionId") DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.igo_queue_workspace_push() FROM PUBLIC,anon,authenticated;

COMMIT;
