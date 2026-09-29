import type { PayrollItem } from "@/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { adjustmentsOf } from "@/lib/payroll";
import { formatMoney } from "@/lib/utils";

/** كشف مرتب موظف (للعرض والطباعة) */
export function Payslip({ item, name, monthLabel, currency, companyName }: { item: PayrollItem; name: string; monthLabel: string; currency: string; companyName: string }) {
  const m = (v: unknown) => formatMoney(Number(v), currency);
  const rows: [string, string, "plus" | "minus" | null][] = [
    ["المرتب الشهري", m(item.monthlySalary), null],
    ["سعر الساعة", m(item.hourlyRate), null],
    ["الساعات المطلوبة", `${Number(item.requiredHours)} ساعة`, null],
    ["الساعات الفعلية", `${Number(item.workedHours)} ساعة`, null],
    ...(Number(item.paidLeaveHours) ? ([["إجازات مدفوعة", `${Number(item.paidLeaveHours)} ساعة`, null]] as [string, string, null][]) : []),
    ...(item.unpaidLeaveDays ? ([["إجازة بدون مرتب", `${item.unpaidLeaveDays} يوم`, null]] as [string, string, null][]) : []),
    ["الأساسي المستحق", m(item.baseSalary), null],
  ];
  const adjustments = adjustmentsOf(item);
  return (
    <Card className="mx-auto max-w-2xl p-6 print:border-0 print:shadow-none">
      <div className="mb-6 flex items-start justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs text-muted">{companyName}</p>
          <h2 className="text-xl font-bold">كشف مرتب — {monthLabel}</h2>
          <p className="mt-1 text-sm">{name}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-on-primary">ر</span>
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
        {Number(item.deduction) > 0 && (
          <div className="flex justify-between text-danger">
            <dt>خصم ساعات ناقصة ({Number(item.shortHours)} ساعة)</dt>
            <dd className="tabular-nums">− {m(item.deduction)}</dd>
          </div>
        )}
        {Number(item.overtimePay) > 0 && (
          <div className="flex justify-between text-success">
            <dt>إضافي معتمد ({Number(item.approvedOvertimeHours)} ساعة × {Number(item.overtimeMultiplier)})</dt>
            <dd className="tabular-nums">+ {m(item.overtimePay)}</dd>
          </div>
        )}
        {adjustments.map((a, i) => (
          <div key={i} className={`flex justify-between ${a.kind === "BONUS" ? "text-success" : "text-danger"}`}>
            <dt>{a.kind === "BONUS" ? "مكافأة" : "خصم"}: {a.reason}</dt>
            <dd className="tabular-nums">{a.kind === "BONUS" ? "+" : "−"} {m(a.amount)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex items-center justify-between rounded-xl bg-primary-soft px-5 py-4">
        <span className="font-semibold text-primary">الصافي</span>
        <span className="text-2xl font-bold tabular-nums text-primary">{m(item.net)}</span>
      </div>
      <p className="mt-4 text-xs text-muted">الحساب شهري: الأيام الناقصة بتتعوض بالأيام الزيادة، والإضافي بيتحسب بعد موافقة المدير بس.</p>
    </Card>
  );
}
