ALTER TABLE "Restaurant" ADD COLUMN "clerkUserId" TEXT, ADD COLUMN "location" JSONB;
ALTER TABLE "Rider" ADD COLUMN "clerkUserId" TEXT, ADD COLUMN "location" JSONB;
ALTER TABLE "Order" ADD COLUMN "workflow" JSONB, ADD COLUMN "destination" JSONB;
CREATE UNIQUE INDEX "Restaurant_clerkUserId_key" ON "Restaurant"("clerkUserId");
CREATE UNIQUE INDEX "Rider_clerkUserId_key" ON "Rider"("clerkUserId");
CREATE TABLE "Notification" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "recipient" TEXT NOT NULL, "text" TEXT NOT NULL, "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Notification_recipient_time_idx" ON "Notification"("recipient", "time");
