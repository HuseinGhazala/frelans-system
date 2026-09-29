import "server-only";
import type { LeaveType } from "@/generated/prisma/enums";
import { daysBetween, holidaysBetween } from "./attendance";
import { db } from "./db";
import { getSettings } from "./settings";
import { weekdayOf, type DateKey } from "./time";

export const LEAVE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "سنوية",
  CASUAL: "عارضة",
  SICK: "مرضية",
  UNPAID: "بدون مرتب",
};

export const LEAVE_STATUS_LABEL = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبولة",
  REJECTED: "مرفوضة",
  CANCELLED: "ملغية",
} as const;

export const dateKeyOf = (d: Date) => d.toISOString().slice(0, 10);

/** أيام العمل في فترة إجازة (من غير الإجازة الأسبوعية والرسمية) */
export async function leaveWorkingDays(startKey: DateKey, endKey: DateKey): Promise<DateKey[]> {
  const [{ general }, holidays] = await Promise.all([getSettings(), holidaysBetween(startKey, endKey)]);
  return daysBetween(startKey, endKey).filter((k) => !general.weekendDays.includes(weekdayOf(k)) && !holidays.has(k));
}

/**
 * أيام الإجازات المعتمدة لكل موظف في فترة: خريطة يوم ← نوع الإجازة (أيام العمل بس)
 */
export async function approvedLeaveDays(userIds: string[], fromKey: DateKey, toKey: DateKey) {
  const [{ general }, holidays, rows] = await Promise.all([
    getSettings(),
    holidaysBetween(fromKey, toKey),
    db.leaveRequest.findMany({
      where: {
        userId: { in: userIds },
        status: "APPROVED",
        startDate: { lte: new Date(`${toKey}T00:00:00Z`) },
        endDate: { gte: new Date(`${fromKey}T00:00:00Z`) },
      },
    }),
  ]);
  const result = new Map<string, Map<DateKey, LeaveType>>(userIds.map((id) => [id, new Map()]));
  for (const r of rows) {
    const from = dateKeyOf(r.startDate) < fromKey ? fromKey : dateKeyOf(r.startDate);
    const to = dateKeyOf(r.endDate) > toKey ? toKey : dateKeyOf(r.endDate);
    for (const k of daysBetween(from, to)) {
      if (general.weekendDays.includes(weekdayOf(k)) || holidays.has(k)) continue;
      result.get(r.userId)!.set(k, r.type);
    }
  }
  return result;
}

export type Balance = { type: LeaveType; allowance: number | null; used: number; pending: number; remaining: number | null };

/** رصيد الإجازات لموظف في سنة (السنوية والعارضة ليهم رصيد؛ المرضية وبدون مرتب بتتعد بس) */
export async function leaveBalances(userId: string, year: number): Promise<Balance[]> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [profile, rows, { general }, holidays] = await Promise.all([
    db.employeeProfile.findUnique({ where: { userId } }),
    db.leaveRequest.findMany({
      where: { userId, status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: new Date(`${to}T00:00:00Z`) }, endDate: { gte: new Date(`${from}T00:00:00Z`) } },
    }),
    getSettings(),
    holidaysBetween(from, to),
  ]);
  const count = (r: (typeof rows)[number]) => {
    const a = dateKeyOf(r.startDate) < from ? from : dateKeyOf(r.startDate);
    const b = dateKeyOf(r.endDate) > to ? to : dateKeyOf(r.endDate);
    return daysBetween(a, b).filter((k) => !general.weekendDays.includes(weekdayOf(k)) && !holidays.has(k)).length;
  };
  const allowance: Record<LeaveType, number | null> = {
    ANNUAL: profile?.annualLeaveDays ?? 21,
    CASUAL: profile?.casualLeaveDays ?? 6,
    SICK: null,
    UNPAID: null,
  };
  return (["ANNUAL", "CASUAL", "SICK", "UNPAID"] as LeaveType[]).map((type) => {
    const used = rows.filter((r) => r.type === type && r.status === "APPROVED").reduce((t, r) => t + count(r), 0);
    const pending = rows.filter((r) => r.type === type && r.status === "PENDING").reduce((t, r) => t + count(r), 0);
    const a = allowance[type];
    return { type, allowance: a, used, pending, remaining: a == null ? null : a - used };
  });
}
