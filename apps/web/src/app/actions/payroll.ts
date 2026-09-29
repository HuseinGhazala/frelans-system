"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { adjustmentsOf, PayrollLocked, refreshPayroll, saveRecomputed } from "@/lib/payroll";
import type { ActionState } from "./types";

const done = (msg: string): ActionState => {
  revalidatePath("/admin/payroll");
  revalidatePath("/me/payslip");
  return { success: msg };
};

const locked = (e: unknown): ActionState => {
  if (e instanceof PayrollLocked) return { error: e.message };
  throw e;
};

export async function generatePayroll(year: number, month: number): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const id = await refreshPayroll(year, month);
    await audit(admin.id, "payroll.refreshed", { type: "payroll", id }, { year, month });
    return done("تم حساب المسودة من الحضور الفعلي");
  } catch (e) {
    return locked(e);
  }
}

export async function setOvertime(itemId: string, hours: number): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!Number.isFinite(hours) || hours < 0) return { error: "عدد ساعات غير صحيح" };
  try {
    const item = await saveRecomputed(itemId, { approvedOvertimeHours: hours });
    await audit(admin.id, "payroll.overtime_approved", { type: "user", id: item.userId }, { hours });
    return done("تم تحديث الإضافي");
  } catch (e) {
    return locked(e);
  }
}

const adjSchema = z.object({
  kind: z.enum(["BONUS", "DEDUCTION"]),
  amount: z.coerce.number().positive({ error: "المبلغ لازم يكون أكبر من صفر" }).max(10_000_000),
  reason: z.string().trim().min(1, { error: "اكتب السبب" }).max(200),
});

export async function addAdjustment(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = adjSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const item = await db.payrollItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "الكشف مش موجود" };
  try {
    await saveRecomputed(itemId, { adjustments: [...adjustmentsOf(item), parsed.data] });
    await audit(admin.id, "payroll.adjustment_added", { type: "user", id: item.userId }, parsed.data);
    return done("تمت الإضافة");
  } catch (e) {
    return locked(e);
  }
}

export async function removeAdjustment(itemId: string, index: number): Promise<ActionState> {
  const admin = await requireAdmin();
  const item = await db.payrollItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "الكشف مش موجود" };
  const list = adjustmentsOf(item);
  const [removed] = list.splice(index, 1);
  try {
    await saveRecomputed(itemId, { adjustments: list });
    await audit(admin.id, "payroll.adjustment_removed", { type: "user", id: item.userId }, removed ?? null);
    return done("تم الحذف");
  } catch (e) {
    return locked(e);
  }
}

export async function approvePayroll(periodId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  await db.payrollPeriod.update({ where: { id: periodId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: admin.id } });
  await audit(admin.id, "payroll.approved", { type: "payroll", id: periodId });
  return done("تم اعتماد مرتبات الشهر — الموظفين يقدروا يشوفوا كشوفهم دلوقتي");
}

export async function reopenPayroll(periodId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  await db.payrollPeriod.update({ where: { id: periodId }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
  await audit(admin.id, "payroll.reopened", { type: "payroll", id: periodId });
  return done("الشهر رجع مسودة");
}
