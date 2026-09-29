import "server-only";
import { rangeActivity } from "./activity";
import { daysBetween, holidaysBetween, rangeSummary } from "./attendance";
import { db } from "./db";
import { getSettings } from "./settings";
import { addDays, daysInMonth, startOfDay, toDateKey, weekdayOf, type DateKey } from "./time";

export async function reportEmployees() {
  return db.user.findMany({ where: { role: "EMPLOYEE", active: true }, select: { id: true, name: true, hiredAt: true, createdAt: true }, orderBy: { name: "asc" } });
}

export type HoursRow = {
  userId: string;
  name: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  requiredMs: number;
  workedMs: number;
  diffMs: number;
  idleMs: number;
  activityPercent: number | null;
  productivityPercent: number | null;
};

/** تقرير الساعات لكل موظف في فترة */
export async function hoursReport(fromKey: DateKey, toKey: DateKey, now = new Date()): Promise<HoursRow[]> {
  const { general } = await getSettings();
  const tz = general.timezone;
  const employees = await reportEmployees();
  const ids = employees.map((e) => e.id);
  const from = startOfDay(fromKey, tz);
  const to = startOfDay(addDays(toKey, 1), tz);
  const today = toDateKey(now, tz);
  const [summaries, activity, idle] = await Promise.all([
    rangeSummary(ids, fromKey, toKey, now),
    rangeActivity(ids, from, to),
    db.idlePeriod.findMany({ where: { session: { userId: { in: ids } }, startedAt: { lt: to }, endedAt: { gt: from } }, include: { session: { select: { userId: true } } } }),
  ]);
  const idleByUser = new Map<string, number>();
  for (const p of idle) {
    const ms = Math.min(p.endedAt.getTime(), to.getTime()) - Math.max(p.startedAt.getTime(), from.getTime());
    idleByUser.set(p.session.userId, (idleByUser.get(p.session.userId) ?? 0) + ms);
  }
  return employees.map((e) => {
    const s = summaries.find((x) => x.userId === e.id)!;
    const a = activity.perUser.get(e.id)!;
    const pastWorking = s.workingDays.filter((k) => k < today);
    return {
      userId: e.id,
      name: e.name,
      workingDays: s.workingDays.length,
      presentDays: s.perDay.size,
      absentDays: pastWorking.filter((k) => !s.perDay.has(k)).length,
      requiredMs: s.requiredMs,
      workedMs: s.workedMs,
      diffMs: s.workedMs - s.requiredMs,
      idleMs: idleByUser.get(e.id) ?? 0,
      activityPercent: a.activityPercent,
      productivityPercent: a.productivityPercent,
    };
  });
}

export type DayStatus = "full" | "short" | "absent" | "weekend" | "holiday" | "future" | "not-started" | "extra";

export type AttendanceGrid = {
  days: DateKey[];
  holidays: Map<DateKey, string>;
  rows: { userId: string; name: string; cells: { key: DateKey; status: DayStatus; workedMs: number }[] }[];
};

/** جدول الحضور الشهري: لكل موظف ولكل يوم حالته */
export async function attendanceGrid(year: number, month: number, userIds?: string[], now = new Date()): Promise<AttendanceGrid> {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const days = daysInMonth(year, month);
  const employees = (await reportEmployees()).filter((e) => !userIds || userIds.includes(e.id));
  const [summaries, holidays] = await Promise.all([
    rangeSummary(employees.map((e) => e.id), days[0], days[days.length - 1], now),
    holidaysBetween(days[0], days[days.length - 1]),
  ]);
  const today = toDateKey(now, tz);
  return {
    days,
    holidays,
    rows: employees.map((e) => {
      const s = summaries.find((x) => x.userId === e.id)!;
      const working = new Set(s.workingDays);
      const startKey = e.hiredAt ? e.hiredAt.toISOString().slice(0, 10) : toDateKey(e.createdAt, tz);
      return {
        userId: e.id,
        name: e.name,
        cells: days.map((key) => {
          const worked = s.perDay.get(key) ?? 0;
          let status: DayStatus;
          if (key < startKey) status = "not-started";
          else if (holidays.has(key)) status = worked ? "extra" : "holiday";
          else if (settings.general.weekendDays.includes(weekdayOf(key))) status = worked ? "extra" : "weekend";
          else if (key > today) status = "future";
          else if (!working.has(key)) status = "weekend";
          else if (worked === 0) status = key === today ? "future" : "absent";
          else status = worked >= s.dailyMs ? "full" : "short";
          return { key, status, workedMs: worked };
        }),
      };
    }),
  };
}

export async function appsReport(fromKey: DateKey, toKey: DateKey) {
  const { general } = await getSettings();
  const employees = await reportEmployees();
  const { overall } = await rangeActivity(
    employees.map((e) => e.id),
    startOfDay(fromKey, general.timezone),
    startOfDay(addDays(toKey, 1), general.timezone),
  );
  return overall;
}

export { daysBetween };
