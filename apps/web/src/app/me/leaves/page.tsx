import type { Metadata } from "next";
import { BalanceCards, fmtRange, LeaveStatusBadge, LeaveTypeBadge } from "@/components/leaves/leave-parts";
import { CancelLeaveButton, LeaveRequestForm } from "@/components/leaves/leave-ui";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { leaveBalances } from "@/lib/leaves";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "إجازاتي" };

export default async function MyLeavesPage() {
  const user = await requireEmployee();
  const { general } = await getSettings();
  const today = toDateKey(new Date(), general.timezone);
  const [balances, requests] = await Promise.all([
    leaveBalances(user.id, Number(today.slice(0, 4))),
    db.leaveRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <>
      <PageHeader title="إجازاتي" description={`رصيد سنة ${today.slice(0, 4)}`} />
      <BalanceCards balances={balances} />

      <Card className="mt-6">
        <CardHeader title="طلب إجازة" />
        <LeaveRequestForm today={today} />
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="طلباتي" />
        {requests.length === 0 ? (
          <EmptyState title="مفيش طلبات لسه" />
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <LeaveTypeBadge type={r.type} />
                  <span className="font-medium">{fmtRange(r.startDate, r.endDate)}</span>
                  <span className="text-muted">{r.days} يوم</span>
                  {r.reason && <span className="text-muted">— {r.reason}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {r.reviewNote && <span className="text-xs text-muted">ملاحظة المدير: {r.reviewNote}</span>}
                  <LeaveStatusBadge status={r.status} />
                  {r.status === "PENDING" && <CancelLeaveButton id={r.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
