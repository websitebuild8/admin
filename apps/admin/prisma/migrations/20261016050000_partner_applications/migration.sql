CREATE TABLE public."DeliveryPartnerApplication" (
  "id" UUID PRIMARY KEY,
  "publicId" TEXT NOT NULL UNIQUE,
  "requestKey" UUID NOT NULL UNIQUE,
  "digest" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE CHECK ("email" = lower(btrim("email"))),
  "ownerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "businessType" TEXT NOT NULL CHECK ("businessType" IN ('FACEBOOK','INSTAGRAM','BUSINESS')),
  "pageUrl" TEXT NOT NULL,
  "pickupAddress" TEXT NOT NULL,
  "pickupArea" TEXT NOT NULL CHECK ("pickupArea" IN ('Malé','Hulhumalé')),
  "dailyDeliveries" INTEGER NOT NULL CHECK ("dailyDeliveries" BETWEEN 1 AND 10000),
  "logoPath" TEXT NOT NULL,
  "logoReady" BOOLEAN NOT NULL DEFAULT false,
  "status" public."DeliveryReview" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "invitationId" TEXT UNIQUE,
  "invitationState" TEXT NOT NULL DEFAULT 'NOT_SENT' CHECK ("invitationState" IN ('NOT_SENT','SENDING','SENT','FAILED')),
  "invitationLease" UUID,
  "invitationStartedAt" TIMESTAMPTZ(3),
  "invitationSentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "partner_application_review" CHECK ("status" = 'PENDING' OR ("reviewedAt" IS NOT NULL AND "reviewedBy" IS NOT NULL)),
  CONSTRAINT "partner_application_logo_before_approval" CHECK ("status" <> 'APPROVED' OR "logoReady")
);
CREATE INDEX "DeliveryPartnerApplication_status_createdAt_idx" ON public."DeliveryPartnerApplication" ("status", "createdAt");
ALTER TABLE public."DeliveryPartner" ADD COLUMN "applicationId" UUID UNIQUE REFERENCES public."DeliveryPartnerApplication"("id") ON DELETE RESTRICT;
ALTER TABLE public."DeliveryPartnerApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DeliveryPartnerApplication" FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."DeliveryPartnerApplication" FROM %I',client_role);
    END IF;
  END LOOP;
END $$;
