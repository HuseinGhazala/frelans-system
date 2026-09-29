import type { LeaveStatus, LeaveType } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LEAVE_LABEL, LEAVE_STATUS_LABEL, type Balance } from "@/lib/leaves";

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" } as const;

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{LEAVE_STATUS_LABEL[status]}</Badge>;
}

export function LeaveTypeBadge({ type }: { type: LeaveType }) {
  return <Badge tone={type === "UNPAID" ? "danger" : type === "SICK" ? "info" : "primary"}>{LEAVE_LABEL[type]}</Badge>;
}

export function BalanceCards({ balances }: { balances: Balance[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {balances.map((b) => (
        <Card key={b.type} className="p-5">
          <p className="text-sm text-muted">إجازة {LEAVE_LABEL[b.type]}</p>
          {b.allowance == null ? (
            <p className="mt-2 text-2xl font-bold tabular-nums">{b.used} <span className="text-sm font-normal text-muted">يوم</span></p>
          ) : (
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {b.remaining} <span className="text-sm font-normal text-muted">متبقي من {b.allowance}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {b.used} مستخدمة{b.pending ? ` • ${b.pending} قيد المراجعة` : ""}
          </p>
        </Card>
      ))}
    </div>
  );
}

export const fmtRange = (s: Date, e: Date) => {
  const f = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });
  return s.getTime() === e.getTime() ? f.format(s) : `${f.format(s)} ← ${f.format(e)}`;
};
