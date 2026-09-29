import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db";
import { closeStaleAgentSessions, liveStatusOf, workedTodayByUser, type LiveStatus } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { addDays, daysInMonth, formatDuration, HOUR_MS, parseDateKey, startOfDay, toDateKey, weekdayOf } from "@/lib/time";
import { deliveryStats, employeeDelivery } from "@/lib/delivery";

export const metadata: Metadata = { title: "الرئيسية" };

const dateFmt = (tz: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
const timeFmt = (tz: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: tz });

export default async function AdminHome() {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const now = new Date();
  const todayKey = toDateKey(now, tz);
  const isWeekend = settings.general.weekendDays.includes(weekdayOf(todayKey));

  await closeStaleAgentSessions(now);
  const employees = await db.user.findMany({
    where: { role: "EMPLOYEE", active: true, NOT: { profile: { is: { workMode: "TASKS" } } } },
    include: {
      profile: true,
      workSessions: { where: { endedAt: null }, include: { breaks: { where: { endedAt: null } }, device: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const worked = await workedTodayByUser(employees.map((e) => e.id), tz, now);
  const taskStaff = await db.user.findMany({
    where: { role: "EMPLOYEE", active: true, profile: { is: { workMode: "TASKS" } } },
    select: { id: true, name: true, jobTitle: true },
    orderBy: { name: "asc" },
  });
  const { year: y, month: m } = parseDateKey(todayKey);
  const md = daysInMonth(y, m);
  const taskRows = await Promise.all(
    taskStaff.map(async (e) => ({ e, s: deliveryStats(await employeeDelivery(e.id, startOfDay(md[0], tz), startOfDay(addDays(md[md.length - 1], 1), tz), now)) })),
  );

  const rows = employees.map((e) => {
    const open = e.workSessions[0];
    const status = liveStatusOf(open ?? null);
    const workedMs = worked.get(e.id) ?? 0;
    const requiredMs = Number(e.profile?.dailyHours ?? settings.attendance.defaultDailyHours) * HOUR_MS;
    return { e, open, status, workedMs, requiredMs };
  });
  const count = (s: LiveStatus) => rows.filter((r) => r.status === s).length;
  const notCheckedIn = rows.filter((r) => r.workedMs === 0 && r.status === "OFFLINE").length;
  const order: Record<LiveStatus, number> = { WORKING: 0, IDLE: 1, ON_BREAK: 2, OFFLINE: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <>
      <PageHeader title="الرئيسية" description={`${dateFmt(tz).format(now)}${isWeekend ? " — إجازة أسبوعية" : ""}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="يعملون الآن" value={count("WORKING")} tone="success" hint={count("IDLE") ? `+ ${count("IDLE")} خامل` : undefined} />
        <StatCard label="في استراحة" value={count("ON_BREAK")} tone="warning" />
        <StatCard label="لم يسجلوا حضور اليوم" value={isWeekend ? "—" : notCheckedIn} tone={notCheckedIn && !isWeekend ? "danger" : "default"} />
        <StatCard label="إجمالي الموظفين" value={employees.length} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">الفريق الآن</h2>
      {employees.length === 0 ? (
        <Card>
          <EmptyState
            title="لسه مفيش موظفين"
            description="ضيف أول موظف، وهيوصله رابط يعيّن منه كلمة المرور."
            action={<Link href="/admin/employees/new" className={buttonClass()}>إضافة موظف</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ e, open, status, workedMs, requiredMs }) => (
            <Link key={e.id} href={`/admin/employees/${e.id}`} className="block">
              <Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <Avatar name={e.name} status={status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted">{e.jobTitle ?? "—"}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-4 flex items-baseline justify-between text-sm">
                  <span className="text-muted">ساعات اليوم</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{formatDuration(workedMs)}</span>
                    <span className="text-muted"> من {formatDuration(requiredMs)}</span>
                  </span>
                </div>
                <Progress className="mt-2" value={(workedMs / requiredMs) * 100} />
                <div className="mt-3 flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted">
                  {open && <span>من {timeFmt(tz).format(open.startedAt)}</span>}
                  {open?.source === "WEB" && <Badge tone="info">جلسة من الموقع</Badge>}
                  {status === "IDLE" && open?.device?.idleSince && (
                    <Badge tone="danger">خامل منذ {Math.max(1, Math.round((now.getTime() - open.device.idleSince.getTime()) / 60000))} د</Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {taskRows.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">موظفين نظام التاسكات — الشهر ده</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {taskRows.map(({ e, s: st }) => (
              <Link key={e.id} href={`/admin/employees/${e.id}`} className="block">
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <Avatar name={e.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.name}</p>
                      <p className="truncate text-xs text-muted">{e.jobTitle ?? "—"}</p>
                    </div>
                    {st.overdue > 0 ? <Badge tone="danger">{st.overdue} متأخر</Badge> : <Badge tone="success">مفيش تأخير</Badge>}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><p className="text-lg font-bold tabular-nums">{st.done}</p><p className="text-muted">اتسلّم</p></div>
                    <div><p className="text-lg font-bold tabular-nums text-warning">{st.late}</p><p className="text-muted">اتسلّم متأخر</p></div>
                    <div><p className="text-lg font-bold tabular-nums">{st.open}</p><p className="text-muted">شغال عليه</p></div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
