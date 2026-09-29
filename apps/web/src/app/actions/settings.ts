"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { sendMail } from "@/lib/mail";
import { getSettings, saveSettingsSection } from "@/lib/settings";
import { settingsSchema, type Settings, type SettingsSection } from "@/lib/settings-schema";
import type { ActionState } from "./types";

const num = (fd: FormData, k: string) => Number(fd.get(k));
const bool = (fd: FormData, k: string) => fd.get(k) === "on";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** بيحوّل الفورم لقيم القسم حسب نوعه */
function readSection(section: SettingsSection, fd: FormData, current: Settings): unknown {
  switch (section) {
    case "general":
      return {
        companyName: str(fd, "companyName"),
        timezone: str(fd, "timezone") || current.general.timezone,
        currency: str(fd, "currency") || current.general.currency,
        weekendDays: fd.getAll("weekendDays").map(Number),
      };
    case "attendance":
      return {
        defaultDailyHours: num(fd, "defaultDailyHours"),
        idleThresholdMin: num(fd, "idleThresholdMin"),
        screenshotIntervalMin: num(fd, "screenshotIntervalMin"),
        blurScreenshots: bool(fd, "blurScreenshots"),
        screenshotRetentionDays: num(fd, "screenshotRetentionDays"),
        allowWebCheckIn: bool(fd, "allowWebCheckIn"),
        autoCheckoutIdleMin: num(fd, "autoCheckoutIdleMin"),
      };
    case "payroll":
      return { overtimeMultiplier: num(fd, "overtimeMultiplier") };
    case "alerts":
      return {
        absence: bool(fd, "absence"),
        missingHours: bool(fd, "missingHours"),
        longIdle: bool(fd, "longIdle"),
        longIdleMin: num(fd, "longIdleMin"),
        lowProductivity: bool(fd, "lowProductivity"),
        lowProductivityPercent: num(fd, "lowProductivityPercent"),
        dailySummary: bool(fd, "dailySummary"),
        dailySummaryTime: str(fd, "dailySummaryTime"),
        recipients: str(fd, "recipients").split(/[\s,،]+/).filter(Boolean),
      };
    case "smtp":
      return {
        host: str(fd, "host"),
        port: num(fd, "port") || 587,
        secure: bool(fd, "secure"),
        user: str(fd, "user"),
        // لو الحقل فاضي نحتفظ بكلمة المرور القديمة
        password: str(fd, "password") || current.smtp.password,
        from: str(fd, "from"),
      };
  }
}

export async function saveSettings(section: SettingsSection, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const current = await getSettings();
  const parsed = settingsSchema.shape[section].safeParse(readSection(section, formData, current));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `قيمة غير صحيحة${first?.path.length ? ` في "${first.path.join(".")}"` : ""}` };
  }
  await saveSettingsSection(section, parsed.data as Settings[typeof section]);
  await audit(admin.id, "settings.updated", { type: "settings", id: section });
  revalidatePath("/admin", "layout");
  return { success: "تم الحفظ" };
}

export async function sendTestMail(): Promise<ActionState> {
  const admin = await requireAdmin();
  const ok = await sendMail(admin.email, "بريد تجريبي — راصد", "<p>إعدادات البريد الإلكتروني شغالة ✔</p>");
  return ok ? { success: `تم الإرسال على ${admin.email}` } : { error: "فشل الإرسال. راجع الإعدادات (لـ Gmail استخدم App Password)." };
}

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار التاريخ" }),
  name: z.string().trim().min(1, { error: "اكتب اسم الإجازة" }),
});

export async function addHoliday(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = holidaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const date = new Date(`${parsed.data.date}T00:00:00Z`);
  await db.holiday.upsert({ where: { date }, create: { date, name: parsed.data.name }, update: { name: parsed.data.name } });
  await audit(admin.id, "holiday.added", undefined, parsed.data);
  revalidatePath("/admin/settings");
  return { success: "تمت الإضافة" };
}

export async function deleteHoliday(id: string) {
  const admin = await requireAdmin();
  await db.holiday.delete({ where: { id } });
  await audit(admin.id, "holiday.deleted", { type: "holiday", id });
  revalidatePath("/admin/settings");
}
