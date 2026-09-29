"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { notifyLeaveRequest } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { requireAdmin, requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { LEAVE_LABEL, leaveBalances, leaveWorkingDays } from "@/lib/leaves";
import { sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { addDays, toDateKey } from "@/lib/time";
import { escapeHtml } from "@/lib/utils";
import type { ActionState } from "./types";

const requestSchema = z
  .object({
    type: z.enum(["ANNUAL", "CASUAL", "SICK", "UNPAID"], { error: "اختار نوع الإجازة" }),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ البداية" }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "اختار تاريخ النهاية" }),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { error: "تاريخ النهاية لازم يكون بعد البداية", path: ["endDate"] });

export async function requestLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireEmployee();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { type, startDate, endDate, reason } = parsed.data;

  const { general } = await getSettings();
  const today = toDateKey(new Date(), general.timezone);
  // الإجازة المرضية ممكن تتسجل بعد ما تحصل (لحد 30 يوم)، الباقي من النهارده
  const earliest = type === "SICK" ? addDays(today, -30) : today;
  if (startDate < earliest) return { fieldErrors: { startDate: [type === "SICK" ? "مينفعش أقدم من 30 يوم" : "مينفعش تاريخ فات"] } };
  if (endDate > addDays(today, 366)) return { fieldErrors: { endDate: ["التاريخ بعيد جدًا"] } };

  const days = (await leaveWorkingDays(startDate, endDate)).length;
  if (days === 0) return { error: "الفترة دي كلها إجازات أسبوعية أو رسمية" };

  const overlap = await db.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: new Date(`${endDate}T00:00:00Z`) },
      endDate: { gte: new Date(`${startDate}T00:00:00Z`) },
    },
  });
  if (overlap) return { error: "عندك طلب إجازة تاني في نفس الفترة" };

  if (type === "ANNUAL" || type === "CASUAL") {
    const balance = (await leaveBalances(user.id, Number(startDate.slice(0, 4)))).find((b) => b.type === type)!;
    const available = (balance.remaining ?? 0) - balance.pending;
    if (days > available) return { error: `رصيد الإجازة ${LEAVE_LABEL[type]} مش كفاية (متاح ${Math.max(0, available)} يوم)` };
  }

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
