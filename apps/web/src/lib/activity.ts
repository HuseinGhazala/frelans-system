import "server-only";
import { db } from "./db";
import { classify, normalizeName, type Category } from "./productivity";
import { dayRange, toDateKey } from "./time";

export async function loadRules(): Promise<Map<string, Category>> {
  const rows = await db.appCategory.findMany();
  return new Map(rows.map((r) => [r.pattern, r.category]));
}

export type UsageItem = { name: string; minutes: number; category: Category };

export type DayActivity = {
  trackedMinutes: number;
  activeMinutes: number;
  activityPercent: number | null;
  productivityPercent: number | null;
  byCategory: Record<Category, number>;
  idleMs: number;
  apps: UsageItem[];
  domains: UsageItem[];
};

type MinuteRow = { keyboard: number; mouse: number; app: string | null; domain: string | null; idle: boolean };

/** ملخص مجموعة دقائق: النشاط والإنتاجية وأكتر البرامج والمواقع */
export function summarizeMinutes(minutes: MinuteRow[], rules: Map<string, Category>, topN = 8) {
  const apps = new Map<string, number>();
  const domains = new Map<string, number>();
  const byCategory: Record<Category, number> = { PRODUCTIVE: 0, NEUTRAL: 0, UNPRODUCTIVE: 0 };
  let active = 0;
  let tracked = 0;
  for (const m of minutes) {
    if (m.idle) continue;
    tracked++;
    if (m.keyboard + m.mouse > 0) active++;
    byCategory[classify(rules, m.app, m.domain)]++;
    if (m.app) apps.set(m.app, (apps.get(m.app) ?? 0) + 1);
    if (m.domain) domains.set(m.domain, (domains.get(m.domain) ?? 0) + 1);
  }
  const top = (counts: Map<string, number>, isDomain: boolean): UsageItem[] =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([name, minutes]) => ({ name, minutes, category: isDomain ? classify(rules, null, name) : classify(rules, name, null) }));
  return {
    trackedMinutes: tracked,
    activeMinutes: active,
    activityPercent: tracked ? Math.round((active / tracked) * 100) : null,
    productivityPercent: tracked ? Math.round((byCategory.PRODUCTIVE / tracked) * 100) : null,
    byCategory,
    apps: top(apps, false),
    domains: top(domains, true),
  };
}

/** نشاط يوم من برنامج الديسكتوب: نسبة النشاط والإنتاجية، أكتر البرامج والمواقع، ووقت الخمول */
export async function dayActivity(userId: string, tz: string, date = new Date()): Promise<DayActivity> {
  const { start, end } = dayRange(toDateKey(date, tz), tz);
  const [minutes, idle, rules] = await Promise.all([
    db.activityMinute.findMany({ where: { userId, minute: { gte: start, lt: end } }, select: { keyboard: true, mouse: true, app: true, domain: true, idle: true } }),
    db.idlePeriod.findMany({ where: { session: { userId }, startedAt: { lt: end }, endedAt: { gt: start } } }),
    loadRules(),
  ]);
  const idleMs = idle.reduce((sum, p) => sum + Math.min(p.endedAt.getTime(), end.getTime()) - Math.max(p.startedAt.getTime(), start.getTime()), 0);
  return { ...summarizeMinutes(minutes, rules), idleMs };
}

/** نشاط كل موظف في فترة (للتقارير) */
export async function rangeActivity(userIds: string[], from: Date, to: Date) {
  const [rows, rules] = await Promise.all([
    db.activityMinute.findMany({
      where: { userId: { in: userIds }, minute: { gte: from, lt: to } },
      select: { userId: true, keyboard: true, mouse: true, app: true, domain: true, idle: true },
    }),
    loadRules(),
  ]);
  const byUser = new Map<string, MinuteRow[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  return {
    perUser: new Map(userIds.map((id) => [id, summarizeMinutes(byUser.get(id) ?? [], rules)])),
    overall: summarizeMinutes(rows, rules, 30),
  };
}

/** أسماء برامج ومواقع ظهرت مؤخرًا ولسه ما اتصنفتش */
export async function unclassifiedNames(days = 30, limit = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [apps, domains, rules] = await Promise.all([
    db.activityMinute.groupBy({ by: ["app"], where: { minute: { gte: since }, idle: false, app: { not: null } }, _count: true }),
    db.activityMinute.groupBy({ by: ["domain"], where: { minute: { gte: since }, idle: false, domain: { not: null } }, _count: true }),
    loadRules(),
  ]);
  const seen = new Map<string, number>();
  for (const a of apps) if (a.app) seen.set(normalizeName(a.app), (seen.get(normalizeName(a.app)) ?? 0) + a._count);
  for (const d of domains) if (d.domain) seen.set(normalizeName(d.domain), (seen.get(normalizeName(d.domain)) ?? 0) + d._count);
  return [...seen.entries()]
    .filter(([name]) => !rules.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, minutes]) => ({ name, minutes }));
}
