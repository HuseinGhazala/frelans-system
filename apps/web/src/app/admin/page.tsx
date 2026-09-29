import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/db";
import { workedTodayByUser, type LiveStatus } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { formatDuration, HOUR_MS, toDateKey, weekdayOf } from "@/lib/time";

export const metadata: Metadata = { title: "الرئيسية" };

const dateFmt = (tz: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
const timeFmt = (tz: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: tz });

export default async function AdminHome() {
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const now = new Date();
  const todayKey = toDateKey(now, tz);
  const isWeekend = settings.general.weekendDays.includes(weekdayOf(todayKey));

  const employees = await db.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    include: {
      profile: true,
      workSessions: { where: { endedAt: null }, include: { breaks: { where: { endedAt: null } } }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  const worked = await workedTodayByUser(employees.map((e) => e.id), tz, now);

  const rows = employees.map((e) => {
    const open = e.workSessions[0];
    const status: LiveStatus = !open ? "OFFLINE" : open.breaks.length ? "ON_BREAK" : "WORKING";
    const workedMs = worked.get(e.id) ?? 0;
    const requiredMs = Number(e.profile?.dailyHours ?? settings.attendance.defaultDailyHours) * HOUR_MS;
    return { e, open, status, workedMs, requiredMs };
  });
  const count = (s: LiveStatus) => rows.filter((r) => r.status === s).length;
  const notCheckedIn = rows.filter((r) => r.workedMs === 0 && r.status === "OFFLINE").length;
  const order: Record<LiveStatus, number> = { WORKING: 0, ON_BREAK: 1, OFFLINE: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <>
      <PageHeader title="الرئيسية" description={`${dateFmt(tz).format(now)}${isWeekend ? " — إجازة أسبوعية" : ""}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="يعملون الآن" value={count("WORKING")} tone="success" />
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
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
