"use server";

import * as z from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { createSession, deleteAllSessions, deleteSession } from "@/lib/auth/session";
import { findValidToken, issueAuthToken, tokenUrl } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/mail";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/utils";
import type { ActionState } from "./types";

const passwordSchema = z
  .string()
  .min(8, { error: "كلمة المرور لازم تكون 8 حروف على الأقل" })
  .regex(/[A-Za-z]/, { error: "لازم تحتوي على حرف إنجليزي واحد على الأقل" })
  .regex(/[0-9]/, { error: "لازم تحتوي على رقم واحد على الأقل" });

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function homeFor(role: string) {
  return role === "ADMIN" ? "/admin" : "/me";
}

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const key = `${email}|${await clientIp()}`;
  if (isRateLimited(key)) return { error: "محاولات كتير غلط. استنى 15 دقيقة وحاول تاني." };

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const ok = user?.passwordHash && user.active ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    recordFailure(key);
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }
  clearFailures(key);
  await createSession(user.id);
  redirect(homeFor(user.role));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

const setupSchema = z.object({
  name: z.string().trim().min(2, { error: "اكتب الاسم" }),
  email: z.email({ error: "بريد إلكتروني غير صحيح" }).trim().toLowerCase(),
  companyName: z.string().trim().min(1, { error: "اكتب اسم الشركة" }),
  password: passwordSchema,
});

/** إنشاء أول حساب أدمن — متاح بس لو مفيش أي مستخدمين */
export async function setupAdmin(_: ActionState, formData: FormData): Promise<ActionState> {
  if ((await db.user.count()) > 0) redirect("/login");
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { name, email, password, companyName } = parsed.data;
  const user = await db.user.create({
    data: { name, email, role: "ADMIN", passwordHash: await hashPassword(password) },
  });
  await db.setting.upsert({
    where: { key: "general" },
    create: { key: "general", value: { companyName } },
    update: { value: { companyName } },
  });
  await audit(user.id, "setup.admin_created");
  await createSession(user.id);
  redirect("/admin");
}

const setPasswordSchema = z
  .object({ token: z.string().min(1), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { error: "كلمتين المرور مش متطابقين", path: ["confirm"] });

/** تعيين كلمة المرور من رابط الدعوة أو رابط الاستعادة */
export async function setPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const row = await findValidToken(parsed.data.token);
  if (!row) return { error: "الرابط انتهت صلاحيته أو اتستخدم قبل كده. اطلب رابط جديد من المدير." };

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  await deleteAllSessions(row.userId);
  await audit(row.userId, row.type === "INVITE" ? "auth.invite_accepted" : "auth.password_reset");
  await createSession(row.userId);
  redirect(homeFor(row.user.role));
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const key = `reset|${await clientIp()}`;
  if (isRateLimited(key, 5)) return { error: "طلبات كتير. حاول بعد شوية." };
  recordFailure(key);

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (user?.active && user.passwordHash) {
    const token = await issueAuthToken(user.id, "PASSWORD_RESET");
    const url = tokenUrl(token, "PASSWORD_RESET");
    const sent = await sendMail(
      user.email,
      "استعادة كلمة المرور — راصد",
      `<p>أهلاً ${escapeHtml(user.name)}،</p><p>اضغط على الرابط ده عشان تعيّن كلمة مرور جديدة (صالح لمدة ساعتين):</p><p><a href="${url}">${url}</a></p>`,
    );
    if (!sent) return { error: "إرسال الإيميل مش متاح حاليًا. اطلب من المدير رابط استعادة كلمة المرور." };
  }
  // نفس الرسالة في كل الحالات عشان ما نكشفش مين عنده حساب
  return { success: "لو البريد ده مسجل عندنا، هيوصلك رابط لتعيين كلمة مرور جديدة." };
}
