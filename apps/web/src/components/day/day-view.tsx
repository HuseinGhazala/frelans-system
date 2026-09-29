import { DayActivityCard } from "@/components/attendance/day-activity";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { dayActivity } from "@/lib/activity";
import { dayTimeline } from "@/lib/day";
import { screenshotsForDay } from "@/lib/screenshots";
import { formatDuration, startOfDay, type DateKey } from "@/lib/time";
import { ScreenshotGrid } from "./screenshot-grid";
import { Timeline } from "./timeline";

/** عرض يوم كامل لموظف: الأرقام، شريط اليوم، النشاط، اللقطات — للأدمن وللموظف نفسه */
export async function DayView({ userId, date, tz, dailyMs, intervalMin }: { userId: string; date: DateKey; tz: string; dailyMs: number; intervalMin: number }) {
  const [t, activity, shots] = await Promise.all([
    dayTimeline(userId, date, tz),
    dayActivity(userId, tz, startOfDay(date, tz)),
    screenshotsForDay(userId, date, tz, intervalMin),
  ]);
  const inFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: tz });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="ساعات العمل" value={formatDuration(t.workedMs)} hint={`من ${formatDuration(dailyMs)}`} tone={t.workedMs >= dailyMs ? "success" : "default"} />
        <StatCard label="أول حضور" value={t.firstIn ? inFmt.format(t.firstIn) : "—"} />
        <StatCard label="نسبة النشاط" value={activity.activityPercent == null ? "—" : `${activity.activityPercent}%`} />
        <StatCard label="الاستراحات" value={formatDuration(t.breakMs)} />
        <StatCard label="خمول (غير محسوب)" value={formatDuration(t.idleMs)} tone={t.idleMs ? "warning" : "default"} />
      </div>

      <Card>
        <CardHeader title="شريط اليوم" />
        <div className="p-5">
          {t.segments.length ? <Timeline dayStart={t.dayStart} segments={t.segments} tz={tz} /> : <p className="text-sm text-muted">مفيش حضور في اليوم ده.</p>}
        </div>
      </Card>

      <DayActivityCard a={activity} title="البرامج والمواقع" />

      <Card>
        <CardHeader title="لقطات الشاشة" description={`${shots.length} لقطة`} />
        <ScreenshotGrid
          tz={tz}
          shots={shots.map((s) => ({ ...s, takenAt: s.takenAt.getTime() }))}
        />
      </Card>
    </div>
  );
}
