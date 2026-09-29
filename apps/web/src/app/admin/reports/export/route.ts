import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { csvResponse, hours } from "@/lib/csv";
import { appsReport, attendanceGrid, hoursReport } from "@/lib/reports";
import { CATEGORY_LABEL } from "@/lib/productivity";

const isKey = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const STATUS_LABEL: Record<string, string> = {
  full: "كمّل", short: "ناقص", absent: "غياب", extra: "شغل في إجازة", weekend: "إجازة", holiday: "رسمية", future: "", "not-started": "",
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Unauthorized", { status: 401 });
  const p = request.nextUrl.searchParams;
  const tab = p.get("tab") ?? "hours";
  const from = p.get("from");
  const to = p.get("to");

  if (tab === "attendance") {
    const month = /^\d{4}-\d{2}$/.test(p.get("month") ?? "") ? p.get("month")! : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const grid = await attendanceGrid(y, m);
    return csvResponse(`attendance-${month}.csv`, [
      ["الموظف", ...grid.days],
      ...grid.rows.map((r) => [r.name, ...r.cells.map((c) => (c.workedMs ? `${STATUS_LABEL[c.status]} ${hours(c.workedMs)}` : STATUS_LABEL[c.status]))]),
    ]);
  }
  if (!isKey(from) || !isKey(to)) return new Response("Bad request", { status: 400 });

  if (tab === "apps") {
    const a = await appsReport(from, to);
    return csvResponse(`apps-${from}_${to}.csv`, [
      ["النوع", "الاسم", "التصنيف", "الساعات"],
      ...a.apps.map((i) => ["برنامج", i.name, CATEGORY_LABEL[i.category], hours(i.minutes * 60_000)]),
      ...a.domains.map((i) => ["موقع", i.name, CATEGORY_LABEL[i.category], hours(i.minutes * 60_000)]),
    ]);
  }

  const rows = await hoursReport(from, to);
  return csvResponse(`hours-${from}_${to}.csv`, [
    ["الموظف", "أيام العمل", "أيام الحضور", "أيام الغياب", "الساعات المطلوبة", "الساعات الفعلية", "الفرق", "خمول (ساعة)", "النشاط %", "الإنتاجية %"],
    ...rows.map((r) => [r.name, r.workingDays, r.presentDays, r.absentDays, hours(r.requiredMs), hours(r.workedMs), hours(r.diffMs), hours(r.idleMs), r.activityPercent, r.productivityPercent]),
  ]);
}
