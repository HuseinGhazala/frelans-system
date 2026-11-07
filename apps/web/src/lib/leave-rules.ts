import type { DateKey } from "./time";

/** رصيد العارضة الافتراضي في السنة (نوفمبر 2026: 12 يوم بدل 6) */
export const DEFAULT_CASUAL_DAYS = 12;
/** أقصى أيام عارضة في الشهر الواحد (المقبولة + المستنية + الطلب الجديد) */
export const CASUAL_MAX_PER_MONTH = 3;

const monthOf = (k: DateKey) => k.slice(0, 7);

/**
 * بيتأكد إن الطلب الجديد ما يخليش أي شهر يعدّي الحد.
 * requested: أيام العمل في الطلب الجديد. existing: أيام العمل في طلبات العارضة المقبولة والمستنية.
 * بيرجّع أول شهر بيعدّي الحد (ومتاح فيه قد إيه)، أو null لو تمام.
 */
export function casualMonthOverflow(
  requested: DateKey[],
  existing: DateKey[],
  max = CASUAL_MAX_PER_MONTH,
): { month: string; used: number; requested: number; available: number } | null {
  const used = new Map<string, number>();
  for (const k of new Set(existing)) used.set(monthOf(k), (used.get(monthOf(k)) ?? 0) + 1);
  const wanted = new Map<string, number>();
  for (const k of new Set(requested)) wanted.set(monthOf(k), (wanted.get(monthOf(k)) ?? 0) + 1);
  for (const [month, n] of [...wanted].sort()) {
    const u = used.get(month) ?? 0;
    if (u + n > max) return { month, used: u, requested: n, available: Math.max(0, max - u) };
  }
  return null;
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/** "2026-11" → "نوفمبر 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
