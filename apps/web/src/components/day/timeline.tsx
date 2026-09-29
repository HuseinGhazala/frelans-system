import type { Segment } from "@/lib/day";

const COLORS: Record<Segment["kind"], string> = {
  work: "bg-success",
  web: "bg-info",
  break: "bg-warning",
  idle: "bg-idle [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgba(255,255,255,.35)_4px_8px)]",
};

const LEGEND: [Segment["kind"], string][] = [
  ["work", "شغل (البرنامج)"],
  ["web", "حضور من الموقع"],
  ["break", "استراحة"],
  ["idle", "خمول (غير محسوب)"],
];

/** شريط اليوم من اليمين للشمال (RTL) */
export function Timeline({ dayStart, segments, tz }: { dayStart: number; segments: Segment[]; tz: string }) {
  const HOUR = 3_600_000;
  // نعرض من ساعة قبل أول نشاط لساعة بعد آخره (8 ص - 6 م على الأقل)
  const hourOf = (t: number) => (t - dayStart) / HOUR;
  const first = segments.length ? Math.floor(Math.min(...segments.map((s) => hourOf(s.start)))) : 8;
  const last = segments.length ? Math.ceil(Math.max(...segments.map((s) => hourOf(s.end)))) : 18;
  const from = Math.max(0, Math.min(8, first - 1));
  const to = Math.min(24, Math.max(18, last + 1));
  const span = (to - from) * HOUR;
  const pos = (t: number) => ((t - dayStart - from * HOUR) / span) * 100;
  const fmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", timeZone: tz });
  const tick = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const order = { work: 0, web: 0, idle: 1, break: 2 };

  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-lg bg-surface-2">
        {[...segments]
          .sort((a, b) => order[a.kind] - order[b.kind])
          .map((s, i) => (
            <div
              key={i}
              className={`absolute inset-y-0 ${COLORS[s.kind]} ${s.kind === "break" || s.kind === "idle" ? "inset-y-1.5 rounded" : ""}`}
              style={{ right: `${pos(s.start)}%`, width: `${Math.max(0.3, pos(s.end) - pos(s.start))}%` }}
              title={`${LEGEND.find((l) => l[0] === s.kind)![1]}: ${tick.format(s.start)} – ${tick.format(s.end)}`}
            />
          ))}
      </div>
      <div className="relative mx-3 mt-1 h-4 whitespace-nowrap text-[10px] text-muted">
        {hours
          .filter((h) => (to - from > 12 ? h % 2 === 0 : true))
          .map((h) => (
            <span key={h} className="absolute translate-x-1/2" style={{ right: `${((h - from) / (to - from)) * 100}%` }}>
              {fmt.format(dayStart + h * HOUR)}
            </span>
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {LEGEND.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${COLORS[k]}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
