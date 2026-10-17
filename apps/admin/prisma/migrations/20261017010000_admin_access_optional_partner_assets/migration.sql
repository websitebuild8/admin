BEGIN;
CREATE TABLE public."DeliveryAdminGrant" (
 id uuid PRIMARY KEY,
 "clerkUserId" text NOT NULL UNIQUE CHECK(length(btrim("clerkUserId"))>0),
 email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
 name text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 "grantedBy" text NOT NULL,
 "grantedAt" timestamptz(3) NOT NULL DEFAULT now(),
 "revokedBy" text,
 "revokedAt" timestamptz(3),
 "updatedAt" timestamptz(3) NOT NULL,
 CONSTRAINT delivery_admin_review CHECK((active AND "revokedBy" IS NULL AND "revokedAt" IS NULL) OR (NOT active AND "revokedBy" IS NOT NULL AND "revokedAt" IS NOT NULL))
);
CREATE INDEX "DeliveryAdminGrant_active_grantedAt_idx" ON public."DeliveryAdminGrant"(active,"grantedAt");
CREATE TRIGGER delivery_admin_no_delete BEFORE DELETE ON public."DeliveryAdminGrant" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
ALTER TABLE public."DeliveryAdminGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."DeliveryAdminGrant" FROM PUBLIC, anon, authenticated;

ALTER TABLE public."DeliveryPartnerApplication" ALTER COLUMN "logoPath" DROP NOT NULL, ADD COLUMN "submittedAt" timestamptz(3);
UPDATE public."DeliveryPartnerApplication" SET "submittedAt"="createdAt" WHERE "logoReady";
ALTER TABLE public."DeliveryPartnerApplication" DROP CONSTRAINT partner_application_logo_before_approval;
ALTER TABLE public."DeliveryPartnerApplication" ADD CONSTRAINT partner_application_submitted_before_approval CHECK(status<>'APPROVED' OR ("submittedAt" IS NOT NULL AND ("logoPath" IS NULL OR "logoReady")));
ALTER TABLE public."DeliveryPartnerApplication" ADD CONSTRAINT partner_application_logo_path CHECK(NOT "logoReady" OR "logoPath" IS NOT NULL);
-- Preserve old island records while accepting the explicit phases now collected.
ALTER TABLE public."DeliveryPartnerApplication" DROP CONSTRAINT IF EXISTS "DeliveryPartnerApplication_pickupArea_check";
ALTER TABLE public."DeliveryPartnerApplication" ADD CONSTRAINT partner_application_pickup_area CHECK("pickupArea" IN ('Malé','Hulhumalé','Hulhumalé Phase 1','Hulhumalé Phase 2'));
-- Administrative inbox entries must not appear in a partner/rider workspace
-- simply because the same Clerk identity has both kinds of access.
ALTER TABLE public."DeliveryNotification" ADD COLUMN workspace text NOT NULL DEFAULT 'ACCOUNT'
 CHECK(workspace IN ('ACCOUNT','ADMIN','PARTNER','DRIVER'));
UPDATE public."DeliveryNotification" SET workspace='ADMIN' WHERE title IN ('New partner application','New account application','Bank transfer awaiting review');
COMMIT;
