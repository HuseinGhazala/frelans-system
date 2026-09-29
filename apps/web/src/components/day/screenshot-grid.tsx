"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

export type Shot = {
  id: string;
  takenAt: number;
  display: number;
  blurred: boolean;
  app: string | null;
  domain: string | null;
  activityPercent: number | null;
};

function ActivityBar({ pct }: { pct: number | null }) {
  const filled = pct == null ? 0 : Math.round(pct / 10);
  const color = pct == null ? "bg-border" : pct >= 60 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-1 gap-0.5" dir="ltr">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < filled ? color : "bg-surface-2"}`} />
        ))}
      </div>
      <span className="w-8 text-left text-[11px] tabular-nums text-muted">{pct == null ? "—" : `${pct}%`}</span>
    </div>
  );
}

export function ScreenshotGrid({ shots, tz }: { shots: Shot[]; tz: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const time = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const hourFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", timeZone: tz });
  const hourKey = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz });

  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const k = hourKey.format(s.takenAt);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  const move = useCallback(
    (d: number) => setOpen((i) => (i == null ? i : Math.min(shots.length - 1, Math.max(0, i + d)))),
    [shots.length],
  );
  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      // RTL: السهم الشمال = اللقطة اللي بعدها
      if (e.key === "ArrowLeft") move(1);
      if (e.key === "ArrowRight") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, move]);

  if (!shots.length) return <p className="p-5 text-sm text-muted">مفيش لقطات شاشة في اليوم ده.</p>;
  const cur = open == null ? null : shots[open];

  return (
    <>
      <div className="space-y-5 p-5">
        {[...groups.entries()].map(([h, list]) => (
          <div key={h}>
            <p className="mb-2 text-xs font-medium text-muted">
              {hourFmt.format(list[0].takenAt)} – {hourFmt.format(list[0].takenAt + 3_600_000)}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {list.map((s) => (
                <button key={s.id} onClick={() => setOpen(shots.indexOf(s))} className="group overflow-hidden rounded-lg border border-border bg-surface text-right transition-shadow hover:shadow-md">
                  <div className="relative aspect-video bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/screenshots/${s.id}`} alt={`لقطة ${time.format(s.takenAt)}`} loading="lazy" className="h-full w-full object-cover" />
                    {s.blurred && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">مشوّشة</span>}
                    {s.display > 0 && <span className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">شاشة {s.display + 1}</span>}
                  </div>
                  <div className="space-y-1 p-2">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="truncate" dir="auto">{s.domain ?? s.app ?? "—"}</span>
                      <span className="shrink-0 tabular-nums text-muted">{time.format(s.takenAt)}</span>
                    </div>
                    <ActivityBar pct={s.activityPercent} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {cur && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{time.format(cur.takenAt)}{cur.display > 0 ? ` — شاشة ${cur.display + 1}` : ""}</p>
              <p className="truncate text-white/70" dir="auto">{[cur.app, cur.domain].filter(Boolean).join(" • ") || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/70">النشاط: {cur.activityPercent == null ? "—" : `${cur.activityPercent}%`}</span>
              <a href={`/api/screenshots/${cur.id}`} download className="rounded p-2 hover:bg-white/10" aria-label="تحميل">
                <Download size={18} />
              </a>
              <button onClick={() => setOpen(null)} className="rounded p-2 hover:bg-white/10" aria-label="إغلاق">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/screenshots/${cur.id}`} alt="" className="max-h-full max-w-full object-contain" />
            <button onClick={() => move(-1)} disabled={open === 0} className="absolute right-2 rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30" aria-label="السابقة">
              <ChevronRight size={24} />
            </button>
            <button onClick={() => move(1)} disabled={open === shots.length - 1} className="absolute left-2 rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30" aria-label="التالية">
              <ChevronLeft size={24} />
            </button>
          </div>
          <p className="py-2 text-center text-xs text-white/50">
            {open! + 1} من {shots.length} • اللقطات بتتحذف تلقائيًا بعد مدة الاحتفاظ
          </p>
        </div>
      )}
    </>
  );
}
