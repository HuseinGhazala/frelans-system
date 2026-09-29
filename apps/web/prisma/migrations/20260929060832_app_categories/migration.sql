-- CreateEnum
CREATE TYPE "Productivity" AS ENUM ('PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE');

-- CreateTable
CREATE TABLE "AppCategory" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" "Productivity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppCategory_pattern_key" ON "AppCategory"("pattern");

-- تصنيفات افتراضية (الأدمن يقدر يعدلها من الإعدادات)
INSERT INTO "AppCategory" ("id", "pattern", "category") VALUES
  ('seed-code', 'code', 'PRODUCTIVE'),
  ('seed-vscode', 'visual studio code', 'PRODUCTIVE'),
  ('seed-devenv', 'devenv', 'PRODUCTIVE'),
  ('seed-figma', 'figma', 'PRODUCTIVE'),
  ('seed-photoshop', 'photoshop', 'PRODUCTIVE'),
  ('seed-illustrator', 'illustrator', 'PRODUCTIVE'),
  ('seed-winword', 'winword', 'PRODUCTIVE'),
  ('seed-excel', 'excel', 'PRODUCTIVE'),
  ('seed-powerpnt', 'powerpnt', 'PRODUCTIVE'),
  ('seed-notion', 'notion', 'PRODUCTIVE'),
  ('seed-terminal', 'windowsterminal', 'PRODUCTIVE'),
  ('seed-github', 'github', 'PRODUCTIVE'),
  ('seed-github-com', 'github.com', 'PRODUCTIVE'),
  ('seed-trello', 'trello', 'PRODUCTIVE'),
  ('seed-gdocs', 'google docs', 'PRODUCTIVE'),
  ('seed-gsheets', 'google sheets', 'PRODUCTIVE'),
  ('seed-slack', 'slack', 'NEUTRAL'),
  ('seed-teams', 'ms-teams', 'NEUTRAL'),
  ('seed-zoom', 'zoom', 'NEUTRAL'),
  ('seed-gmail', 'gmail', 'NEUTRAL'),
  ('seed-outlook', 'outlook', 'NEUTRAL'),
  ('seed-explorer', 'explorer', 'NEUTRAL'),
  ('seed-youtube', 'youtube', 'UNPRODUCTIVE'),
  ('seed-youtube-com', 'youtube.com', 'UNPRODUCTIVE'),
  ('seed-facebook', 'facebook', 'UNPRODUCTIVE'),
  ('seed-facebook-com', 'facebook.com', 'UNPRODUCTIVE'),
  ('seed-instagram', 'instagram', 'UNPRODUCTIVE'),
  ('seed-tiktok', 'tiktok', 'UNPRODUCTIVE'),
  ('seed-netflix', 'netflix', 'UNPRODUCTIVE'),
  ('seed-x', 'x', 'UNPRODUCTIVE'),
  ('seed-whatsapp', 'whatsapp', 'NEUTRAL'),
  ('seed-steam', 'steam', 'UNPRODUCTIVE')
ON CONFLICT ("pattern") DO NOTHING;
