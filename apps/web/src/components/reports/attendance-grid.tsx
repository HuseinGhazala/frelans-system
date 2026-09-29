import type { AttendanceGrid, DayStatus } from "@/lib/reports";
import { formatDuration, weekdayOf } from "@/lib/time";

const CELL: Record<DayStatus, { cls: string; label: string }> = {
  full: { cls: "bg-success text-white", label: "كمّل ساعاته" },
  short: { cls: "bg-warning text-white", label: "ناقص" },
  absent: { cls: "bg-danger text-white", label: "غياب" },
  leave: { cls: "bg-[#8b5cf6] text-white", label: "إجازة" },
  extra: { cls: "bg-info text-white", label: "شغل في يوم إجازة" },
  weekend: { cls: "bg-surface-2 text-muted", label: "إجازة أسبوعية" },
  holiday: { cls: "bg-primary-soft text-primary", label: "إجازة رسمية" },
  future: { cls: "bg-surface text-muted border border-dashed border-border", label: "لسه" },
  "not-started": { cls: "bg-surface text-muted/50", label: "قبل التعيين" },
};
const DAY_LETTER = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

export function AttendanceGridView({ grid, compact = false }: { grid: AttendanceGrid; compact?: boolean }) {
  const legend = (["full", "short", "absent", "leave", "extra", "weekend", "holiday"] as DayStatus[]).map((s) => (
    <span key={s} className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${CELL[s].cls}`} />
      {CELL[s].label}
    </span>
  ));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              {!compact && <th className="sticky right-0 bg-surface px-2 text-right font-medium text-muted">الموظف</th>}
              {grid.days.map((d) => (
                <th key={d} className="w-7 text-center font-normal text-muted" title={grid.holidays.get(d)}>
                  <div>{DAY_LETTER[weekdayOf(d)]}</div>
                  <div className="tabular-nums">{Number(d.slice(8))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.userId}>
                {!compact && <td className="sticky right-0 whitespace-nowrap bg-surface px-2 py-1 font-medium">{r.name}</td>}
                {r.cells.map((c) => (
                  <td key={c.key}>
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded text-[9px] tabular-nums ${CELL[c.status].cls}`}
                      title={`${c.key} — ${CELL[c.status].label}${c.workedMs ? ` (${formatDuration(c.workedMs)})` : ""}${grid.holidays.get(c.key) ? ` — ${grid.holidays.get(c.key)}` : ""}`}
                    >
                      {c.workedMs ? Math.round(c.workedMs / 3_600_000) : ""}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">{legend}<span>الرقم = عدد الساعات</span></div>
    </div>
  );
}
