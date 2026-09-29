import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { adjustmentsOf } from "@/lib/payroll";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Unauthorized", { status: 401 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad request", { status: 400 });
  const [year, m] = month.split("-").map(Number);
  const period = await db.payrollPeriod.findUnique({
    where: { year_month: { year, month: m } },
    include: { items: { include: { user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } } } },
  });
  if (!period) return new Response("Not found", { status: 404 });
  return csvResponse(`payroll-${month}.csv`, [
    ["الموظف", "البريد", "المرتب الشهري", "سعر الساعة", "الساعات المطلوبة", "الساعات الفعلية", "إجازات مدفوعة (ساعة)", "أيام بدون مرتب", "الأساسي المستحق", "الساعات الناقصة", "الخصم", "إضافي مقترح (ساعة)", "إضافي معتمد (ساعة)", "قيمة الإضافي", "التعديلات", "الصافي", "الحالة"],
    ...period.items.map((i) => {
      const adj = adjustmentsOf(i);
      return [
        i.user.name,
        i.user.email,
        Number(i.monthlySalary),
        Number(i.hourlyRate),
        Number(i.requiredHours),
        Number(i.workedHours),
        Number(i.paidLeaveHours),
        i.unpaidLeaveDays,
        Number(i.baseSalary),
        Number(i.shortHours),
        Number(i.deduction),
        Number(i.surplusHours),
        Number(i.approvedOvertimeHours),
        Number(i.overtimePay),
        adj.map((a) => `${a.kind === "BONUS" ? "+" : "-"}${a.amount} ${a.reason}`).join(" | "),
        Number(i.net),
        period.status === "APPROVED" ? "معتمد" : "مسودة",
      ];
    }),
  ]);
}
