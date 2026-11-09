import type { DateKey } from "./time";

/**
 * الناقص والزيادة في فترة (بالمللي ثانية).
 * - قبل dailyFrom (أو كل الفترة لو dailyFrom = null): حساب صافي — الناقص في يوم بيتعوض بالزيادة في يوم تاني.
 * - من dailyFrom: كل يوم لوحده — ناقص اليوم بيتخصم، وزيادته (أو الشغل في يوم إجازة) بتبقى إضافي مقترح بس.
 * المحسوب لليوم = الشغل الفعلي + رصيد الإجازة المدفوعة في اليوم ده.
 */
export function shortfallAndSurplus(input: {
  days: DateKey[];
  workingDays: Set<DateKey>;
  dailyMs: number;
  workedPerDay: Map<DateKey, number>;
  paidLeavePerDay: Map<DateKey, number>;
  dailyFrom: DateKey | null;
}): { shortMs: number; surplusMs: number } {
  const { days, workingDays, dailyMs, workedPerDay, paidLeavePerDay, dailyFrom } = input;
  let netRequired = 0;
  let netCredited = 0;
  let shortMs = 0;
  let surplusMs = 0;
  for (const k of days) {
    const required = workingDays.has(k) ? dailyMs : 0;
    const credited = (workedPerDay.get(k) ?? 0) + (paidLeavePerDay.get(k) ?? 0);
    if (dailyFrom !== null && k >= dailyFrom) {
      shortMs += Math.max(0, required - credited);
      surplusMs += Math.max(0, credited - required);
    } else {
      netRequired += required;
      netCredited += credited;
    }
  }
  shortMs += Math.max(0, netRequired - netCredited);
  surplusMs += Math.max(0, netCredited - netRequired);
  return { shortMs, surplusMs };
}
