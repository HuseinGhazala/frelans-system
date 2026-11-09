import * as z from "zod";

/** الإعدادات العامة للنظام — القيم الافتراضية هي قرارات وثيقة المواصفات */
export const settingsSchema = z.object({
  general: z
    .object({
      companyName: z.string().default("شركتي"),
      timezone: z.string().default("Africa/Cairo"),
      currency: z.string().default("ج.م"),
      /** 0 = الأحد ... 5 = الجمعة */
      weekendDays: z.array(z.number().int().min(0).max(6)).default([5]),
    })
    .prefault({}),
  attendance: z
    .object({
      defaultDailyHours: z.number().min(1).max(24).default(8),
      idleThresholdMin: z.number().int().min(1).max(60).default(5),
      screenshotIntervalMin: z.number().int().min(1).max(60).default(10),
      blurScreenshots: z.boolean().default(false),
      screenshotRetentionDays: z.number().int().min(1).max(365).default(30),
      allowWebCheckIn: z.boolean().default(true),
      autoCheckoutIdleMin: z.number().int().min(1).max(240).default(30),
      /** لما الموظف يكمّل ساعاته المطلوبة في اليوم، الحضور بيتقفل لوحده */
      autoStopAtTarget: z.boolean().default(true),
    })
    .prefault({}),
  payroll: z
    .object({
      overtimeMultiplier: z.number().min(1).max(5).default(1.5),
      /**
       * الساعات الناقصة بتتخصم كل يوم لوحده (اليوم الناقص ما بيتعوضش بيوم زيادة).
       * بيتطبق من dailyShortfallFrom؛ الأيام اللي قبله بتفضل بالحساب الشهري الصافي.
       */
      dailyShortfall: z.boolean().default(true),
      dailyShortfallFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-11-09"),
    })
    .prefault({}),
  alerts: z
    .object({
      absence: z.boolean().default(true),
      missingHours: z.boolean().default(true),
      longIdle: z.boolean().default(true),
      longIdleMin: z.number().int().min(5).max(240).default(20),
      lowProductivity: z.boolean().default(true),
      lowProductivityPercent: z.number().int().min(1).max(100).default(50),
      dailySummary: z.boolean().default(true),
      dailySummaryTime: z.string().regex(/^\d{2}:\d{2}$/).default("23:00"),
      recipients: z.array(z.email()).default([]),
    })
    .prefault({}),
  trello: z
    .object({
      apiKey: z.string().default(""),
      token: z.string().default(""),
      boardIds: z.array(z.string()).default([]),
      /** أسماء الليستات اللي الكارت لما يتنقل لها يبقى خلص (زي Done) */
      doneListNames: z.array(z.string()).default([]),
    })
    .prefault({}),
  chat: z
    .object({
      /** الملفات والصور والصوت بتتمسح بعد المدة دي (النص بيفضل) */
      fileRetentionDays: z.number().int().min(1).max(3650).default(90),
      maxFileMb: z.number().int().min(1).max(100).default(25),
      /** صاحب الرسالة يقدر يعدّلها أو يمسحها خلال المدة دي */
      editWindowMin: z.number().int().min(0).max(1440).default(15),
      /** إيميل لو في رسايل ماتقرتش بقالها المدة دي */
      unreadEmail: z.boolean().default(true),
      unreadEmailAfterMin: z.number().int().min(5).max(1440).default(30),
      /** أقل مدة بين إيميلين لنفس الشخص */
      unreadEmailEveryMin: z.number().int().min(10).max(1440).default(60),
    })
    .prefault({}),
  smtp: z
    .object({
      host: z.string().default(""),
      port: z.number().int().default(587),
      secure: z.boolean().default(false),
      user: z.string().default(""),
      password: z.string().default(""),
      from: z.string().default(""),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof Settings;
export const SETTINGS_SECTIONS = Object.keys(settingsSchema.shape) as SettingsSection[];
