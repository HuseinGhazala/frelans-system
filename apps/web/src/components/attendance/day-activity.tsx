import { Card, CardHeader } from "@/components/ui/card";
import type { DayActivity } from "@/lib/activity";
import { formatDuration } from "@/lib/time";

function UsageList({ title, items, total }: { title: string; items: { name: string; minutes: number }[]; total: number }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.name} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate" dir="auto">{i.name}</span>
                <span className="shrink-0 tabular-nums text-muted">{formatDuration(i.minutes * 60_000)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(i.minutes / Math.max(1, total)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DayActivityCard({ a, title = "نشاط اليوم (من برنامج الديسكتوب)" }: { a: DayActivity; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} description="أعداد ضغطات الكيبورد والماوس بس — من غير أي محتوى اتكتب" />
      {a.trackedMinutes === 0 && a.idleMs === 0 ? (
        <p className="p-5 text-sm text-muted">مفيش نشاط متسجل من البرنامج النهارده.</p>
      ) : (
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted">نسبة النشاط</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{a.activityPercent ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-muted">وقت متتبع</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatDuration(a.trackedMinutes * 60_000)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">خمول (غير محسوب)</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-idle">{formatDuration(a.idleMs)}</p>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <UsageList title="البرامج" items={a.apps} total={a.trackedMinutes} />
            <UsageList title="المواقع" items={a.domains} total={a.trackedMinutes} />
          </div>
        </div>
      )}
    </Card>
  );
}
