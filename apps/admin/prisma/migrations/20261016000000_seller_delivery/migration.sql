-- CreateEnum
CREATE TYPE "DeliveryRole" AS ENUM ('PARTNER', 'DRIVER');

-- CreateEnum
CREATE TYPE "DeliveryReview" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ParcelState" AS ENUM ('REGISTERED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryZone" AS ENUM ('BOAT', 'MALE', 'HULHUMALE_1', 'HULHUMALE_2');

-- CreateEnum
CREATE TYPE "DeliveryPaymentState" AS ENUM ('PENDING', 'REJECTED', 'PARTIAL', 'CONFIRMED');

-- CreateTable
CREATE TABLE "DeliveryAccount" (
    "id" UUID NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "role" "DeliveryRole" NOT NULL,
    "status" "DeliveryReview" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPartner" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupArea" TEXT NOT NULL,
    "cutoffMinutes" INTEGER NOT NULL DEFAULT 1080,
    "nextInvoiceAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeliveryPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRate" (
    "zone" "DeliveryZone" NOT NULL,
    "fee" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryRate_pkey" PRIMARY KEY ("zone")
);

-- CreateTable
CREATE TABLE "DeliveryParcel" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "externalReference" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "zone" "DeliveryZone" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fee" INTEGER NOT NULL,
    "codAmount" INTEGER NOT NULL DEFAULT 0,
    "state" "ParcelState" NOT NULL DEFAULT 'REGISTERED',
    "driverId" UUID,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMPTZ(3),
    "pickedUpBy" TEXT,
    "deliveredAt" TIMESTAMPTZ(3),
    "deliveredBy" TEXT,
    "codCollectedAt" TIMESTAMPTZ(3),
    "handoverId" UUID,
    "remittanceId" UUID,
    "importId" UUID,

    CONSTRAINT "DeliveryParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryImport" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryBillingCycle" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryBillingCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryInvoice" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "total" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryInvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "DeliveryInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReceipt" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPayment" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "bankReference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "confirmedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "DeliveryPaymentState" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "DeliveryPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCashHandover" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryCashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCodRemittance" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryCodRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCommand" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryActivity" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partnerId" UUID,
    "entityId" TEXT,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNotification" (
    "id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "beneficiary" TEXT NOT NULL DEFAULT '',
    "businessLegalName" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "supportPhone" TEXT NOT NULL DEFAULT '',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAccount_clerkUserId_key" ON "DeliveryAccount"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPartner_accountId_key" ON "DeliveryPartner"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryParcel_publicId_key" ON "DeliveryParcel"("publicId");

-- CreateIndex
CREATE INDEX "DeliveryParcel_partnerId_registeredAt_idx" ON "DeliveryParcel"("partnerId", "registeredAt");

-- CreateIndex
CREATE INDEX "DeliveryParcel_driverId_state_registeredAt_idx" ON "DeliveryParcel"("driverId", "state", "registeredAt");

-- CreateIndex
CREATE INDEX "DeliveryParcel_partnerId_state_deliveredAt_idx" ON "DeliveryParcel"("partnerId", "state", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryParcel_partnerId_externalReference_key" ON "DeliveryParcel"("partnerId", "externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryImport_partnerId_fileHash_key" ON "DeliveryImport"("partnerId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryBillingCycle_partnerId_localDate_key" ON "DeliveryBillingCycle"("partnerId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryInvoice_publicId_key" ON "DeliveryInvoice"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryInvoice_cycleId_key" ON "DeliveryInvoice"("cycleId");

-- CreateIndex
CREATE INDEX "DeliveryInvoice_partnerId_createdAt_idx" ON "DeliveryInvoice"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryInvoiceLine_parcelId_key" ON "DeliveryInvoiceLine"("parcelId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_path_key" ON "DeliveryReceipt"("path");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_partnerId_sha256_key" ON "DeliveryReceipt"("partnerId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPayment_receiptId_key" ON "DeliveryPayment"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPayment_bankReference_key" ON "DeliveryPayment"("bankReference");

-- CreateIndex
CREATE INDEX "DeliveryPayment_partnerId_createdAt_idx" ON "DeliveryPayment"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPaymentAllocation_paymentId_key" ON "DeliveryPaymentAllocation"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCashHandover_reference_key" ON "DeliveryCashHandover"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCodRemittance_reference_key" ON "DeliveryCodRemittance"("reference");

-- CreateIndex
CREATE INDEX "DeliveryActivity_partnerId_createdAt_idx" ON "DeliveryActivity"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryNotification_recipient_createdAt_idx" ON "DeliveryNotification"("recipient", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryPartner" ADD CONSTRAINT "DeliveryPartner_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DeliveryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryParcel" ADD CONSTRAINT "DeliveryParcel_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryParcel" ADD CONSTRAINT "DeliveryParcel_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryParcel" ADD CONSTRAINT "DeliveryParcel_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "DeliveryCashHandover"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryParcel" ADD CONSTRAINT "DeliveryParcel_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "DeliveryCodRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryParcel" ADD CONSTRAINT "DeliveryParcel_importId_fkey" FOREIGN KEY ("importId") REFERENCES "DeliveryImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryImport" ADD CONSTRAINT "DeliveryImport_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryBillingCycle" ADD CONSTRAINT "DeliveryBillingCycle_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryInvoice" ADD CONSTRAINT "DeliveryInvoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryInvoice" ADD CONSTRAINT "DeliveryInvoice_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DeliveryBillingCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryInvoiceLine" ADD CONSTRAINT "DeliveryInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DeliveryInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryInvoiceLine" ADD CONSTRAINT "DeliveryInvoiceLine_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "DeliveryParcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DeliveryInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPayment" ADD CONSTRAINT "DeliveryPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "DeliveryReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPaymentAllocation" ADD CONSTRAINT "DeliveryPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DeliveryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPaymentAllocation" ADD CONSTRAINT "DeliveryPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DeliveryInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCashHandover" ADD CONSTRAINT "DeliveryCashHandover_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCodRemittance" ADD CONSTRAINT "DeliveryCodRemittance_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
