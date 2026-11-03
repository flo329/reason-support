-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "ordersCount" INTEGER,
ADD COLUMN     "totalSpent" DECIMAL(12,2),
ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "orderNumbers" TEXT[];

-- CreateTable
CREATE TABLE "TicketScore" (
    "ticketId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "threats" TEXT[],
    "threatAt" TIMESTAMP(3),
    "aiReason" TEXT,
    "aiResult" JSONB,
    "aiHash" TEXT,
    "aiCheckedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertedAt" TIMESTAMP(3),
    "alertedScore" INTEGER,
    "threatAlertedAt" TIMESTAMP(3),

    CONSTRAINT "TicketScore_pkey" PRIMARY KEY ("ticketId")
);

-- CreateIndex
CREATE INDEX "TicketScore_score_idx" ON "TicketScore"("score");

-- AddForeignKey
ALTER TABLE "TicketScore" ADD CONSTRAINT "TicketScore_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
