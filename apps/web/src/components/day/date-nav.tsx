import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, type DateKey } from "@/lib/time";

/** التنقل بين الأيام (RTL: السهم اليمين = اليوم اللي قبله) */
export function DateNav({ date, today, hrefFor }: { date: DateKey; today: DateKey; hrefFor: (d: DateKey) => string }) {
  const label = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
  const next = addDays(date, 1);
  return (
    <div className="flex items-center gap-2">
      <Link href={hrefFor(addDays(date, -1))} className="rounded-lg border border-border bg-surface p-2 hover:bg-surface-2" aria-label="اليوم السابق">
        <ChevronRight size={16} />
      </Link>
      <span className="min-w-44 text-center text-sm font-medium">{date === today ? `النهارده — ${label}` : label}</span>
      {next <= today ? (
        <Link href={hrefFor(next)} className="rounded-lg border border-border bg-surface p-2 hover:bg-surface-2" aria-label="اليوم التالي">
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span className="rounded-lg border border-border p-2 opacity-40">
          <ChevronLeft size={16} />
        </span>
      )}
    </div>
  );
}
