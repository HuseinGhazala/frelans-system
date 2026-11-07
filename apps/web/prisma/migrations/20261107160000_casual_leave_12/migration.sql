-- العارضة بقت 12 يوم في السنة بدل 6 (نوفمبر 2026)
ALTER TABLE "EmployeeProfile" ALTER COLUMN "casualLeaveDays" SET DEFAULT 12;

-- الموظفين اللي كانوا على الافتراضي القديم (6) ياخدوا 12. اللي اتظبطله رقم تاني يدوي ما يتغيرش.
UPDATE "EmployeeProfile" SET "casualLeaveDays" = 12 WHERE "casualLeaveDays" = 6;
