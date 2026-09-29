-- AlterEnum
ALTER TYPE "SessionEndReason" ADD VALUE 'AGENT_LOST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monitoringConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "deviceId" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "idleSince" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdlePeriod" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdlePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityMinute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "keyboard" INTEGER NOT NULL DEFAULT 0,
    "mouse" INTEGER NOT NULL DEFAULT 0,
    "app" TEXT,
    "title" TEXT,
    "domain" TEXT,
    "idle" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ActivityMinute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IdlePeriod_sessionId_startedAt_key" ON "IdlePeriod"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivityMinute_sessionId_idx" ON "ActivityMinute"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityMinute_userId_minute_key" ON "ActivityMinute"("userId", "minute");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdlePeriod" ADD CONSTRAINT "IdlePeriod_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMinute" ADD CONSTRAINT "ActivityMinute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMinute" ADD CONSTRAINT "ActivityMinute_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
