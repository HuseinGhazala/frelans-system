-- موظف واحد = جلسة عمل مفتوحة واحدة بس (يمنع التسجيل المزدوج لو الزرار اتضغط مرتين)
CREATE UNIQUE INDEX "WorkSession_one_open_per_user" ON "WorkSession"("userId") WHERE "endedAt" IS NULL;

-- استراحة مفتوحة واحدة بس لكل جلسة
CREATE UNIQUE INDEX "Break_one_open_per_session" ON "Break"("sessionId") WHERE "endedAt" IS NULL;
