/**
 * المهام الدورية بتشتغل كل دقيقة جوه السيرفر (next start على VPS أو Docker).
 * على استضافة serverless (زي Vercel) حط DISABLE_INTERNAL_CRON=1 واستخدم /api/cron بدلها.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_INTERNAL_CRON === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { runScheduledJobs } = await import("./lib/jobs");
  const timer = setInterval(() => void runScheduledJobs(), 60_000);
  timer.unref?.();
  // أول تشغيل بعد ما السيرفر يقوم بشوية
  setTimeout(() => void runScheduledJobs(), 10_000).unref?.();
}
