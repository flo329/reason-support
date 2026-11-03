-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('CANCELLED', 'OUT_OF_STOCK', 'OVERSOLD', 'STUCK');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'NOTIFIED', 'HANDLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "linkedOrderId" TEXT;

-- CreateTable
CREATE TABLE "Store" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "email" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerOrdersCount" INTEGER,
    "customerAmountSpent" DECIMAL(12,2),
    "shopifyCreatedAt" TIMESTAMP(3) NOT NULL,
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "totalRefunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "variantId" TEXT,
    "inventoryItemId" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER NOT NULL,
    "unfulfilledQuantity" INTEGER NOT NULL,

    CONSTRAINT "ShopifyLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLevel" (
    "id" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT,
    "sku" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "available" INTEGER NOT NULL,
    "onHand" INTEGER NOT NULL,
    "committed" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProblem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeKey" TEXT NOT NULL,
    "type" "ProblemType" NOT NULL,
    "skus" TEXT[],
    "details" JSONB NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "linkedTicketId" INTEGER,

    CONSTRAINT "OrderProblem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_domain_key" ON "Store"("domain");

-- CreateIndex
CREATE INDEX "ShopifyOrder_storeKey_number_idx" ON "ShopifyOrder"("storeKey", "number");

-- CreateIndex
CREATE INDEX "ShopifyOrder_email_idx" ON "ShopifyOrder"("email");

-- CreateIndex
CREATE INDEX "ShopifyOrder_cancelledAt_idx" ON "ShopifyOrder"("cancelledAt");

-- CreateIndex
CREATE INDEX "ShopifyLineItem_inventoryItemId_idx" ON "ShopifyLineItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ShopifyLineItem_sku_idx" ON "ShopifyLineItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryLevel_storeKey_sku_idx" ON "InventoryLevel"("storeKey", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLevel_storeKey_inventoryItemId_locationId_key" ON "InventoryLevel"("storeKey", "inventoryItemId", "locationId");

-- CreateIndex
CREATE INDEX "OrderProblem_status_type_idx" ON "OrderProblem"("status", "type");

-- CreateIndex
CREATE INDEX "OrderProblem_linkedTicketId_idx" ON "OrderProblem"("linkedTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProblem_orderId_type_key" ON "OrderProblem"("orderId", "type");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_linkedOrderId_fkey" FOREIGN KEY ("linkedOrderId") REFERENCES "ShopifyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrder" ADD CONSTRAINT "ShopifyOrder_storeKey_fkey" FOREIGN KEY ("storeKey") REFERENCES "Store"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyLineItem" ADD CONSTRAINT "ShopifyLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProblem" ADD CONSTRAINT "OrderProblem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProblem" ADD CONSTRAINT "OrderProblem_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
