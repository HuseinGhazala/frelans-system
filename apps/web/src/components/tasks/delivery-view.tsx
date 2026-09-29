import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, StatCard } from "@/components/ui/card";
import { deliveryStats, TASK_STATE_LABEL, type DeliveryCard, type TaskState } from "@/lib/delivery";

const TONE: Record<TaskState, "success" | "danger" | "warning" | "info"> = {
  DONE_ON_TIME: "success",
  DONE_LATE: "warning",
  OVERDUE: "danger",
  OPEN: "info",
};
const ORDER: TaskState[] = ["OVERDUE", "OPEN", "DONE_LATE", "DONE_ON_TIME"];

/** تاسكات موظف بنظام التاسكات: المتأخر، الشغال، واللي اتسلم */
export function DeliveryView({ cards, tz, linked }: { cards: DeliveryCard[]; tz: string; linked: boolean }) {
  const s = deliveryStats(cards);
  const date = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: tz });
  if (!linked) {
    return (
      <Card>
        <EmptyState title="الموظف مش مربوط بـ Trello" description="اربطه بعضويته من البيانات والإعدادات، وتأكد إن ليستات التسليم متحددة من الإعدادات ← Trello." />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="اتسلّم" value={s.done} />
        <StatCard label="في ميعاده" value={s.onTime} tone="success" hint={s.onTimePercent != null ? `${s.onTimePercent}% من التسليمات` : undefined} />
        <StatCard label="اتسلّم متأخر" value={s.late} tone={s.late ? "warning" : "default"} />
        <StatCard label="متأخر ولسه ما اتسلمش" value={s.overdue} tone={s.overdue ? "danger" : "default"} />
        <StatCard label="شغال عليه" value={s.open} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="التاسكات" description="التسليم = لما الكارت يتنقل لليست التسليم في Trello" />
        {cards.length === 0 ? (
          <EmptyState title="مفيش تاسكات في الفترة دي" />
        ) : (
          <ul className="divide-y divide-border">
            {[...cards]
              .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state))
              .map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium" dir="auto">{c.name}</span>
                    <span className="text-xs text-muted">
                      {c.boardName} • {c.listName}
                      {c.due && ` • التسليم ${date.format(c.due)}`}
                      {c.completedAt && ` • اتسلّم ${date.format(c.completedAt)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={TONE[c.state]}>
                      {TASK_STATE_LABEL[c.state]}
                      {c.lateDays ? ` (${c.lateDays} يوم)` : ""}
                    </Badge>
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-muted hover:text-primary" aria-label="فتح في Trello">
                      <ExternalLink size={15} />
                    </a>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
