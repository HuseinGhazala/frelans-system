import "server-only";
import type { PayrollItem } from "@/generated/prisma/client";
import { holidaysBetween, rangeSummary } from "./attendance";
import { db } from "./db";
import { computePayroll, type Adjustment } from "./payroll-calc";
import { getSettings } from "./settings";
import { daysInMonth, HOUR_MS, workingDaysInMonth } from "./time";

export class PayrollLocked extends Error {}

export function adjustmentsOf(item: Pick<PayrollItem, "adjustments">): Adjustment[] {
  return Array.isArray(item.adjustments) ? (item.adjustments as Adjustment[]) : [];
}

const hoursOf = (ms: number) => Math.round((ms / HOUR_MS) * 100) / 100;

/** بيحسب قيم كشف المرتب من البيانات المتخزنة (بعد تعديل الإضافي أو التعديلات اليدوية) */
export function recompute(item: PayrollItem, fullMonthWorkingDays: number, dailyHours: number) {
  return computePayroll({
    monthlySalary: Number(item.monthlySalary),
    fullMonthWorkingDays,
    dailyHours,
    requiredHours: Number(item.requiredHours),
    workedHours: Number(item.workedHours),
    paidLeaveHours: Number(item.paidLeaveHours),
    approvedOvertimeHours: Number(item.approvedOvertimeHours),
    overtimeMultiplier: Number(item.overtimeMultiplier),
    adjustments: adjustmentsOf(item),
  });
}

export async function monthContext(year: number, month: number) {
  const settings = await getSettings();
  const days = daysInMonth(year, month);
  const holidays = await holidaysBetween(days[0], days[days.length - 1]);
  return { settings, days, fullMonthWorkingDays: workingDaysInMonth(year, month, settings.general.weekendDays, holidays.keys()).length };
}

/**
 * يعمل أو يحدّث مسودة مرتبات الشهر من الحضور الفعلي.
 * الإضافي المعتمد والتعديلات اليدوية بتفضل زي ما هي.
 */
export async function refreshPayroll(year: number, month: number, now = new Date()) {
  const existing = await db.payrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (existing?.status === "APPROVED") throw new PayrollLocked("مرتبات الشهر ده معتمدة");
  const period = existing ?? (await db.payrollPeriod.create({ data: { year, month } }));

  const { settings, days, fullMonthWorkingDays } = await monthContext(year, month);
  const employees = await db.user.findMany({ where: { role: "EMPLOYEE", active: true, profile: { isNot: null } }, include: { profile: true } });
  const summaries = await rangeSummary(employees.map((e) => e.id), days[0], days[days.length - 1], now);
  const prev = new Map((await db.payrollItem.findMany({ where: { periodId: period.id } })).map((i) => [i.userId, i]));
  const multiplier = settings.payroll.overtimeMultiplier;

  for (const e of employees) {
    const s = summaries.find((x) => x.userId === e.id)!;
    const dailyHours = Number(e.profile!.dailyHours);
    const old = prev.get(e.id);
    const input = {
      monthlySalary: Number(e.profile!.monthlySalary),
      fullMonthWorkingDays,
      dailyHours,
      requiredHours: hoursOf(s.requiredMs),
      workedHours: hoursOf(s.workedMs),
      paidLeaveHours: hoursOf(s.paidLeaveMs),
      approvedOvertimeHours: old ? Number(old.approvedOvertimeHours) : 0,
      overtimeMultiplier: multiplier,
      adjustments: old ? adjustmentsOf(old) : [],
    };
    const r = computePayroll(input);
    const data = {
      monthlySalary: input.monthlySalary,
      hourlyRate: r.hourlyRate,
      baseSalary: r.baseSalary,
      requiredHours: input.requiredHours,
      workedHours: input.workedHours,
      paidLeaveHours: input.paidLeaveHours,
      unpaidLeaveDays: s.unpaidLeaveDays,
      shortHours: r.shortHours,
      deduction: r.deduction,
      surplusHours: r.surplusHours,
      approvedOvertimeHours: r.approvedOvertimeHours,
      overtimeMultiplier: multiplier,
      overtimePay: r.overtimePay,
      net: r.net,
    };
    await db.payrollItem.upsert({
      where: { periodId_userId: { periodId: period.id, userId: e.id } },
      create: { periodId: period.id, userId: e.id, ...data },
      update: data,
    });
  }
  await db.payrollPeriod.update({ where: { id: period.id }, data: { updatedAt: new Date() } });
  return period.id;
}

/** بعد تعديل الإضافي أو التعديلات اليدوية لكشف واحد */
export async function saveRecomputed(itemId: string, patch: { approvedOvertimeHours?: number; adjustments?: Adjustment[] }) {
  const item = await db.payrollItem.findUniqueOrThrow({ where: { id: itemId }, include: { period: true, user: { include: { profile: true } } } });
  if (item.period.status === "APPROVED") throw new PayrollLocked("مرتبات الشهر ده معتمدة");
  const merged = { ...item, ...(patch.approvedOvertimeHours !== undefined && { approvedOvertimeHours: patch.approvedOvertimeHours }), ...(patch.adjustments && { adjustments: patch.adjustments }) } as PayrollItem;
  const { fullMonthWorkingDays } = await monthContext(item.period.year, item.period.month);
  const r = recompute(merged, fullMonthWorkingDays, Number(item.user.profile?.dailyHours ?? 8));
  await db.payrollItem.update({
    where: { id: itemId },
    data: {
      approvedOvertimeHours: r.approvedOvertimeHours,
      adjustments: adjustmentsOf(merged),
      overtimePay: r.overtimePay,
      net: r.net,
    },
  });
  return item;
}
