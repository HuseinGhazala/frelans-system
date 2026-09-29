import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateEmployee } from "@/app/actions/employees";
import { DayActivityCard } from "@/components/attendance/day-activity";
import { EmployeeActions, RevokeDeviceButton } from "@/components/employees/employee-actions";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Avatar, Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { dayActivity } from "@/lib/activity";
import { closeStaleAgentSessions, getOpenSession, liveStatusOf, monthSummary } from "@/lib/attendance";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDuration, parseDateKey, toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "بيانات الموظف" };

export default async function EmployeePage({ params, searchParams }: PageProps<"/admin/employees/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const employee = await db.user.findUnique({ where: { id, role: "EMPLOYEE" }, include: { profile: true } });
  if (!employee) notFound();

  const settings = await getSettings();
  const tz = settings.general.timezone;
  const { year, month } = parseDateKey(toDateKey(new Date(), tz));
  await closeStaleAgentSessions();
  const [open, summary, activity, devices] = await Promise.all([
    getOpenSession(id),
    monthSummary(id, year, month),
    dayActivity(id, tz),
    db.device.findMany({ where: { userId: id, revokedAt: null }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  const seenFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  const diff = summary.workedMs - summary.requiredMs;
  const p = employee.profile;
  const monthName = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <>
      <PageHeader
        title={employee.name}
        description={employee.jobTitle ?? undefined}
        action={
          <div className="flex items-center gap-3">
            {!employee.active && <Badge tone="danger">موقوف</Badge>}
            <StatusBadge status={liveStatusOf(open)} />
            <Avatar name={employee.name} status={liveStatusOf(open)} size={44} />
          </div>
        }
      />

      {sp.invite === "sent" && <p className="mb-6 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">تم إضافة الموظف وإرسال الدعوة على {employee.email}</p>}

      <h2 className="mb-3 font-semibold">شهر {monthName}</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="الساعات المطلوبة" value={formatDuration(summary.requiredMs)} hint={`${summary.workingDays.length} يوم عمل`} />
        <StatCard label="الساعات الفعلية" value={formatDuration(summary.workedMs)} />
        <StatCard label={diff >= 0 ? "زيادة" : "ناقص"} value={formatDuration(Math.abs(diff))} tone={diff >= 0 ? "success" : "danger"} hint="الحساب شهري: اليوم الناقص بيتعوض بيوم زيادة" />
        <StatCard label="أيام حضور" value={summary.perDay.size} />
      </div>

      <div className="mb-8">
        <DayActivityCard a={activity} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <EmployeeForm
          action={updateEmployee.bind(null, id)}
          submitLabel="حفظ التعديلات"
          currency={settings.general.currency}
          globalDefaults={settings.attendance}
          defaults={{
            name: employee.name,
            email: employee.email,
            phone: employee.phone ?? "",
            jobTitle: employee.jobTitle ?? "",
            hiredAt: employee.hiredAt?.toISOString().slice(0, 10) ?? "",
            monthlySalary: p?.monthlySalary.toString() ?? "",
            dailyHours: p?.dailyHours.toString() ?? String(settings.attendance.defaultDailyHours),
            annualLeaveDays: String(p?.annualLeaveDays ?? 21),
            casualLeaveDays: String(p?.casualLeaveDays ?? 6),
            screenshotIntervalMin: p?.screenshotIntervalMin?.toString() ?? "",
            idleThresholdMin: p?.idleThresholdMin?.toString() ?? "",
            blurScreenshots: p?.blurScreenshots == null ? "default" : p.blurScreenshots ? "on" : "off",
          }}
        />
        <div className="space-y-6">
          <Card>
            <CardHeader title="الحساب" />
            <div className="space-y-3 p-5 text-sm">
              <p>
                <span className="text-muted">الحالة: </span>
                {!employee.active ? "موقوف" : employee.passwordHash ? "نشط" : "في انتظار قبول الدعوة"}
              </p>
              <p>
                <span className="text-muted">الموافقة على المراقبة: </span>
                {employee.monitoringConsentAt ? seenFmt.format(employee.monitoringConsentAt) : "لسه ما وافقش (بتظهر أول مرة يفتح البرنامج)"}
              </p>
              <EmployeeActions userId={id} active={employee.active} hasPassword={Boolean(employee.passwordHash)} />
            </div>
          </Card>
          <Card>
            <CardHeader title="الأجهزة" description="الأجهزة اللي عليها برنامج الديسكتوب" />
            {devices.length === 0 ? (
              <p className="p-5 text-sm text-muted">لسه ما سجلش دخول من البرنامج على أي جهاز.</p>
            ) : (
              <ul className="divide-y divide-border">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium" dir="auto">{d.name}</span>
                      <span className="block text-xs text-muted">
                        {d.os}
                        {d.appVersion ? ` • v${d.appVersion}` : ""} • آخر ظهور {d.lastSeenAt ? seenFmt.format(d.lastSeenAt) : "—"}
                      </span>
                    </span>
                    <RevokeDeviceButton deviceId={d.id} name={d.name} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
