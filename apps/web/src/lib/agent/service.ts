import "server-only";
import { db } from "@/lib/db";
import { closeStaleAgentSessions, workedTodayByUser } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import type { ActivityMinuteInput, AgentEvent, AgentState } from "./protocol";

const MAX_FUTURE_MS = 2 * 60_000;
const MAX_PAST_MS = 48 * 3_600_000;

/** وقت من البرنامج: ما ينفعش يكون في المستقبل، والقديم أوي بيترفض */
export function clampTime(at: Date, now: Date): Date | null {
  if (at.getTime() > now.getTime() + MAX_FUTURE_MS) return now;
  if (at.getTime() < now.getTime() - MAX_PAST_MS) return null;
  return at.getTime() > now.getTime() ? now : at;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

async function openSessionOf(userId: string) {
  return db.workSession.findFirst({ where: { userId, endedAt: null }, include: { breaks: { where: { endedAt: null } } } });
}

/** الجلسة اللي كانت شغالة في لحظة معينة */
async function sessionAt(userId: string, at: Date) {
  return db.workSession.findFirst({
    where: { userId, startedAt: { lte: at }, OR: [{ endedAt: null }, { endedAt: { gte: at } }] },
    orderBy: { startedAt: "desc" },
  });
}

async function closeSession(sessionId: string, startedAt: Date, at: Date, reason: "MANUAL" | "AUTO_IDLE") {
  const endedAt = at < startedAt ? startedAt : at;
  await db.$transaction([
    db.break.updateMany({ where: { sessionId, endedAt: null }, data: { endedAt } }),
    db.workSession.update({ where: { id: sessionId }, data: { endedAt, endReason: reason } }),
  ]);
}

/** تطبيق الأحداث بالترتيب، مع تجاهل أي حدث اتنفذ قبل كده */
export async function applyEvents(userId: string, deviceId: string, events: AgentEvent[], now = new Date()) {
  for (const event of events) {
    try {
      await db.processedEvent.create({ data: { deviceId, eventId: event.id } });
    } catch (e) {
      if (isUniqueViolation(e)) continue; // اتنفذ قبل كده
      throw e;
    }
    await applyEvent(userId, deviceId, event, now);
  }
}

/**
 * لو جلسة الجهاز اتقفلت لأنه بطّل يبعت (النت فصل مثلاً) والبرنامج رجع ومعاه نشاط بعد القفل،
 * يبقى الموظف كان شغال أوفلاين — نرجّع فتح الجلسة بدل ما الوقت يضيع.
 */
export async function resumeLostSession(userId: string, deviceId: string, minutes: ActivityMinuteInput[]) {
  const active = minutes.filter((m) => !m.idle && m.keyboard + m.mouse > 0);
  if (!active.length) return;
  const latest = await db.workSession.findFirst({ where: { userId }, orderBy: { startedAt: "desc" } });
  if (!latest || latest.deviceId !== deviceId || latest.endReason !== "AGENT_LOST" || !latest.endedAt) return;
  const lastActive = Math.max(...active.map((m) => m.minute.getTime()));
  if (lastActive <= latest.endedAt.getTime()) return;
  try {
    await db.workSession.update({ where: { id: latest.id }, data: { endedAt: null, endReason: null } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // في جلسة تانية اتفتحت في الوقت ده
  }
}

/** تطبيق حدث واحد. الأحداث مصممة إنها لو اتكررت ما تعملش حاجة غلط. */
async function applyEvent(userId: string, deviceId: string, event: AgentEvent, now: Date) {
  const at = clampTime(event.at, now);
  if (!at) return;
  const open = await openSessionOf(userId);

  switch (event.type) {
    case "check_in": {
      if (open?.source === "AGENT" && open.deviceId === deviceId) return; // مكرر
      // لو في جلسة مفتوحة (من الموقع أو جهاز تاني) نقفلها ونبدأ جلسة البرنامج
      if (open) await closeSession(open.id, open.startedAt, at, "MANUAL");
      try {
        await db.workSession.create({ data: { userId, deviceId, source: "AGENT", startedAt: at } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      return;
    }
    case "check_out": {
      if (!open) return;
      await closeSession(open.id, open.startedAt, at, event.reason);
      return;
    }
    case "break_start": {
      if (!open || open.breaks.length) return;
      try {
        await db.break.create({ data: { sessionId: open.id, startedAt: at < open.startedAt ? open.startedAt : at } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      return;
    }
    case "break_end": {
      if (!open?.breaks.length) return;
      await db.break.updateMany({ where: { sessionId: open.id, endedAt: null }, data: { endedAt: at } });
      return;
    }
    case "idle": {
      const endAt = clampTime(event.endAt, now) ?? at;
      if (endAt <= at) return;
      const session = await sessionAt(userId, at);
      if (!session) return;
      await db.idlePeriod.upsert({
        where: { sessionId_startedAt: { sessionId: session.id, startedAt: at } },
        create: { sessionId: session.id, startedAt: at, endedAt: endAt },
        update: { endedAt: endAt },
      });
      return;
    }
  }
}

/** حفظ ملخص الدقائق. الدقيقة اللي مش جوه أي جلسة بتتجاهل. */
export async function saveMinutes(userId: string, minutes: ActivityMinuteInput[], now = new Date()) {
  if (!minutes.length) return;
  const sorted = [...minutes].sort((a, b) => a.minute.getTime() - b.minute.getTime());
  const from = sorted[0].minute;
  const to = sorted[sorted.length - 1].minute;
  const sessions = await db.workSession.findMany({
    // الجلسة ممكن تبدأ في نص الدقيقة، فبندوّر لحد نهاية آخر دقيقة
    where: { userId, startedAt: { lt: new Date(to.getTime() + 60_000) }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
    select: { id: true, startedAt: true, endedAt: true },
  });
  for (const m of sorted) {
    const minute = clampTime(m.minute, now);
    if (!minute) continue;
    // الدقيقة محسوبة للجلسة لو بدايتها أو نهايتها جوه الجلسة
    const minuteEnd = minute.getTime() + 60_000;
    const s = sessions.find((x) => x.startedAt.getTime() < minuteEnd && (!x.endedAt || x.endedAt.getTime() > minute.getTime()));
    if (!s) continue;
    const data = {
      keyboard: m.keyboard,
      mouse: m.mouse,
      app: m.app ?? null,
      title: m.title ?? null,
      domain: m.domain ?? null,
      idle: m.idle,
    };
    await db.activityMinute.upsert({
      where: { userId_minute: { userId, minute } },
      create: { userId, sessionId: s.id, minute, ...data },
      update: data,
    });
  }
}

export async function buildState(userId: string, now = new Date()): Promise<AgentState> {
  await closeStaleAgentSessions(now);
  const settings = await getSettings();
  const [user, open, worked] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } }),
    openSessionOf(userId),
    workedTodayByUser([userId], settings.general.timezone, now),
  ]);
  const p = user.profile;
  const a = settings.attendance;
  return {
    serverTime: now.toISOString(),
    companyName: settings.general.companyName,
    user: { id: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle },
    consentRequired: !user.monitoringConsentAt,
    config: {
      dailyHours: p ? Number(p.dailyHours) : a.defaultDailyHours,
      idleThresholdMin: p?.idleThresholdMin ?? a.idleThresholdMin,
      autoCheckoutIdleMin: a.autoCheckoutIdleMin,
      screenshotIntervalMin: p?.screenshotIntervalMin ?? a.screenshotIntervalMin,
      blurScreenshots: p?.blurScreenshots ?? a.blurScreenshots,
    },
    status: !open ? "OFFLINE" : open.breaks.length ? "ON_BREAK" : "WORKING",
    session: open
      ? { id: open.id, source: open.source, startedAt: open.startedAt.toISOString(), breakStartedAt: open.breaks[0]?.startedAt.toISOString() ?? null }
      : null,
    todayWorkedMs: worked.get(userId) ?? 0,
  };
}
