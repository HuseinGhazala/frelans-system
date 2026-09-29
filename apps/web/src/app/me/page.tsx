import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { ClockControls } from "@/components/attendance/clock-controls";
import { DayActivityCard } from "@/components/attendance/day-activity";
import { dayActivity } from "@/lib/activity";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getOpenSession, liveStatusOf, monthSummary, workedTodayByUser } from "@/lib/attendance";
import { requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, daysInMonth, formatDuration, HOUR_MS, parseDateKey, startOfDay, toDateKey } from "@/lib/time";
import { DeliveryView } from "@/components/tasks/delivery-view";
import { employeeDelivery } from "@/lib/delivery";

export const metadata: Metadata = { title: "الرئيسية" };

function greeting(hour: number) {
  return hour < 12 ? "صباح الخير" : "مساء الخير";
}

export default async function EmployeeHome() {
  const user = await requireEmployee();
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const now = new Date();
  const { year, month } = parseDateKey(toDateKey(now, tz));
  const mode = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { workMode: true, trelloMemberId: true } });
  if (mode?.workMode === "TASKS") {
    const days = daysInMonth(year, month);
    const cards = await employeeDelivery(user.id, startOfDay(days[0], tz), startOfDay(addDays(days[days.length - 1], 1), tz), now);
    const hourNow = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            {greeting(hourNow)} يا {user.name.split(/\s+/)[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-muted">نظام شغلك بالتاسكات — تاسكاتك الشهر ده من Trello. التسليم بيتحسب لما الكارت يتنقل لليست التسليم.</p>
        </div>
        <DeliveryView cards={cards} tz={tz} linked={Boolean(mode.trelloMemberId)} />
      </>
    );
  }
  const [profile, open, today, summary, activity] = await Promise.all([
    db.employeeProfile.findUnique({ where: { userId: user.id } }),
    getOpenSession(user.id),
    workedTodayByUser([user.id], tz, now),
    monthSummary(user.id, year, month, now),
    dayActivity(user.id, tz, now),
  ]);
  const status = liveStatusOf(open);
  const dailyMs = Number(profile?.dailyHours ?? settings.attendance.defaultDailyHours) * HOUR_MS;
  const remaining = summary.requiredMs - summary.workedMs - summary.paidLeaveMs;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const firstName = user.name.split(/\s+/)[0];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {greeting(hour)} يا {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          {new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now)}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader title="اليوم" action={<StatusBadge status={status} />} />
        <div className="p-5">
          <ClockControls
            status={status === "IDLE" ? "WORKING" : status}
            workedMsAtRender={today.get(user.id) ?? 0}
            renderedAt={now.getTime()}
            requiredMs={dailyMs}
            allowWeb={settings.attendance.allowWebCheckIn}
          />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ساعات الشهر" value={formatDuration(summary.workedMs)} hint={`من ${formatDuration(summary.requiredMs)} مطلوبة`} />
        <StatCard
          label={remaining > 0 ? "فاضل عليك" : "زيادة"}
          value={formatDuration(Math.abs(remaining))}
          tone={remaining > 0 ? "default" : "success"}
          hint="اليوم الناقص بيتعوض بيوم زيادة"
        />
        <StatCard label="أيام العمل في الشهر" value={summary.workingDays.length} hint={`الإجازة الأسبوعية مش محسوبة`} />
      </div>
      <Progress className="mt-4" value={(summary.workedMs / Math.max(1, summary.requiredMs)) * 100} />

      <div className="mt-6">
        <DayActivityCard a={activity} title="نشاطي النهارده" />
      </div>

      <Card className="mt-6 flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={20} />
        <p className="text-sm text-muted">
          كل البيانات اللي بتتسجل عنك بتظهرلك هنا. التتبع بيشتغل بس وانت مسجل حضور، وبيقف تمامًا في الاستراحة وبعد الانصراف.
        </p>
      </Card>
    </>
  );
}
