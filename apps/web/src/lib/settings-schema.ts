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
      autoCheckoutIdleMin: z.number().int().min(5).max(240).default(30),
    })
    .prefault({}),
  payroll: z
    .object({
      overtimeMultiplier: z.number().min(1).max(5).default(1.5),
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
