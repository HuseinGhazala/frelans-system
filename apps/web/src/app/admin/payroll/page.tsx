import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Adjustments, OvertimeCell, PeriodActions, PrintButton } from "@/components/payroll/payroll-ui";
import { Payslip } from "@/components/payroll/payslip";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { db } from "@/lib/db";
import { adjustmentsOf, lateTasksOf } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "المرتبات" };

export default async function PayrollPage({ searchParams }: PageProps<"/admin/payroll">) {
  const sp = await searchParams;
  const { general } = await getSettings();
  const monthParam = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : toDateKey(new Date(), general.timezone).slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const period = await db.payrollPeriod.findUnique({
    where: { year_month: { year, month } },
    include: { items: { include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } } },
  });
  const locked = period?.status === "APPROVED";
  const cur = general.currency;
  const money = (v: unknown) => formatMoney(Number(v), cur);
  const sum = (k: "baseSalary" | "deduction" | "overtimePay" | "net") => period?.items.reduce((t, i) => t + Number(i[k]), 0) ?? 0;
  const pendingOvertime = period?.items.filter((i) => Number(i.surplusHours) > 0 && Number(i.approvedOvertimeHours) === 0).length ?? 0;
  const lateTaskStaff = period?.items.filter((i) => i.workMode === "TASKS" && lateTasksOf(i).length > 0 && adjustmentsOf(i).length === 0).length ?? 0;
  const view = typeof sp.view === "string" ? period?.items.find((i) => i.id === sp.view) : undefined;

  if (view) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link href={`?month=${monthParam}`} className="text-sm text-primary hover:underline">→ رجوع للمرتبات</Link>
          <PrintButton />
        </div>
        <Payslip item={view} name={view.user.name} monthLabel={monthLabel} currency={cur} companyName={general.companyName} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="المرتبات"
        description={monthLabel}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {period && <Badge tone={locked ? "success" : "warning"}>{locked ? "معتمد" : "مسودة"}</Badge>}
            {period && (
              <a href={`/admin/payroll/export?month=${monthParam}`} className={buttonClass("secondary")}>
                <Download size={16} /> تصدير Excel
              </a>
            )}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <form className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">الشهر</span>
            <Input type="month" name="month" defaultValue={monthParam} dir="ltr" className="w-44" />
          </label>
          <button className={buttonClass("secondary")}>عرض</button>
        </form>
        <PeriodActions year={year} month={month} periodId={period?.id ?? null} status={period?.status ?? null} />
      </div>

      {!period ? (
        <Card>
          <EmptyState title="لسه ما اتحسبتش مرتبات الشهر ده" description="اضغط 'احسب مسودة الشهر' عشان تتحسب من الحضور الفعلي. تقدر تعيد الحساب في أي وقت لحد ما تعتمد." />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="إجمالي الأساسي" value={money(sum("baseSalary"))} />
            <StatCard label="إجمالي الخصومات" value={money(sum("deduction"))} tone="danger" />
            <StatCard label="إجمالي الإضافي" value={money(sum("overtimePay"))} tone="success" />
            <StatCard label="الصافي" value={money(sum("net"))} />
          </div>
          <p className="mb-4 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
            الحساب شهري: الأيام الناقصة بتتعوض بالأيام الزيادة. الساعات الزيادة ما بتتحسبش إضافي إلا بعد موافقتك.
            {pendingOvertime > 0 && !locked && ` — في ${pendingOvertime} موظف عندهم إضافي مقترح مستني موافقتك.`}
            {lateTaskStaff > 0 && !locked && ` — في ${lateTaskStaff} موظف تاسكات عندهم تسليمات متأخرة: حدد الخصم من عمود التعديلات.`}
            {" "}موظفين التاسكات مرتبهم ثابت، والخصم على التأخير بتحدده انت.
          </p>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-right text-xs text-muted">
                  <tr>
                    {["الموظف", "المرتب", "المطلوب", "الفعلي + إجازات", "الناقص / الخصم", "إضافي مقترح (معتمد / متاح)", "الإضافي", "تعديلات", "الصافي", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border align-top tabular-nums">
                  {period.items.map((i) => {
                    const adj = adjustmentsOf(i);
                    const tasks = i.workMode === "TASKS";
                    const late = lateTasksOf(i);
                    return (
                      <tr key={i.id}>
                        <td className="whitespace-nowrap px-3 py-3 font-medium">
                          <Link href={`/admin/employees/${i.user.id}?tab=${tasks ? "tasks" : "month"}`} className="hover:text-primary">{i.user.name}</Link>
                          {tasks && <p><Badge tone="info">بالتاسكات</Badge></p>}
                          {i.unpaidLeaveDays > 0 && <p className="text-xs text-danger">{i.unpaidLeaveDays} يوم بدون مرتب</p>}
                        </td>
                        <td className="px-3 py-3">
                          {money(i.monthlySalary)}
                          {!tasks && <p className="text-xs text-muted">{Number(i.hourlyRate).toFixed(2)} / ساعة</p>}
                        </td>
                        <td className="px-3 py-3">{tasks ? "—" : Number(i.requiredHours)}</td>
                        <td className="px-3 py-3">
                          {tasks ? (
                            late.length ? <span className="text-danger">{late.length} تاسك متأخر</span> : <span className="text-success">كله في ميعاده</span>
                          ) : (
                            <>
                              {Number(i.workedHours)}
                              {Number(i.paidLeaveHours) > 0 && <span className="text-xs text-muted"> + {Number(i.paidLeaveHours)}</span>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {Number(i.deduction) > 0 ? (
                            <span className="text-danger">
                              {tasks ? "أيام بدون مرتب" : `${Number(i.shortHours)} س`}
                              <br />− {money(i.deduction)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {tasks ? <span className="text-muted">—</span> : <OvertimeCell itemId={i.id} surplus={Number(i.surplusHours)} approved={Number(i.approvedOvertimeHours)} locked={locked} />}
                        </td>
                        <td className="px-3 py-3 text-success">{Number(i.overtimePay) > 0 ? `+ ${money(i.overtimePay)}` : "—"}</td>
                        <td className="min-w-64 px-3 py-3">
                          <details open={tasks && late.length > 0 && adj.length === 0 && !locked}>
                            <summary className="cursor-pointer text-xs text-primary">
                              {adj.length ? `${adj.length} تعديل` : locked ? "—" : tasks && late.length ? "خصم التأخير" : "إضافة"}
                            </summary>
                            <div className="mt-2 space-y-3">
                              {late.length > 0 && (
                                <ul className="space-y-1 rounded-lg bg-danger-soft/50 p-2 text-xs">
                                  {late.map((t) => (
                                    <li key={t.id} className="flex justify-between gap-2">
                                      <a href={t.url} target="_blank" rel="noreferrer" className="truncate hover:underline" dir="auto">{t.name}</a>
                                      <span className="shrink-0 text-danger">{t.state === "OVERDUE" ? "لسه ما اتسلمش" : "اتسلّم"} • متأخر {t.lateDays} يوم</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <Adjustments itemId={i.id} items={adj} locked={locked} currency={cur} />
                            </div>
                          </details>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-bold">{money(i.net)}</td>
                        <td className="px-3 py-3">
                          <Link href={`?month=${monthParam}&view=${i.id}`} className="text-xs text-primary hover:underline">الكشف</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
