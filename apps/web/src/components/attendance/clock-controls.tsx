"use client";

import { useEffect, useState, useTransition } from "react";
import { Coffee, LogIn, LogOut, Play } from "lucide-react";
import { checkIn, checkOut, endBreak, startBreak } from "@/app/actions/attendance";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { LiveStatus } from "@/lib/attendance";
import { formatDuration } from "@/lib/time";

/** عداد حي لساعات اليوم + أزرار الحضور والاستراحة */
export function ClockControls({
  status,
  workedMsAtRender,
  renderedAt,
  requiredMs,
  allowWeb,
}: {
  status: LiveStatus;
  workedMsAtRender: number;
  renderedAt: number;
  requiredMs: number;
  allowWeb: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    if (status !== "WORKING") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const worked = workedMsAtRender + (status === "WORKING" ? Math.max(0, now - renderedAt) : 0);
  const pct = Math.min(100, (worked / requiredMs) * 100);
  const run = (fn: () => Promise<ActionState>) => start(async () => setState(await fn()));

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--surface-2)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={pct >= 100 ? "var(--success)" : "var(--primary)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct} 100`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{formatDuration(worked)}</span>
          <span className="text-xs text-muted">من {formatDuration(requiredMs)}</span>
        </div>
      </div>

      <div className="flex-1 space-y-3 text-center sm:text-right">
        {status === "OFFLINE" && (
          <Button size="lg" disabled={pending || !allowWeb} onClick={() => run(checkIn)}>
            <LogIn size={18} /> تسجيل حضور
          </Button>
        )}
        {status === "WORKING" && (
          <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
            <Button variant="warning" size="lg" disabled={pending} onClick={() => run(startBreak)}>
              <Coffee size={18} /> استراحة
            </Button>
            <Button variant="secondary" size="lg" disabled={pending} onClick={() => run(checkOut)}>
              <LogOut size={18} className="rotate-180" /> تسجيل انصراف
            </Button>
          </div>
        )}
        {status === "ON_BREAK" && (
          <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
            <Button size="lg" disabled={pending} onClick={() => run(endBreak)}>
              <Play size={18} /> استئناف العمل
            </Button>
            <Button variant="secondary" size="lg" disabled={pending} onClick={() => run(checkOut)}>
              تسجيل انصراف
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          {allowWeb
            ? "الحضور من الموقع بيسجل الوقت بس، من غير تتبع نشاط أو سكرين شوت."
            : "تسجيل الحضور من الموقع متوقف — استخدم برنامج الديسكتوب."}
        </p>
        <FormMessage state={state} />
      </div>
    </div>
  );
}
