import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarX, Clock, Moon, TrendingDown, type LucideIcon } from "lucide-react";
import type { AlertType } from "@/generated/prisma/enums";
import { MarkAllRead, MarkRead } from "@/components/alerts/mark-read";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ALERT_LABEL } from "@/lib/alerts";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "التنبيهات" };

const ICON: Record<AlertType, [LucideIcon, string]> = {
  ABSENCE: [CalendarX, "bg-danger-soft text-danger"],
  MISSING_HOURS: [Clock, "bg-warning-soft text-warning"],
  LONG_IDLE: [Moon, "bg-[#ffedd5] text-idle"],
  LOW_PRODUCTIVITY: [TrendingDown, "bg-danger-soft text-danger"],
  LEAVE_REQUEST: [AlarmClock, "bg-info-soft text-info"],
};
const TYPES = Object.keys(ALERT_LABEL) as AlertType[];

export default async function AlertsPage({ searchParams }: PageProps<"/admin/alerts">) {
  const sp = await searchParams;
  const type = TYPES.find((t) => t === sp.type);
  const { general } = await getSettings();
  const [alerts, unread] = await Promise.all([
    db.alert.findMany({ where: type ? { type } : {}, orderBy: { createdAt: "desc" }, take: 200 }),
    db.alert.count({ where: { readAt: null } }),
  ]);
  const fmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: general.timezone });

  return (
    <>
      <PageHeader title="التنبيهات" description={unread ? `${unread} غير مقروء` : "كله مقروء"} action={<MarkAllRead disabled={!unread} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...TYPES].map((t) => (
          <Link
            key={t ?? "all"}
            href={t ? `?type=${t}` : "?"}
            className={`rounded-full border px-3 py-1 text-sm ${type === t ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-2"}`}
          >
            {t ? ALERT_LABEL[t] : "الكل"}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        {alerts.length === 0 ? (
          <EmptyState title="مفيش تنبيهات" description="التنبيهات بتتعمل تلقائي: غياب وساعات ناقصة وإنتاجية منخفضة بعد ما اليوم يخلص، وخمول طويل وطلبات إجازة وقت ما تحصل." />
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => {
              const [Icon, cls] = ICON[a.type];
              return (
                <li key={a.id} className={`flex items-start gap-3 px-5 py-3 ${a.readAt ? "" : "bg-primary-soft/30"}`}>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls}`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className={a.readAt ? "" : "font-medium"}>{a.message}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {ALERT_LABEL[a.type]} • {fmt.format(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {a.link && <Link href={a.link} className="text-xs text-primary hover:underline">عرض</Link>}
                    {!a.readAt && <MarkRead id={a.id} />}
                    {!a.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-label="غير مقروء" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
