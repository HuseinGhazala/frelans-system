import type { Metadata } from "next";
import { PrintButton } from "@/components/payroll/payroll-ui";
import { Payslip } from "@/components/payroll/payslip";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "كشف المرتب" };

export default async function MyPayslipPage({ searchParams }: PageProps<"/me/payslip">) {
  const user = await requireEmployee();
  const sp = await searchParams;
  const { general } = await getSettings();
  // الافتراضي: آخر شهر معتمد
  const latest = await db.payrollItem.findFirst({
    where: { userId: user.id, period: { status: "APPROVED" } },
    include: { period: true },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
  });
  const monthParam =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : latest
        ? `${latest.period.year}-${String(latest.period.month).padStart(2, "0")}`
        : toDateKey(new Date(), general.timezone).slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);
  const item = await db.payrollItem.findFirst({ where: { userId: user.id, period: { year, month, status: "APPROVED" } } });
  const monthLabel = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <>
      <PageHeader title="كشف المرتب" action={item ? <PrintButton /> : undefined} />
      <form className="mb-6 flex items-end gap-2 print:hidden">
        <label className="text-sm">
          <span className="mb-1 block font-medium">الشهر</span>
          <Input type="month" name="month" defaultValue={monthParam} dir="ltr" className="w-44" />
        </label>
        <button className={buttonClass("secondary")}>عرض</button>
      </form>
      {item ? (
        <Payslip item={item} name={user.name} monthLabel={monthLabel} currency={general.currency} companyName={general.companyName} />
      ) : (
        <Card>
          <EmptyState title={`لم يتم اعتماد مرتب ${monthLabel} بعد`} description="الكشف بيظهر هنا بعد ما المدير يعتمد مرتبات الشهر." />
        </Card>
      )}
    </>
  );
}
