"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { deleteAllSessions } from "@/lib/auth/session";
import { issueAuthToken, tokenUrl } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/mail";
import { escapeHtml } from "@/lib/utils";
import type { ActionState } from "./types";

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(min).max(max).optional());

const employeeSchema = z.object({
  name: z.string().trim().min(2, { error: "اكتب اسم الموظف" }),
  email: z.email({ error: "بريد إلكتروني غير صحيح" }).trim().toLowerCase(),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  jobTitle: z.string().trim().max(100).optional().transform((v) => v || null),
  hiredAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
  monthlySalary: z.coerce.number({ error: "اكتب المرتب" }).min(0, { error: "المرتب لازم يكون رقم موجب" }),
  dailyHours: z.coerce.number().min(1, { error: "من 1 لـ 24 ساعة" }).max(24, { error: "من 1 لـ 24 ساعة" }),
  annualLeaveDays: z.coerce.number().int().min(0).max(60),
  casualLeaveDays: z.coerce.number().int().min(0).max(60),
  screenshotIntervalMin: optionalInt(1, 60),
  idleThresholdMin: optionalInt(1, 60),
  blurScreenshots: z.enum(["default", "on", "off"]).default("default"),
  trelloMemberId: z.string().max(64).optional(),
});

function parseEmployee(formData: FormData) {
  return employeeSchema.safeParse(Object.fromEntries(formData));
}

function profileData(d: z.infer<typeof employeeSchema>) {
  return {
    monthlySalary: d.monthlySalary,
    dailyHours: d.dailyHours,
    annualLeaveDays: d.annualLeaveDays,
    casualLeaveDays: d.casualLeaveDays,
    screenshotIntervalMin: d.screenshotIntervalMin ?? null,
    idleThresholdMin: d.idleThresholdMin ?? null,
    blurScreenshots: d.blurScreenshots === "default" ? null : d.blurScreenshots === "on",
    // الحقل بيظهر بس لو Trello مربوط، فلو مش موجود في الفورم ما نغيّرش القيمة
    ...(d.trelloMemberId !== undefined && { trelloMemberId: d.trelloMemberId || null }),
  };
}

async function sendInvite(user: { id: string; name: string; email: string }): Promise<{ sent: boolean; url: string }> {
  const token = await issueAuthToken(user.id, "INVITE");
  const url = tokenUrl(token, "INVITE");
  const sent = await sendMail(
    user.email,
    "دعوة للانضمام — راصد",
    `<p>أهلاً ${escapeHtml(user.name)}،</p><p>تمت إضافتك على نظام متابعة العمل. اضغط على الرابط ده عشان تعيّن كلمة المرور بتاعتك (صالح لمدة 7 أيام):</p><p><a href="${url}">${url}</a></p>`,
  );
  return { sent, url };
}

export async function createEmployee(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseEmployee(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return { fieldErrors: { email: ["البريد ده مستخدم لموظف تاني"] } };

  const user = await db.user.create({
    data: {
      name: d.name,
      email: d.email,
      phone: d.phone,
      jobTitle: d.jobTitle,
      hiredAt: d.hiredAt,
      role: "EMPLOYEE",
      profile: { create: profileData(d) },
    },
  });
  await audit(admin.id, "employee.created", { type: "user", id: user.id }, { email: user.email });
  const { sent, url } = await sendInvite(user);
  revalidatePath("/admin/employees");
  if (sent) redirect(`/admin/employees/${user.id}?invite=sent`);
  // الإيميل مش متظبط: نعرض الرابط للأدمن ينسخه (من غير ما نحطه في الـ URL)
  return { success: "تم إضافة الموظف. الإيميل مش متظبط لسه، فانسخ رابط الدعوة وابعته له بنفسك (صالح 7 أيام):", link: url, id: user.id };
}

export async function updateEmployee(userId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseEmployee(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;
  const clash = await db.user.findUnique({ where: { email: d.email } });
  if (clash && clash.id !== userId) return { fieldErrors: { email: ["البريد ده مستخدم لموظف تاني"] } };

  await db.user.update({
    where: { id: userId, role: "EMPLOYEE" },
    data: {
      name: d.name,
      email: d.email,
      phone: d.phone,
      jobTitle: d.jobTitle,
      hiredAt: d.hiredAt,
      profile: { upsert: { create: profileData(d), update: profileData(d) } },
    },
  });
  await audit(admin.id, "employee.updated", { type: "user", id: userId });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${userId}`);
  return { success: "تم حفظ التعديلات" };
}

export async function setEmployeeActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  await db.user.update({ where: { id: userId, role: "EMPLOYEE" }, data: { active } });
  if (!active) {
    await deleteAllSessions(userId);
    // إنهاء أي جلسة عمل مفتوحة
    await db.workSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: new Date(), endReason: "MANUAL" } });
  }
  await audit(admin.id, active ? "employee.activated" : "employee.deactivated", { type: "user", id: userId });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${userId}`);
}

/** إعادة إرسال الدعوة (لو لسه ما عيّنش كلمة مرور) أو رابط استعادة كلمة المرور */
export async function resendAccessLink(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const user = await db.user.findUnique({ where: { id: userId, role: "EMPLOYEE" } });
  if (!user) return { error: "الموظف مش موجود" };

  let result: { sent: boolean; url: string };
  if (!user.passwordHash) {
    result = await sendInvite(user);
  } else {
    const token = await issueAuthToken(user.id, "PASSWORD_RESET");
    const url = tokenUrl(token, "PASSWORD_RESET");
    const sent = await sendMail(
      user.email,
      "تعيين كلمة مرور جديدة — راصد",
      `<p>أهلاً ${escapeHtml(user.name)}،</p><p>اضغط على الرابط ده عشان تعيّن كلمة مرور جديدة (صالح لمدة ساعتين):</p><p><a href="${url}">${url}</a></p>`,
    );
    result = { sent, url };
  }
  await audit(admin.id, "employee.access_link_issued", { type: "user", id: userId });
  return result.sent
    ? { success: `تم إرسال الرابط على ${user.email}` }
    : { success: "الإيميل مش متظبط، انسخ الرابط وابعته للموظف بنفسك:", link: result.url };
}

/** إلغاء جهاز: البرنامج على الجهاز ده هيطلب تسجيل دخول تاني */
export async function revokeDevice(deviceId: string) {
  const admin = await requireAdmin();
  const device = await db.device.update({ where: { id: deviceId }, data: { revokedAt: new Date(), idleSince: null } });
  await audit(admin.id, "device.revoked", { type: "user", id: device.userId }, { device: device.name });
  revalidatePath(`/admin/employees/${device.userId}`);
}
