import "server-only";
import { db } from "./db";
import { deleteObject } from "./storage";
import { dayRange, type DateKey } from "./time";

export type ScreenshotView = {
  id: string;
  takenAt: Date;
  display: number;
  blurred: boolean;
  app: string | null;
  domain: string | null;
  /** نسبة النشاط في الفترة اللي قبل اللقطة */
  activityPercent: number | null;
};

/** لقطات يوم لموظف، ومع كل لقطة نسبة النشاط في الـ interval اللي قبلها */
export async function screenshotsForDay(userId: string, key: DateKey, tz: string, intervalMin: number): Promise<ScreenshotView[]> {
  const { start, end } = dayRange(key, tz);
  const [shots, minutes] = await Promise.all([
    db.screenshot.findMany({ where: { userId, takenAt: { gte: start, lt: end } }, orderBy: [{ takenAt: "asc" }, { display: "asc" }] }),
    db.activityMinute.findMany({
      where: { userId, minute: { gte: new Date(start.getTime() - intervalMin * 60_000), lt: end } },
      select: { minute: true, keyboard: true, mouse: true, idle: true },
    }),
  ]);
  return shots.map((s) => {
    const from = s.takenAt.getTime() - intervalMin * 60_000;
    const window = minutes.filter((m) => m.minute.getTime() >= from && m.minute.getTime() <= s.takenAt.getTime());
    const active = window.filter((m) => !m.idle && m.keyboard + m.mouse > 0).length;
    return {
      id: s.id,
      takenAt: s.takenAt,
      display: s.display,
      blurred: s.blurred,
      app: s.app,
      domain: s.domain,
      activityPercent: window.length ? Math.round((active / window.length) * 100) : null,
    };
  });
}

/** حذف اللقطات الأقدم من مدة الاحتفاظ (بيتنادى من المهام الدورية) */
export async function deleteExpiredScreenshots(retentionDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  let deleted = 0;
  for (;;) {
    const batch = await db.screenshot.findMany({ where: { takenAt: { lt: cutoff } }, take: 200, select: { id: true, storageKey: true } });
    if (!batch.length) break;
    for (const s of batch) await deleteObject(s.storageKey).catch(() => undefined);
    await db.screenshot.deleteMany({ where: { id: { in: batch.map((s) => s.id) } } });
    deleted += batch.length;
  }
  return deleted;
}
