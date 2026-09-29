/**
 * أدوات الوقت والمنطقة الزمنية وحساب ساعات العمل.
 * كل الحسابات بتتم على "يوم" حسب المنطقة الزمنية للشركة (افتراضيًا Africa/Cairo)
 * مش حسب UTC، عشان اليوم يبدأ وينتهي الساعة 12 بالليل بتوقيت القاهرة.
 */

export type DateKey = string; // "YYYY-MM-DD"

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function zonedParts(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** فرق التوقيت (بالمللي ثانية) بين المنطقة الزمنية وUTC في لحظة معينة */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function toDateKey(date: Date, tz: string): DateKey {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/** اللحظة اللي بيبدأ فيها اليوم (12 بالليل) في المنطقة الزمنية */
export function startOfDay(key: DateKey, tz: string): Date {
  const { year, month, day } = parseDateKey(key);
  const naive = Date.UTC(year, month - 1, day);
  let guess = naive - tzOffsetMs(new Date(naive), tz);
  // تصحيح لو اليوم فيه تغيير توقيت صيفي
  guess = naive - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function dayRange(key: DateKey, tz: string): { start: Date; end: Date } {
  return { start: startOfDay(key, tz), end: startOfDay(addDays(key, 1), tz) };
}

/** 0 = الأحد ... 5 = الجمعة، 6 = السبت */
export function weekdayOf(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function monthRange(year: number, month: number, tz: string): { start: Date; end: Date } {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start: startOfDay(first, tz), end: startOfDay(next, tz) };
}

export function daysInMonth(year: number, month: number): DateKey[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}

/** أيام العمل في الشهر: كل الأيام ما عدا الإجازة الأسبوعية والإجازات الرسمية */
export function workingDaysInMonth(
  year: number,
  month: number,
  weekendDays: number[],
  holidays: Iterable<DateKey>,
): DateKey[] {
  const off = new Set(holidays);
  return daysInMonth(year, month).filter((k) => !weekendDays.includes(weekdayOf(k)) && !off.has(k));
}

export type Interval = { startedAt: Date; endedAt: Date | null };
/** جلسة عمل ومعاها الفترات اللي ما بتتحسبش: الاستراحات وفترات الخمول */
export type SessionWithBreaks = Interval & { breaks: Interval[]; idlePeriods?: Interval[] };

/**
 * إجمالي وقت العمل الفعلي داخل فترة معينة:
 * وقت الجلسات ناقص (اتحاد) الاستراحات وفترات الخمول، عشان لو اتداخلوا ما يتخصموش مرتين.
 */
export function workedMs(sessions: SessionWithBreaks[], from: Date, to: Date, now: Date = new Date()): number {
  let total = 0;
  for (const s of sessions) {
    const winStart = Math.max(s.startedAt.getTime(), from.getTime());
    const winEnd = Math.min((s.endedAt ?? now).getTime(), to.getTime());
    if (winEnd <= winStart) continue;

    const excl = [...s.breaks, ...(s.idlePeriods ?? [])]
      .map((x) => [Math.max(x.startedAt.getTime(), winStart), Math.min((x.endedAt ?? s.endedAt ?? now).getTime(), winEnd)] as const)
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);

    let excluded = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [a, b] of excl) {
      if (a > curEnd) {
        excluded += curEnd - curStart;
        curStart = a;
        curEnd = b;
      } else if (b > curEnd) {
        curEnd = b;
      }
    }
    excluded += curEnd - curStart;
    total += winEnd - winStart - excluded;
  }
  return Math.max(0, total);
}

/** 5:07 (مقربة لأقرب دقيقة) */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${ms < 0 && totalMin > 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

/** عداد بالثواني: 1:05:09 */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const HOUR_MS = 3_600_000;
