"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { notifyLeaveRequest } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { requireAdmin, requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { CASUAL_MAX_PER_MONTH, casualMonthOverflow, monthLabel } from "@/lib/leave-rules";
import { BALANCE_TYPES, dateKeyOf, LEAVE_LABEL, LEAVE_TYPES, leaveBalances, leaveWorkingDays } from "@/lib/leaves";
import { sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { addDays, toDateKey } from "@/lib/time";
import { escapeHtml } from "@/lib/utils";
import type { ActionState } from "./types";

const requestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES, { error: "اختار نوع الإجازة" }),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ البداية" }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ النهاية" }),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { error: "تاريخ النهاية لازم يكون بعد البداية", path: ["endDate"] });

type LeaveKind = (typeof LEAVE_TYPES)[number];

/**
 * قواعد الإجازة المشتركة بين طلب الموظف وتسجيل الأدمن:
 * أيام عمل > 0، مفيش تداخل مع طلب تاني، والعارضة: 3 أيام في الشهر بالكتير والرصيد يكفي.
 */
async function checkLeaveRules(
  userId: string,
  type: LeaveKind,
  startDate: string,
  endDate: string,
  who: "employee" | "admin",
): Promise<{ error: string } | { days: number }> {
  const workingDays = await leaveWorkingDays(startDate, endDate);
  const days = workingDays.length;
  if (days === 0) return { error: "الفترة دي كلها إجازات أسبوعية أو رسمية" };

  const overlap = await db.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: new Date(`${endDate}T00:00:00Z`) },
      endDate: { gte: new Date(`${startDate}T00:00:00Z`) },
    },
  });
  if (overlap) return { error: who === "employee" ? "عندك طلب إجازة تاني في نفس الفترة" : "الموظف عنده إجازة تانية (مقبولة أو مستنية) في نفس الفترة" };

  if (type === "CASUAL") {
    // حد شهري: مش أكتر من CASUAL_MAX_PER_MONTH أيام عارضة في الشهر (المقبولة + المستنية + الطلب ده)
    const monthStart = `${startDate.slice(0, 7)}-01`;
    const monthEnd = addDays(`${endDate.slice(0, 7)}-01`, 40).slice(0, 7) + "-01";
    const others = await db.leaveRequest.findMany({
      where: {
        userId,
        type: { in: [...BALANCE_TYPES] },
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lt: new Date(`${monthEnd}T00:00:00Z`) },
        endDate: { gte: new Date(`${monthStart}T00:00:00Z`) },
      },
    });
    const existing = (await Promise.all(others.map((r) => leaveWorkingDays(dateKeyOf(r.startDate), dateKeyOf(r.endDate))))).flat();
    const over = casualMonthOverflow(workingDays, existing);
    if (over) {
      const left = over.available > 0 ? `فاضل ${over.available} يوم بس` : "الـ 3 أيام بتوع الشهر خلصوا";
      return { error: `مينفعش أكتر من ${CASUAL_MAX_PER_MONTH} أيام إجازة في الشهر. ${monthLabel(over.month)}: ${left}` };
    }

    const balance = (await leaveBalances(userId, Number(startDate.slice(0, 4)))).find((b) => b.type === type)!;
    const available = (balance.remaining ?? 0) - balance.pending;
    if (days > available) return { error: `رصيد الإجازة ${LEAVE_LABEL[type]} مش كفاية (متاح ${Math.max(0, available)} يوم)` };
  }
  return { days };
}

export async function requestLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireEmployee();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { type, startDate, endDate, reason } = parsed.data;

  const { general } = await getSettings();
  const today = toDateKey(new Date(), general.timezone);
  // عارضة/مرضية: ممكن تتسجل بعد ما تحصل (طوارئ أو مرض) لحد 30 يوم
  if (startDate < addDays(today, -30)) return { fieldErrors: { startDate: ["مينفعش أقدم من 30 يوم"] } };
  if (endDate > addDays(today, 366)) return { fieldErrors: { endDate: ["التاريخ بعيد جدًا"] } };

  const checked = await checkLeaveRules(user.id, type, startDate, endDate, "employee");
  if ("error" in checked) return { error: checked.error };
  const { days } = checked;

  const leave = await db.leaveRequest.create({
    data: { userId: user.id, type, startDate: new Date(`${startDate}T00:00:00Z`), endDate: new Date(`${endDate}T00:00:00Z`), days, reason: reason || null },
  });
  await audit(user.id, "leave.requested", { type: "user", id: user.id }, { leaveId: leave.id, type, days });
  await notifyLeaveRequest(leave.id);
  revalidatePath("/me/leaves");
  revalidatePath("/admin/leaves");
  return { success: `تم إرسال الطلب (${days} يوم عمل) — هيوصلك الرد بعد مراجعة المدير` };
}

export async function cancelLeave(id: string) {
  const user = await requireEmployee();
  await db.leaveRequest.updateMany({ where: { id, userId: user.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  await audit(user.id, "leave.cancelled", { type: "user", id: user.id }, { leaveId: id });
  revalidatePath("/me/leaves");
  revalidatePath("/admin/leaves");
}

export async function reviewLeave(id: string, decision: "APPROVED" | "REJECTED", note: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const leave = await db.leaveRequest.findUnique({ where: { id }, include: { user: true } });
  if (!leave || leave.status !== "PENDING") return { error: "الطلب اتراجع قبل كده" };
  const reviewNote = note.trim().slice(0, 500) || null;
  if (decision === "REJECTED" && !reviewNote) return { error: "اكتب سبب الرفض" };

  await db.leaveRequest.update({ where: { id }, data: { status: decision, reviewerId: admin.id, reviewNote, reviewedAt: new Date() } });
  await audit(admin.id, decision === "APPROVED" ? "leave.approved" : "leave.rejected", { type: "user", id: leave.userId }, { leaveId: id });

  const range = `${leave.startDate.toISOString().slice(0, 10)} → ${leave.endDate.toISOString().slice(0, 10)}`;
  await sendMail(
    leave.user.email,
    decision === "APPROVED" ? "تمت الموافقة على الإجازة" : "تم رفض طلب الإجازة",
    `<p>أهلاً ${escapeHtml(leave.user.name)}،</p><p>طلب الإجازة ${LEAVE_LABEL[leave.type]} (${range}، ${leave.days} يوم) ${decision === "APPROVED" ? "اتقبل ✔" : "اترفض"}.</p>${reviewNote ? `<p>ملاحظة المدير: ${escapeHtml(reviewNote)}</p>` : ""}`,
  );
  revalidatePath("/admin/leaves");
  revalidatePath("/admin", "layout");
  return { success: decision === "APPROVED" ? "تمت الموافقة" : "تم الرفض" };
}

const adminLeaveSchema = z
  .object({
    userId: z.string().min(1, { error: "اختار الموظف" }),
    type: z.enum(LEAVE_TYPES, { error: "اختار نوع الإجازة" }),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ البداية" }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ النهاية" }),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { error: "تاريخ النهاية لازم يكون بعد البداية", path: ["endDate"] });

/** الأدمن بيسجّل إجازة لموظف (بتتقبل على طول). ينفع بأثر رجعي لحد سنة، وبنفس قواعد الرصيد والحد الشهري */
export async function adminCreateLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = adminLeaveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { userId, type, startDate, endDate, reason } = parsed.data;

  const employee = await db.user.findFirst({ where: { id: userId, role: "EMPLOYEE", active: true } });
  if (!employee) return { fieldErrors: { userId: ["الموظف مش موجود"] } };

  const { general } = await getSettings();
  const today = toDateKey(new Date(), general.timezone);
  if (startDate < addDays(today, -366)) return { fieldErrors: { startDate: ["أقدم من سنة"] } };
  if (endDate > addDays(today, 366)) return { fieldErrors: { endDate: ["التاريخ بعيد جدًا"] } };

  const checked = await checkLeaveRules(userId, type, startDate, endDate, "admin");
  if ("error" in checked) return { error: checked.error };
  const { days } = checked;

  const leave = await db.leaveRequest.create({
    data: {
      userId,
      type,
      startDate: new Date(`${startDate}T00:00:00Z`),
      endDate: new Date(`${endDate}T00:00:00Z`),
      days,
      reason: reason || null,
      status: "APPROVED",
      reviewerId: admin.id,
      reviewNote: "اتسجلت من المدير",
      reviewedAt: new Date(),
    },
  });
  await audit(admin.id, "leave.created_by_admin", { type: "user", id: userId }, { leaveId: leave.id, type, days });
  await sendMail(
    employee.email,
    "اتسجلتلك إجازة",
    `<p>أهلاً ${escapeHtml(employee.name)}،</p><p>المدير سجّلك إجازة ${LEAVE_LABEL[type]} (${startDate} → ${endDate}، ${days} يوم عمل).</p>${reason ? `<p>السبب: ${escapeHtml(reason)}</p>` : ""}`,
  );
  revalidatePath("/admin/leaves");
  revalidatePath("/me/leaves");
  return { success: `اتسجلت إجازة ${LEAVE_LABEL[type]} لـ ${employee.name} (${days} يوم عمل)` };
}

/** الأدمن بيلغي إجازة (مقبولة أو مستنية). الأيام بترجع للرصيد، والمرتب بيتحسب من غيرها لو الشهر لسه ما اتقفلش */
export async function adminCancelLeave(id: string, note: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const leave = await db.leaveRequest.findUnique({ where: { id }, include: { user: true } });
  if (!leave || (leave.status !== "APPROVED" && leave.status !== "PENDING")) return { error: "الإجازة دي اتلغت أو اترفضت قبل كده" };
  const reviewNote = note.trim().slice(0, 500) || null;
  if (!reviewNote) return { error: "اكتب سبب الإلغاء" };

  await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", reviewerId: admin.id, reviewNote, reviewedAt: new Date() } });
  await audit(admin.id, "leave.cancelled_by_admin", { type: "user", id: leave.userId }, { leaveId: id, was: leave.status });

  const range = `${dateKeyOf(leave.startDate)} → ${dateKeyOf(leave.endDate)}`;
  await sendMail(
    leave.user.email,
    "اتلغت إجازتك",
    `<p>أهلاً ${escapeHtml(leave.user.name)}،</p><p>الإجازة ${LEAVE_LABEL[leave.type]} (${range}، ${leave.days} يوم) اتلغت من المدير.</p><p>السبب: ${escapeHtml(reviewNote)}</p>`,
  );
  revalidatePath("/admin/leaves");
  revalidatePath("/me/leaves");
  revalidatePath("/admin", "layout");
  return { success: "الإجازة اتلغت" };
}
