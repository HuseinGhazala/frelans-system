import "server-only";
import { db } from "./db";
import { dayRange, toDateKey } from "./time";

export type DayActivity = {
  trackedMinutes: number;
  activeMinutes: number;
  activityPercent: number | null;
  idleMs: number;
  apps: { name: string; minutes: number }[];
  domains: { name: string; minutes: number }[];
};

function top(counts: Map<string, number>, n: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, minutes]) => ({ name, minutes }));
}

/** نشاط يوم من برنامج الديسكتوب: نسبة النشاط، أكتر البرامج والمواقع، ووقت الخمول */
export async function dayActivity(userId: string, tz: string, date = new Date()): Promise<DayActivity> {
  const { start, end } = dayRange(toDateKey(date, tz), tz);
  const [minutes, idle] = await Promise.all([
    db.activityMinute.findMany({ where: { userId, minute: { gte: start, lt: end } }, select: { keyboard: true, mouse: true, app: true, domain: true, idle: true } }),
    db.idlePeriod.findMany({ where: { session: { userId }, startedAt: { lt: end }, endedAt: { gt: start } } }),
  ]);
  const apps = new Map<string, number>();
  const domains = new Map<string, number>();
  let active = 0;
  for (const m of minutes) {
    if (m.idle) continue;
    if (m.keyboard + m.mouse > 0) active++;
    if (m.app) apps.set(m.app, (apps.get(m.app) ?? 0) + 1);
    if (m.domain) domains.set(m.domain, (domains.get(m.domain) ?? 0) + 1);
  }
  const tracked = minutes.filter((m) => !m.idle).length;
  const idleMs = idle.reduce((sum, p) => sum + Math.min(p.endedAt.getTime(), end.getTime()) - Math.max(p.startedAt.getTime(), start.getTime()), 0);
  return {
    trackedMinutes: tracked,
    activeMinutes: active,
    activityPercent: tracked ? Math.round((active / tracked) * 100) : null,
    idleMs,
    apps: top(apps, 8),
    domains: top(domains, 8),
  };
}
