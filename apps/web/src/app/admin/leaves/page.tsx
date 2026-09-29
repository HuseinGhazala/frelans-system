import type { Metadata } from "next";
import Link from "next/link";
import { fmtRange, LeaveStatusBadge, LeaveTypeBadge } from "@/components/leaves/leave-parts";
import { ReviewLeave } from "@/components/leaves/leave-ui";
import { Avatar } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { LEAVE_LABEL, leaveBalances } from "@/lib/leaves";
import { getSettings } from "@/lib/settings";
import { toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "الإجازات" };

export default async function LeavesPage({ searchParams }: PageProps<"/admin/leaves">) {
  const sp = await searchParams;
  const pendingCount = await db.leaveRequest.count({ where: { status: "PENDING" } });
  const TABS = [
    { id: "pending", label: `الطلبات المعلقة${pendingCount ? ` (${pendingCount})` : ""}` },
    { id: "all", label: "كل الطلبات" },
    { id: "balances", label: "الأرصدة" },
  ];
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "pending";

  return (
    <>
      <PageHeader
        title="الإجازات"
        description="الإجازات الرسمية بتتضاف من الإعدادات"
        action={<Link href="/admin/settings" className="text-sm text-primary hover:underline">الإجازات الرسمية ←</Link>}
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`?tab=${t.id}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "balances" ? <Balances /> : <Requests pendingOnly={tab === "pending"} />}
    </>
  );
}

async function Requests({ pendingOnly }: { pendingOnly: boolean }) {
  const requests = await db.leaveRequest.findMany({
    where: pendingOnly ? { status: "PENDING" } : {},
    include: { user: { select: { id: true, name: true } } },
    orderBy: pendingOnly ? { startDate: "asc" } : { createdAt: "desc" },
    take: 200,
  });
  if (!requests.length) return <Card><EmptyState title={pendingOnly ? "مفيش طلبات معلقة" : "مفيش طلبات"} /></Card>;

  // الرصيد بعد الموافقة للطلبات المعلقة
  const balances = new Map<string, Awaited<ReturnType<typeof leaveBalances>>>();
  if (pendingOnly) {
    for (const r of requests) {
      const key = `${r.userId}:${r.startDate.getUTCFullYear()}`;
      if (!balances.has(key)) balances.set(key, await leaveBalances(r.userId, r.startDate.getUTCFullYear()));
    }
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => {
        const b = balances.get(`${r.userId}:${r.startDate.getUTCFullYear()}`)?.find((x) => x.type === r.type);
        return (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3">
              <Avatar name={r.user.name} size={40} />
              <div className="space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/employees/${r.user.id}`} className="font-medium hover:text-primary">{r.user.name}</Link>
                  <LeaveTypeBadge type={r.type} />
                  {!pendingOnly && <LeaveStatusBadge status={r.status} />}
                </p>
                <p>
                  <span className="font-medium">{fmtRange(r.startDate, r.endDate)}</span>
                  <span className="text-muted"> • {r.days} يوم عمل</span>
                  {b?.remaining != null && <span className="text-muted"> • الرصيد بعد الموافقة: {b.remaining - r.days} يوم</span>}
                </p>
                {r.reason && <p className="text-muted">السبب: {r.reason}</p>}
                {r.reviewNote && <p className="text-muted">ملاحظة: {r.reviewNote}</p>}
              </div>
            </div>
            {r.status === "PENDING" && <ReviewLeave id={r.id} />}
          </Card>
        );
      })}
    </div>
  );
}

async function Balances() {
  const { general } = await getSettings();
  const year = Number(toDateKey(new Date(), general.timezone).slice(0, 4));
  const employees = await db.user.findMany({ where: { role: "EMPLOYEE", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(employees.map(async (e) => ({ e, b: await leaveBalances(e.id, year) })));
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-right text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">الموظف</th>
              {(["ANNUAL", "CASUAL", "SICK", "UNPAID"] as const).map((t) => (
                <th key={t} className="px-4 py-3 font-medium">{LEAVE_LABEL[t]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {rows.map(({ e, b }) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.name}</td>
                {b.map((x) => (
                  <td key={x.type} className="px-4 py-3">
                    {x.allowance == null ? `${x.used} يوم` : `${x.used} / ${x.allowance}`}
                    {x.pending ? <span className="text-xs text-warning"> (+{x.pending} معلق)</span> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-muted">المستخدم / الرصيد لسنة {year}. الأرصدة بتتعدل من بيانات كل موظف.</p>
    </Card>
  );
}
