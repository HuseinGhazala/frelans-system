import "server-only";
import { dayActivity } from "./activity";
import { createAlert, emailAdmins } from "./alerts";
import { closeStaleAgentSessions, rangeSummary } from "./attendance";
import { db } from "./db";
import { deleteExpiredScreenshots } from "./screenshots";
import { getSettings } from "./settings";
import { addDays, formatDuration, startOfDay, toDateKey, tzOffsetMs } from "./time";
import { syncTrello } from "./trello";
import { escapeHtml } from "./utils";

/**
 * المهام الدورية — بتتنادى كل دقيقة (من جوه السيرفر، أو من /api/cron لو الاستضافة serverless).
 * كل مهمة بتحفظ آخر مرة اشتغلت فيها في جدول Setting عشان ما تتكررش.
 */
async function getMark(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: `jobs.${key}` } });
  return typeof row?.value === "string" ? row.value : null;
}

async function setMark(key: string, value: string) {
  await db.setting.upsert({ where: { key: `jobs.${key}` }, create: { key: `jobs.${key}`, value }, update: { value } });
}

/** الساعة والدقيقة الحالية بتوقيت الشركة "HH:MM" */
function localTime(now: Date, tz: string) {
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  return local.toISOString().slice(11, 16);
}

/** خمول طويل: الموظف مسجل حضور من البرنامج ومفيش نشاط أكتر من الحد */
async function checkLongIdle(now: Date) {
  const { alerts, general } = await getSettings();
  if (!alerts.longIdle) return;
  const cutoff = new Date(now.getTime() - alerts.longIdleMin * 60_000);
  const sessions = await db.workSession.findMany({
    where: { endedAt: null, source: "AGENT", device: { idleSince: { lt: cutoff } }, breaks: { none: { endedAt: null } } },
    include: { device: true, user: true },
  });
  for (const s of sessions) {
    const since = s.device!.idleSince!;
    const min = Math.round((now.getTime() - since.getTime()) / 60_000);
    await createAlert({
      type: "LONG_IDLE",
      userId: s.userId,
      day: toDateKey(now, general.timezone),
      dedupeKey: `LONG_IDLE:${s.userId}:${since.toISOString()}`,
      message: `${s.user.name} خامل من ${min} دقيقة وهو مسجل حضور`,
      link: `/admin/employees/${s.userId}`,
    });
  }
}

/** تقييم يوم خلص: غياب، ساعات ناقصة، إنتاجية منخفضة */
export async function evaluateDay(day: string) {
  const { alerts, general } = await getSettings();
  const employees = await db.user.findMany({ where: { role: "EMPLOYEE", active: true }, select: { id: true, name: true } });
  if (!employees.length) return;
  const summaries = await rangeSummary(employees.map((e) => e.id), day, day, startOfDay(addDays(day, 1), general.timezone));
  for (const e of employees) {
    const s = summaries.find((x) => x.userId === e.id)!;
    if (!s.workingDays.includes(day) || s.leaveDays.has(day)) continue;
    const worked = s.perDay.get(day) ?? 0;
    const link = `/admin/employees/${e.id}?tab=day&date=${day}`;
    if (worked === 0) {
      if (alerts.absence) await createAlert({ type: "ABSENCE", userId: e.id, day, dedupeKey: `ABSENCE:${e.id}:${day}`, message: `${e.name} ما سجلش حضور يوم ${day} — غياب`, link });
      continue;
    }
    if (alerts.missingHours && worked < s.dailyMs) {
      await createAlert({
        type: "MISSING_HOURS",
        userId: e.id,
        day,
        dedupeKey: `MISSING_HOURS:${e.id}:${day}`,
        message: `${e.name} اشتغل ${formatDuration(worked)} من ${formatDuration(s.dailyMs)} يوم ${day}`,
        link,
      });
    }
    if (alerts.lowProductivity) {
      const a = await dayActivity(e.id, general.timezone, startOfDay(day, general.timezone));
      // محتاجين نص ساعة نشاط على الأقل عشان النسبة تبقى ليها معنى
      if (a.trackedMinutes >= 30 && a.productivityPercent != null && a.productivityPercent < alerts.lowProductivityPercent) {
        await createAlert({
          type: "LOW_PRODUCTIVITY",
          userId: e.id,
          day,
          dedupeKey: `LOW_PRODUCTIVITY:${e.id}:${day}`,
          message: `إنتاجية ${e.name} يوم ${day} كانت ${a.productivityPercent}%`,
          link,
        });
      }
    }
  }
}

/** ملخص اليوم بالإيميل: جدول لكل الفريق */
export async function sendDailySummary(day: string, now = new Date()) {
  const { general } = await getSettings();
  const employees = await db.user.findMany({ where: { role: "EMPLOYEE", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (!employees.length) return;
  const summaries = await rangeSummary(employees.map((e) => e.id), day, day, now);
  const rows: string[] = [];
  for (const e of employees) {
    const s = summaries.find((x) => x.userId === e.id)!;
    const a = await dayActivity(e.id, general.timezone, startOfDay(day, general.timezone));
    const worked = s.perDay.get(day) ?? 0;
    const status = s.leaveDays.has(day) ? "إجازة" : !s.workingDays.includes(day) ? "عطلة" : worked === 0 ? "غياب" : worked >= s.dailyMs ? "كمّل" : "ناقص";
    const top = a.apps.slice(0, 3).map((x) => escapeHtml(x.name)).join("، ") || "—";
    rows.push(
      `<tr><td>${escapeHtml(e.name)}</td><td>${status}</td><td>${formatDuration(worked)}</td><td>${a.activityPercent ?? "—"}%</td><td>${a.productivityPercent ?? "—"}%</td><td>${top}</td></tr>`,
    );
  }
  const td = 'style="border:1px solid #e2e8f0;padding:6px 10px"';
  const html = `<h2>ملخص يوم ${day} — ${escapeHtml(general.companyName)}</h2>
<table style="border-collapse:collapse;font-size:14px"><thead><tr>${["الموظف", "الحالة", "الساعات", "النشاط", "الإنتاجية", "أكتر البرامج"].map((h) => `<th ${td}>${h}</th>`).join("")}</tr></thead>
<tbody>${rows.join("").replaceAll("<td>", `<td ${td}>`)}</tbody></table>`;
  await emailAdmins(`ملخص يوم ${day} — راصد`, html);
}

let running = false;

export async function runScheduledJobs(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const settings = await getSettings();
    const tz = settings.general.timezone;
    const today = toDateKey(now, tz);
    const yesterday = addDays(today, -1);

    await closeStaleAgentSessions(now);
    await checkLongIdle(now);

    // تقييم الأيام اللي خلصت (ولو السيرفر كان واقف نعوّض لحد أسبوع)
    const last = await getMark("evaluatedDay");
    let day = last && last >= addDays(yesterday, -7) ? addDays(last, 1) : yesterday;
    for (; day <= yesterday; day = addDays(day, 1)) {
      await evaluateDay(day);
      await setMark("evaluatedDay", day);
    }

    if (settings.alerts.dailySummary && localTime(now, tz) >= settings.alerts.dailySummaryTime && (await getMark("summaryDay")) !== today) {
      await setMark("summaryDay", today);
      await sendDailySummary(today, now);
    }

    if ((await getMark("cleanupDay")) !== today) {
      await setMark("cleanupDay", today);
      await deleteExpiredScreenshots(settings.attendance.screenshotRetentionDays, now);
      // أحداث البرنامج القديمة (للحماية من التكرار) مش محتاجينها بعد أسبوع
      await db.processedEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
    }

    const lastTrello = await getMark("trelloSync");
    if (!lastTrello || now.getTime() - Date.parse(lastTrello) >= 15 * 60_000) {
      await setMark("trelloSync", now.toISOString());
      await syncTrello(now).catch((e) => console.error("trello sync failed", e));
    }
  } catch (e) {
    console.error("scheduled jobs failed", e);
  } finally {
    running = false;
  }
}
