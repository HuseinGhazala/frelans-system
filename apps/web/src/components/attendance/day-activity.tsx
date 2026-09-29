import { Card, CardHeader } from "@/components/ui/card";
import type { DayActivity, UsageItem } from "@/lib/activity";
import { CATEGORY_LABEL, type Category } from "@/lib/productivity";
import { formatDuration } from "@/lib/time";

export const CATEGORY_BAR: Record<Category, string> = { PRODUCTIVE: "bg-success", NEUTRAL: "bg-muted/60", UNPRODUCTIVE: "bg-danger" };
const CATEGORY_TEXT: Record<Category, string> = { PRODUCTIVE: "text-success", NEUTRAL: "text-muted", UNPRODUCTIVE: "text-danger" };

export function UsageList({ title, items, total }: { title: string; items: UsageItem[]; total: number }) {
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
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate" dir="auto">{i.name}</span>
                  <span className={`shrink-0 text-[10px] ${CATEGORY_TEXT[i.category]}`}>{CATEGORY_LABEL[i.category]}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">{formatDuration(i.minutes * 60_000)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${CATEGORY_BAR[i.category]}`} style={{ width: `${(i.minutes / Math.max(1, total)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CategoryBar({ byCategory }: { byCategory: Record<Category, number> }) {
  const total = byCategory.PRODUCTIVE + byCategory.NEUTRAL + byCategory.UNPRODUCTIVE;
  if (!total) return null;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {(["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE"] as const).map((c) => (
          <div key={c} className={CATEGORY_BAR[c]} style={{ width: `${(byCategory[c] / total) * 100}%` }} title={`${CATEGORY_LABEL[c]}: ${formatDuration(byCategory[c] * 60_000)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {(["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_BAR[c]}`} />
            {CATEGORY_LABEL[c]} {formatDuration(byCategory[c] * 60_000)} ({Math.round((byCategory[c] / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

export function DayActivityCard({ a, title = "نشاط اليوم (من برنامج الديسكتوب)" }: { a: DayActivity; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} description="أعداد ضغطات الكيبورد والماوس بس — من غير أي محتوى اتكتب" />
      {a.trackedMinutes === 0 && a.idleMs === 0 ? (
        <p className="p-5 text-sm text-muted">مفيش نشاط متسجل من البرنامج في اليوم ده.</p>
      ) : (
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">نسبة النشاط</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{a.activityPercent ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-muted">الإنتاجية</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-success">{a.productivityPercent ?? 0}%</p>
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
          <CategoryBar byCategory={a.byCategory} />
          <div className="grid gap-6 sm:grid-cols-2">
            <UsageList title="البرامج" items={a.apps} total={a.trackedMinutes} />
            <UsageList title="المواقع" items={a.domains} total={a.trackedMinutes} />
          </div>
        </div>
      )}
    </Card>
  );
}
