-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "builtinKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "problemId" TEXT,
    "orderId" TEXT,
    "ticketId" INTEGER,
    "mode" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateId" TEXT,
    "bulkId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "gorgiasMessageId" INTEGER,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_builtinKey_key" ON "MessageTemplate"("builtinKey");

-- CreateIndex
CREATE INDEX "MessageTemplate_type_language_idx" ON "MessageTemplate"("type", "language");

-- CreateIndex
CREATE INDEX "CustomerContact_problemId_idx" ON "CustomerContact"("problemId");

-- CreateIndex
CREATE INDEX "CustomerContact_bulkId_idx" ON "CustomerContact"("bulkId");

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "OrderProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
