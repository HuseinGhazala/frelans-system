-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('HOURS', 'TASKS');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ABSENCE', 'MISSING_HOURS', 'LONG_IDLE', 'LOW_PRODUCTIVITY', 'LEAVE_REQUEST');

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'HOURS';

-- AlterTable
ALTER TABLE "PayrollItem" ADD COLUMN     "lateTasks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'HOURS';

-- AlterTable
ALTER TABLE "TrelloCard" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "listId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_readAt_idx" ON "Alert"("readAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
