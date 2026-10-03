-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "primaryRole" TEXT;

-- AlterTable
ALTER TABLE "RoleApplication" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingPickupAddress" JSONB,
ADD COLUMN     "pickupAddress" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressSnapshot" JSONB,
ADD COLUMN     "lineItems" JSONB,
ADD COLUMN     "pickupAddress" JSONB,
ADD COLUMN     "publicId" TEXT;

-- CreateTable
CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutQuote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MVR',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Created',
    "checkoutUrl" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedAddress_profileId_kind_key" ON "SavedAddress"("profileId", "kind");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_available_idx" ON "MenuItem"("restaurantId", "available");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcceptance_profileId_version_key" ON "PolicyAcceptance"("profileId", "version");

-- CreateIndex
CREATE INDEX "CheckoutQuote_customerId_createdAt_idx" ON "CheckoutQuote"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_quoteId_key" ON "PaymentAttempt"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_transactionId_key" ON "PaymentAttempt"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_orderId_key" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicId_key" ON "Order"("publicId");

-- AddForeignKey
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CheckoutQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep all new business data server-only, including consent and payment records.
DO $$
DECLARE table_name text; client_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['SavedAddress','MenuItem','PolicyAcceptance','CheckoutQuote','PaymentAttempt'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',table_name);
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',table_name,client_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_positive_price" CHECK ("price" > 0);
ALTER TABLE "CheckoutQuote" ADD CONSTRAINT "CheckoutQuote_positive_amount" CHECK ("amount" > 0 AND "currency" = 'MVR');
