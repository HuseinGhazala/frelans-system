import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "الموظفين" };

export default async function EmployeesPage({ searchParams }: PageProps<"/admin/employees">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = sp.status === "inactive" ? "inactive" : sp.status === "all" ? "all" : "active";
  const settings = await getSettings();

  const employees = await db.user.findMany({
    where: {
      role: "EMPLOYEE",
      ...(status !== "all" && { active: status === "active" }),
      ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }),
    },
    include: { profile: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="الموظفين"
        description={`${employees.length} موظف`}
        action={
          <Link href="/admin/employees/new" className={buttonClass()}>
            <Plus size={16} /> إضافة موظف
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-3">
        <Input name="q" defaultValue={q} placeholder="بحث بالاسم أو البريد..." className="max-w-xs" />
        <Select name="status" defaultValue={status} className="w-40">
          <option value="active">النشطين</option>
          <option value="inactive">الموقوفين</option>
          <option value="all">الكل</option>
        </Select>
        <button className={buttonClass("secondary")}>بحث</button>
      </form>

      <Card className="overflow-hidden">
        {employees.length === 0 ? (
          <EmptyState title={q ? "مفيش نتائج" : "لسه مفيش موظفين"} description={q ? "جرّب كلمة بحث تانية" : "ضيف أول موظف عشان تبدأ"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-right text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">الموظف</th>
                  <th className="px-4 py-3 font-medium">المسمى الوظيفي</th>
                  <th className="px-4 py-3 font-medium">المرتب الشهري</th>
                  <th className="px-4 py-3 font-medium">الساعات اليومية</th>
                  <th className="px-4 py-3 font-medium">الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/employees/${e.id}`} className="flex items-center gap-3">
                        <Avatar name={e.name} size={36} />
                        <span className="min-w-0">
                          <span className="block font-medium hover:text-primary">{e.name}</span>
                          <span className="block text-xs text-muted" dir="ltr">{e.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{e.jobTitle ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{e.profile ? formatMoney(e.profile.monthlySalary.toString(), settings.general.currency) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{e.profile ? Number(e.profile.dailyHours) : settings.attendance.defaultDailyHours} ساعات</td>
                    <td className="px-4 py-3">
                      {!e.active ? <Badge tone="danger">موقوف</Badge> : e.passwordHash ? <Badge tone="success">نشط</Badge> : <Badge tone="warning">في انتظار قبول الدعوة</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
