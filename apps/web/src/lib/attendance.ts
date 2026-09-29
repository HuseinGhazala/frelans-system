import "server-only";
import { db } from "./db";
import { getSettings } from "./settings";
import { dayRange, HOUR_MS, monthRange, toDateKey, workedMs, workingDaysInMonth, type DateKey } from "./time";

export type LiveStatus = "WORKING" | "ON_BREAK" | "OFFLINE";

export async function getOpenSession(userId: string) {
  return db.workSession.findFirst({
    where: { userId, endedAt: null },
    include: { breaks: { where: { endedAt: null } } },
    orderBy: { startedAt: "desc" },
  });
}

export function liveStatusOf(open: Awaited<ReturnType<typeof getOpenSession>>): LiveStatus {
  if (!open) return "OFFLINE";
  return open.breaks.length > 0 ? "ON_BREAK" : "WORKING";
}

async function sessionsBetween(userIds: string[], from: Date, to: Date) {
  return db.workSession.findMany({
    where: { userId: { in: userIds }, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
    include: { breaks: true },
  });
}

/** ساعات اليوم لمجموعة موظفين (بالمللي ثانية) */
export async function workedTodayByUser(userIds: string[], tz: string, now = new Date()) {
  const { start, end } = dayRange(toDateKey(now, tz), tz);
  const sessions = await sessionsBetween(userIds, start, end);
  const result = new Map<string, number>(userIds.map((id) => [id, 0]));
  for (const s of sessions) result.set(s.userId, (result.get(s.userId) ?? 0) + workedMs([s], start, end, now));
  return result;
}

export type MonthSummary = {
  workingDays: DateKey[];
  requiredMs: number;
  workedMs: number;
  /** ساعات العمل لكل يوم في الشهر */
  perDay: Map<DateKey, number>;
};

/** ملخص الشهر لموظف: المطلوب مقابل الفعلي (الحساب شهري صافي) */
export async function monthSummary(userId: string, year: number, month: number, now = new Date()): Promise<MonthSummary> {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const [user, profile, holidays] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { hiredAt: true, createdAt: true } }),
    db.employeeProfile.findUnique({ where: { userId } }),
    db.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } } }),
  ]);
  const dailyHours = profile ? Number(profile.dailyHours) : settings.attendance.defaultDailyHours;
  // الموظف الجديد مطلوب منه ساعات الأيام من أول يوم شغل بس
  const startKey = user.hiredAt ? user.hiredAt.toISOString().slice(0, 10) : toDateKey(user.createdAt, tz);
  const workingDays = workingDaysInMonth(year, month, settings.general.weekendDays, holidays.map((h) => h.date.toISOString().slice(0, 10))).filter(
    (k) => k >= startKey,
  );

  const { start, end } = monthRange(year, month, tz);
  const sessions = await sessionsBetween([userId], start, end);
  const perDay = new Map<DateKey, number>();
  let total = 0;
  for (const s of sessions) {
    // نقسم الجلسة على الأيام اللي بتعدي عليها
    const sEnd = s.endedAt ?? now;
    for (let key = toDateKey(s.startedAt, tz); ; ) {
      const r = dayRange(key, tz);
      if (r.start >= sEnd || r.start >= end) break;
      if (r.end > start) {
        const ms = workedMs([s], r.start < start ? start : r.start, r.end > end ? end : r.end, now);
        perDay.set(key, (perDay.get(key) ?? 0) + ms);
        total += ms;
      }
      key = toDateKey(r.end, tz);
    }
  }
  return { workingDays, requiredMs: workingDays.length * dailyHours * HOUR_MS, workedMs: total, perDay };
}
