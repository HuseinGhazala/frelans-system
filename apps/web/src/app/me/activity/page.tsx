import type { Metadata } from "next";
import { DateNav } from "@/components/day/date-nav";
import { DayView } from "@/components/day/day-view";
import { PageHeader } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { HOUR_MS, toDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "نشاطي" };

export default async function MyActivityPage({ searchParams }: PageProps<"/me/activity">) {
  const user = await requireEmployee();
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.general.timezone;
  const today = toDateKey(new Date(), tz);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const profile = await db.employeeProfile.findUnique({ where: { userId: user.id } });

  return (
    <>
      <PageHeader title="نشاطي" description="كل اللي اتسجل عنك: الحضور، النشاط، البرامج، ولقطات الشاشة" action={<DateNav date={date} today={today} hrefFor={(d) => `?date=${d}`} />} />
      <DayView
        userId={user.id}
        date={date}
        tz={tz}
        dailyMs={Number(profile?.dailyHours ?? settings.attendance.defaultDailyHours) * HOUR_MS}
        intervalMin={profile?.screenshotIntervalMin ?? settings.attendance.screenshotIntervalMin}
      />
    </>
  );
}
