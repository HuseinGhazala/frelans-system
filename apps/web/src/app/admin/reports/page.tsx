import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { CategoryBar, UsageList } from "@/components/attendance/day-activity";
import { AttendanceGridView } from "@/components/reports/attendance-grid";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { appsReport, attendanceGrid, hoursReport } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { daysInMonth, formatDuration, parseDateKey, toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "التقارير" };

const TABS = [
  { id: "hours", label: "الساعات" },
  { id: "attendance", label: "الحضور والغياب" },
  { id: "apps", label: "البرامج والمواقع" },
] as const;

const isKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "hours";
  const { general } = await getSettings();
  const today = toDateKey(new Date(), general.timezone);
  const { year, month } = parseDateKey(today);
  const monthDays = daysInMonth(year, month);
  const from = isKey(sp.from) ? sp.from : monthDays[0];
  const to = isKey(sp.to) && sp.to >= from ? sp.to : monthDays[monthDays.length - 1];
  const monthParam = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const qs = (extra: Record<string, string>) => new URLSearchParams({ tab, from, to, month: monthParam, ...extra }).toString();

  return (
    <>
      <PageHeader
        title="التقارير"
        action={
          <a href={`/admin/reports/export?${qs({})}`} className={buttonClass("secondary")}>
            <Download size={16} /> تصدير Excel
          </a>
        }
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`?${new URLSearchParams({ tab: t.id, from, to, month: monthParam })}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "attendance" ? (
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">الشهر</span>
            <Input type="month" name="month" defaultValue={monthParam} dir="ltr" className="w-44" />
          </label>
          <button className={buttonClass("secondary")}>عرض</button>
        </form>
      ) : (
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">من</span>
            <Input type="date" name="from" defaultValue={from} className="w-44" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">إلى</span>
            <Input type="date" name="to" defaultValue={to} className="w-44" />
          </label>
          <button className={buttonClass("secondary")}>عرض</button>
        </form>
      )}

      {tab === "hours" && <HoursTab from={from} to={to} />}
      {tab === "attendance" && <AttendanceTab month={monthParam} />}
      {tab === "apps" && <AppsTab from={from} to={to} />}
    </>
  );
}

async function HoursTab({ from, to }: { from: string; to: string }) {
  const rows = await hoursReport(from, to);
  if (!rows.length) return <Card><EmptyState title="مفيش موظفين" /></Card>;
  const max = Math.max(...rows.map((r) => Math.max(r.workedMs, r.requiredMs)), 1);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="الساعات الفعلية مقابل المطلوبة" />
        <div className="space-y-3 p-5">
          {rows.map((r) => (
            <div key={r.userId} className="grid grid-cols-[120px_1fr_90px] items-center gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <div className="relative h-4 rounded bg-surface-2">
                <div className={`absolute inset-y-0 right-0 rounded ${r.diffMs >= 0 ? "bg-success" : "bg-primary"}`} style={{ width: `${(r.workedMs / max) * 100}%` }} />
                <div className="absolute inset-y-[-3px] w-0.5 bg-text" style={{ right: `${(r.requiredMs / max) * 100}%` }} title={`المطلوب ${formatDuration(r.requiredMs)}`} />
              </div>
              <span className="text-left tabular-nums">{formatDuration(r.workedMs)}</span>
            </div>
          ))}
          <p className="text-xs text-muted">الخط الأسود = الساعات المطلوبة</p>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-right text-xs text-muted">
              <tr>
                {["الموظف", "أيام العمل", "حضر", "إجازة", "غياب", "المطلوب", "الفعلي", "الفرق", "خمول", "النشاط", "الإنتاجية"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    <Link href={`/admin/employees/${r.userId}`} className="hover:text-primary">{r.name}</Link>
                  </td>
                  <td className="px-4 py-3">{r.workingDays}</td>
                  <td className="px-4 py-3">{r.presentDays}</td>
                  <td className="px-4 py-3">{r.leaveDays}</td>
                  <td className={`px-4 py-3 ${r.absentDays ? "text-danger" : ""}`}>{r.absentDays}</td>
                  <td className="px-4 py-3">{formatDuration(r.requiredMs)}</td>
                  <td className="px-4 py-3" title={r.paidLeaveMs ? `+ ${formatDuration(r.paidLeaveMs)} إجازة مدفوعة` : undefined}>{formatDuration(r.workedMs)}</td>
                  <td className={`px-4 py-3 ${r.diffMs >= 0 ? "text-success" : "text-danger"}`} dir="ltr">{r.diffMs >= 0 ? "+" : ""}{formatDuration(r.diffMs)}</td>
                  <td className="px-4 py-3 text-idle">{formatDuration(r.idleMs)}</td>
                  <td className="px-4 py-3">{pct(r.activityPercent)}</td>
                  <td className="px-4 py-3">{pct(r.productivityPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function AttendanceTab({ month }: { month: string }) {
  const [y, m] = month.split("-").map(Number);
  const grid = await attendanceGrid(y, m);
  if (!grid.rows.length) return <Card><EmptyState title="مفيش موظفين" /></Card>;
  return (
    <Card className="p-5">
      <AttendanceGridView grid={grid} />
    </Card>
  );
}

async function AppsTab({ from, to }: { from: string; to: string }) {
  const a = await appsReport(from, to);
  if (!a.trackedMinutes) return <Card><EmptyState title="مفيش نشاط متسجل في الفترة دي" /></Card>;
  return (
    <Card>
      <CardHeader title="البرامج والمواقع لكل الفريق" description={`الإنتاجية ${pct(a.productivityPercent)} — النشاط ${pct(a.activityPercent)} — وقت متتبع ${formatDuration(a.trackedMinutes * 60_000)}`} />
      <div className="space-y-6 p-5">
        <CategoryBar byCategory={a.byCategory} />
        <div className="grid gap-8 sm:grid-cols-2">
          <UsageList title="البرامج" items={a.apps} total={a.trackedMinutes} />
          <UsageList title="المواقع" items={a.domains} total={a.trackedMinutes} />
        </div>
        <p className="text-xs text-muted">
          تقدر تغيّر تصنيف أي برنامج أو موقع من <Link href="/admin/settings?tab=categories" className="text-primary hover:underline">الإعدادات ← تصنيف البرامج</Link>.
        </p>
      </div>
    </Card>
  );
}
