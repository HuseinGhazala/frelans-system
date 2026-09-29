-- AlterTable
ALTER TABLE "ActivityMinute" ADD COLUMN     "trelloCardId" TEXT;

-- CreateTable
CREATE TABLE "TrelloBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "TrelloBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrelloCard" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "listName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "due" TIMESTAMP(3),
    "memberIds" TEXT[],
    "lastActivity" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrelloCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrelloMember" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,

    CONSTRAINT "TrelloMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrelloCard_boardId_idx" ON "TrelloCard"("boardId");

-- CreateIndex
CREATE INDEX "ActivityMinute_trelloCardId_idx" ON "ActivityMinute"("trelloCardId");

-- AddForeignKey
ALTER TABLE "TrelloCard" ADD CONSTRAINT "TrelloCard_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TrelloBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
