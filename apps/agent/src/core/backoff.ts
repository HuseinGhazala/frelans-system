/**
 * مدة الانتظار قبل محاولة الاتصال رقم attempt (من 0): أُسّي مع jitter، وله حد أقصى.
 * attempt 0 = أول إعادة بعد ما الاتصال وقع.
 */
export function backoffDelay(attempt: number, opts: { baseMs?: number; maxMs?: number; random?: () => number } = {}): number {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 60_000;
  const random = opts.random ?? Math.random;
  const exp = Math.min(max, base * 2 ** Math.max(0, Math.min(attempt, 30)));
  // "equal jitter": نص المدة ثابت والنص التاني عشوائي — عشان الأجهزة كلها ما ترجعش في نفس اللحظة
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** عدّاد المحاولات: بيزيد مع كل فشل، وبيرجع صفر بعد اتصال ثابت */
export class Backoff {
  private attempt = 0;
  constructor(private opts: { baseMs?: number; maxMs?: number; random?: () => number } = {}) {}

  next(): number {
    return backoffDelay(this.attempt++, this.opts);
  }

  reset() {
    this.attempt = 0;
  }

  get attempts() {
    return this.attempt;
  }
}
