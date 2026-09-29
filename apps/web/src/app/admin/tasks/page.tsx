import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { taskTime } from "@/lib/tasks";
import { addDays, daysInMonth, formatDuration, parseDateKey, startOfDay, toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "المهام" };
const isKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function TasksPage({ searchParams }: PageProps<"/admin/tasks">) {
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = toDateKey(new Date(), tz);
  const { year, month } = parseDateKey(today);
  const md = daysInMonth(year, month);
  const from = isKey(sp.from) ? sp.from : md[0];
  const to = isKey(sp.to) && sp.to >= from ? sp.to : md[md.length - 1];
  const boardId = typeof sp.board === "string" && sp.board ? sp.board : undefined;

  const connected = Boolean(settings.trello.apiKey && settings.trello.token && settings.trello.boardIds.length);
  const [boards, last, data] = await Promise.all([
    db.trelloBoard.findMany({ where: { id: { in: settings.trello.boardIds } }, orderBy: { name: "asc" } }),
    db.trelloBoard.findFirst({ where: { syncedAt: { not: null } }, orderBy: { syncedAt: "desc" } }),
    taskTime(startOfDay(from, tz), startOfDay(addDays(to, 1), tz), boardId),
  ]);
  const total = data.rows.reduce((t, r) => t + r.minutes, 0);
  const maxBoard = Math.max(1, ...data.perBoard.map((b) => b.minutes));
  const fmtM = (m: number) => formatDuration(m * 60_000);

  return (
    <>
      <PageHeader
        title="المهام (Trello)"
        description={last?.syncedAt ? `آخر مزامنة: ${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(last.syncedAt)}` : undefined}
        action={<Link href="/admin/settings?tab=trello" className={buttonClass("secondary")}>إعدادات Trello</Link>}
      />
      {!connected ? (
        <Card>
          <EmptyState
            title="Trello مش مربوط"
            description="اربط حساب Trello واختار البوردات، وبعدها اربط كل موظف بعضويته، والكروت المسندة له هتظهرله في البرنامج."
            action={<Link href="/admin/settings?tab=trello" className={buttonClass()}>ربط Trello</Link>}
          />
        </Card>
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">البورد</span>
              <Select name="board" defaultValue={boardId ?? ""} className="w-52">
                <option value="">كل البوردات</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">من</span>
              <Input type="date" name="from" defaultValue={from} className="w-44" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">إلى</span>
              <Input type="date" name="to" defaultValue={to} className="w-44" />
            </label>
            <button className={buttonClass("secondary")}>عرض</button>
          </form>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="الوقت على المهام" value={fmtM(total)} />
            <StatCard label="كروت اتشغل عليها" value={data.rows.length} />
            <StatCard label="وقت بدون مهمة" value={fmtM(data.noTaskMinutes)} hint="وقت متتبع من غير ما يختار كارت" />
          </div>

          {data.perBoard.length > 1 && (
            <Card className="mb-6">
              <CardHeader title="الوقت لكل بورد" />
              <div className="space-y-3 p-5">
                {data.perBoard.map((b) => (
                  <div key={b.name} className="grid grid-cols-[140px_1fr_70px] items-center gap-3 text-sm">
                    <span className="truncate">{b.name}</span>
                    <div className="h-3 rounded bg-surface-2">
                      <div className="h-full rounded bg-primary" style={{ width: `${(b.minutes / maxBoard) * 100}%` }} />
                    </div>
                    <span className="text-left tabular-nums">{fmtM(b.minutes)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            {data.rows.length === 0 ? (
              <EmptyState title="مفيش وقت متسجل على كروت في الفترة دي" description="الموظف بيختار الكارت من البرنامج قبل ما يشتغل" />
            ) : (
              <ul className="divide-y divide-border">
                {data.rows.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-medium">
                            <span className="truncate" dir="auto">{r.name}</span>
                            {r.closed && <Badge>مقفول</Badge>}
                          </span>
                          <span className="text-xs text-muted">{r.boardName} • {r.listName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="flex -space-x-2 space-x-reverse">
                            {r.perUser.slice(0, 4).map((u) => (
                              <span key={u.userId} title={u.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary-soft text-[10px] font-semibold text-primary">
                                {u.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                              </span>
                            ))}
                          </span>
                          <span className="w-16 text-left font-semibold tabular-nums">{fmtM(r.minutes)}</span>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-primary" aria-label="فتح في Trello">
                            <ExternalLink size={16} />
                          </a>
                        </span>
                      </summary>
                      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                        {r.perUser.map((u) => (
                          <li key={u.userId} className="flex justify-between">
                            <span>{u.name}</span>
                            <span className="tabular-nums text-muted">{fmtM(u.minutes)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
