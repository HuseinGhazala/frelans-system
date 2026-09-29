/**
 * حد بسيط لمحاولات تسجيل الدخول (في الذاكرة).
 * كافي لسيرفر واحد وشركة صغيرة؛ لو اتنشر على أكتر من سيرفر يتنقل لـ Redis/DB.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, max = 5, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= max;
}

export function recordFailure(key: string, windowMs = 15 * 60_000, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else entry.count++;
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
