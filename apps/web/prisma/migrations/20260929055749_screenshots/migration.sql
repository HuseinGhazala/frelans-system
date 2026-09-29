-- CreateTable
CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "display" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "blurred" BOOLEAN NOT NULL DEFAULT false,
    "app" TEXT,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_storageKey_key" ON "Screenshot"("storageKey");

-- CreateIndex
CREATE INDEX "Screenshot_takenAt_idx" ON "Screenshot"("takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_userId_takenAt_display_key" ON "Screenshot"("userId", "takenAt", "display");

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
