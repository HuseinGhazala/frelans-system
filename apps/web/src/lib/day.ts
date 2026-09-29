import "server-only";
import { sessionsBetween } from "./attendance";
import { dayRange, workedMs, type DateKey } from "./time";

export type Segment = { kind: "work" | "web" | "break" | "idle"; start: number; end: number };

/** شريط اليوم: الشغل، الاستراحات، الخمول — مقصوص على حدود اليوم */
export async function dayTimeline(userId: string, key: DateKey, tz: string, now = new Date()) {
  const { start, end } = dayRange(key, tz);
  const sessions = await sessionsBetween([userId], start, end);
  const clip = (a: Date, b: Date | null) => [Math.max(a.getTime(), start.getTime()), Math.min((b ?? now).getTime(), end.getTime())] as const;
  const segments: Segment[] = [];
  for (const s of sessions) {
    const [a, b] = clip(s.startedAt, s.endedAt);
    if (b <= a) continue;
    segments.push({ kind: s.source === "WEB" ? "web" : "work", start: a, end: b });
    for (const br of s.breaks) {
      const [x, y] = clip(br.startedAt, br.endedAt ?? s.endedAt);
      if (y > x) segments.push({ kind: "break", start: x, end: y });
    }
    for (const idle of s.idlePeriods) {
      const [x, y] = clip(idle.startedAt, idle.endedAt ?? s.endedAt);
      if (y > x) segments.push({ kind: "idle", start: x, end: y });
    }
  }
  const breakMs = segments.filter((x) => x.kind === "break").reduce((t, x) => t + x.end - x.start, 0);
  const idleMs = segments.filter((x) => x.kind === "idle").reduce((t, x) => t + x.end - x.start, 0);
  return {
    dayStart: start.getTime(),
    dayEnd: end.getTime(),
    segments,
    workedMs: workedMs(sessions, start, end, now),
    breakMs,
    idleMs,
    firstIn: sessions.length ? Math.max(Math.min(...sessions.map((s) => s.startedAt.getTime())), start.getTime()) : null,
  };
}
