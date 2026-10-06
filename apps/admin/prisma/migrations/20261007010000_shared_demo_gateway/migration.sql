CREATE TABLE "DemoSession" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DemoSession_keyHash_key" ON "DemoSession"("keyHash");
CREATE INDEX "DemoSession_ownerClerkId_createdAt_idx" ON "DemoSession"("ownerClerkId", "createdAt");
ALTER TABLE "DemoSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DemoSession" FROM PUBLIC, anon, authenticated;
