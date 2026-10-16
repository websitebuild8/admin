CREATE TABLE "DeliveryPushSubscription" (
  "id" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryPushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryPushSubscription_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeliveryPushSubscription_endpoint_key" ON "DeliveryPushSubscription"("endpoint");
CREATE INDEX "DeliveryPushSubscription_driverId_idx" ON "DeliveryPushSubscription"("driverId");
CREATE TABLE "DeliveryPushMessage" (
  "id" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryPushMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryPushMessage_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "DeliveryNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryPushMessage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "DeliveryPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryPushMessage_state_check" CHECK ("state" IN ('PENDING','SENT','FAILED','DISCARDED')),
  CONSTRAINT "DeliveryPushMessage_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "DeliveryPushMessage_notificationId_subscriptionId_key" ON "DeliveryPushMessage"("notificationId","subscriptionId");
CREATE INDEX "DeliveryPushMessage_state_nextAttemptAt_leaseUntil_idx" ON "DeliveryPushMessage"("state","nextAttemptAt","leaseUntil");
ALTER TABLE "DeliveryPushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryPushMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DeliveryPushSubscription", "DeliveryPushMessage" FROM PUBLIC, anon, authenticated;
