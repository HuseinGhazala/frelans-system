import "server-only";
import type { LeaveType } from "@/generated/prisma/enums";
import { db } from "./db";
import { approvedLeaveDays } from "./leaves";
import { getSettings } from "./settings";
import { addDays, dayRange, daysInMonth, HOUR_MS, startOfDay, toDateKey, weekdayOf, workedMs, type DateKey } from "./time";

export type LiveStatus = "WORKING" | "IDLE" | "ON_BREAK" | "OFFLINE";

/** لو البرنامج ما بعتش حاجة المدة دي، الجلسة بتتقفل عند آخر ظهور */
export const AGENT_LOST_AFTER_MS = 10 * 60_000;

/**
 * بيقفل جلسات البرنامج اللي الجهاز بتاعها بطّل يبعت (اتقفل فجأة أو النت فصل)،
 * عند آخر مرة ظهر فيها، عشان الوقت ده ما يتحسبش.
 */
export async function closeStaleAgentSessions(now = new Date()) {
  const stale = await db.workSession.findMany({
    where: {
      endedAt: null,
      source: "AGENT",
      OR: [{ device: { lastSeenAt: { lt: new Date(now.getTime() - AGENT_LOST_AFTER_MS) } } }, { deviceId: null }, { device: { revokedAt: { not: null } } }],
    },
    include: { device: true },
  });
  for (const s of stale) {
    const endedAt = new Date(Math.max(s.startedAt.getTime(), (s.device?.lastSeenAt ?? s.startedAt).getTime()));
    await db.$transaction([
      db.break.updateMany({ where: { sessionId: s.id, endedAt: null }, data: { endedAt } }),
      db.workSession.update({ where: { id: s.id }, data: { endedAt, endReason: "AGENT_LOST" } }),
    ]);
  }
}

export async function getOpenSession(userId: string) {
  return db.workSession.findFirst({
    where: { userId, endedAt: null },
    include: { breaks: { where: { endedAt: null } }, device: true },
    orderBy: { startedAt: "desc" },
  });
}

export function liveStatusOf(open: Awaited<ReturnType<typeof getOpenSession>>): LiveStatus {
  if (!open) return "OFFLINE";
  if (open.breaks.length > 0) return "ON_BREAK";
  if (open.source === "AGENT" && open.device?.idleSince) return "IDLE";
  return "WORKING";
}

export async function sessionsBetween(userIds: string[], from: Date, to: Date) {
  const sessions = await db.workSession.findMany({
    where: { userId: { in: userIds }, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
    include: { breaks: true, idlePeriods: true, device: { select: { idleSince: true } } },
  });
  // الخمول الحالي (لسه ما خلصش) ما يتحسبش برضه
  return sessions.map((s) =>
    !s.endedAt && s.device?.idleSince
      ? { ...s, idlePeriods: [...s.idlePeriods, { startedAt: s.device.idleSince, endedAt: null }] }
      : s,
  );
}

/** ساعات اليوم لمجموعة موظفين (بالمللي ثانية) */
export async function workedTodayByUser(userIds: string[], tz: string, now = new Date()) {
  const { start, end } = dayRange(toDateKey(now, tz), tz);
  const sessions = await sessionsBetween(userIds, start, end);
  const result = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const s of sessions) result.set(s.userId, (result.get(s.userId) ?? 0) + workedMs([s], start, end, now));
  return result;
}

/** ساعات الشغل لكل موظف لكل يوم (الجلسة اللي بتعدي نص الليل بتتقسم على اليومين) */
export async function workedPerDay(userIds: string[], from: Date, to: Date, tz: string, now = new Date()) {
  const sessions = await sessionsBetween(userIds, from, to);
  const result = new Map<string, Map<DateKey, number>>(userIds.map((id) => [id, new Map()]));
  for (const s of sessions) {
    const perDay = result.get(s.userId)!;
    const sEnd = s.endedAt ?? now;
    for (let key = toDateKey(s.startedAt < from ? from : s.startedAt, tz); ; ) {
      const r = dayRange(key, tz);
      if (r.start >= sEnd || r.start >= to) break;
      const ms = workedMs([s], r.start < from ? from : r.start, r.end > to ? to : r.end, now);
      if (ms > 0) perDay.set(key, (perDay.get(key) ?? 0) + ms);
      key = toDateKey(r.end, tz);
    }
  }
  return result;
}

/** أيام العمل في فترة (من غير الإجازة الأسبوعية والرسمية) ابتداءً من أول يوم شغل للموظف */
export function employeeWorkingDays(
  user: { hiredAt: Date | null; createdAt: Date },
  days: DateKey[],
  weekendDays: number[],
  holidays: Set<DateKey>,
  tz: string,
) {
  const startKey = user.hiredAt ? user.hiredAt.toISOString().slice(0, 10) : toDateKey(user.createdAt, tz);
  return days.filter((k) => k >= startKey && !weekendDays.includes(weekdayOf(k)) && !holidays.has(k));
}

export async function holidaysBetween(fromKey: DateKey, toKey: DateKey) {
  const rows = await db.holiday.findMany({ where: { date: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) } } });
  return new Map(rows.map((h) => [h.date.toISOString().slice(0, 10), h.name]));
}

export function daysBetween(fromKey: DateKey, toKey: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(k);
  return out;
}

export type RangeSummary = {
  userId: string;
  dailyMs: number;
  workingDays: DateKey[];
  requiredMs: number;
  workedMs: number;
  perDay: Map<DateKey, number>;
  /** أيام الإجازات المعتمدة (أيام العمل بس) */
  leaveDays: Map<DateKey, LeaveType>;
  /** ساعات الإجازات المدفوعة اللي بتتحسب كشغل */
  paidLeaveMs: number;
  unpaidLeaveDays: number;
};

/** المطلوب مقابل الفعلي لكل موظف في فترة (من يوم لحد يوم، شاملين) */
export async function rangeSummary(userIds: string[], fromKey: DateKey, toKey: DateKey, now = new Date()): Promise<RangeSummary[]> {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const [users, holidays] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, hiredAt: true, createdAt: true, profile: { select: { dailyHours: true } } } }),
    holidaysBetween(fromKey, toKey),
  ]);
  const [worked, leaves] = await Promise.all([
    workedPerDay(userIds, startOfDay(fromKey, tz), startOfDay(addDays(toKey, 1), tz), tz, now),
    approvedLeaveDays(userIds, fromKey, toKey),
  ]);
  const days = daysBetween(fromKey, toKey);
  const holidaySet = new Set(holidays.keys());
  return users.map((u) => {
    const dailyMs = Number(u.profile?.dailyHours ?? settings.attendance.defaultDailyHours) * HOUR_MS;
    const workingDays = employeeWorkingDays(u, days, settings.general.weekendDays, holidaySet, tz);
    const working = new Set(workingDays);
    const perDay = worked.get(u.id) ?? new Map();
    const leaveDays = new Map([...(leaves.get(u.id) ?? new Map())].filter(([k]) => working.has(k)));
    // يوم الإجازة المدفوعة بيتحسب كأنه اشتغل ساعاته (من غير ما يتحسب مرتين لو اشتغل فيه)
    let paidLeaveMs = 0;
    let unpaidLeaveDays = 0;
    for (const [k, type] of leaveDays) {
      if (type === "UNPAID") unpaidLeaveDays++;
      else paidLeaveMs += Math.max(0, dailyMs - (perDay.get(k) ?? 0));
    }
    return {
      userId: u.id,
      dailyMs,
      workingDays,
      requiredMs: workingDays.length * dailyMs,
      workedMs: [...perDay.values()].reduce((a, b) => a + b, 0),
      perDay,
      leaveDays,
      paidLeaveMs,
      unpaidLeaveDays,
    };
  });
}

export type MonthSummary = RangeSummary;

/** ملخص الشهر لموظف: المطلوب مقابل الفعلي (الحساب شهري صافي) */
export async function monthSummary(userId: string, year: number, month: number, now = new Date()): Promise<MonthSummary> {
  const days = daysInMonth(year, month);
  const [summary] = await rangeSummary([userId], days[0], days[days.length - 1], now);
  return summary;
}
