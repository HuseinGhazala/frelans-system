import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "سجل العمليات" };

const ACTIONS: Record<string, string> = {
  "setup.admin_created": "إنشاء حساب المدير",
  "auth.invite_accepted": "قبول الدعوة وتعيين كلمة المرور",
  "auth.password_reset": "تعيين كلمة مرور جديدة",
  "auth.password_changed": "تغيير كلمة المرور",
  "employee.created": "إضافة موظف",
  "employee.updated": "تعديل بيانات موظف",
  "employee.activated": "إعادة تفعيل موظف",
  "employee.deactivated": "إيقاف موظف",
  "employee.access_link_issued": "إصدار رابط دخول لموظف",
  "settings.updated": "تعديل الإعدادات",
  "holiday.added": "إضافة إجازة رسمية",
  "holiday.deleted": "حذف إجازة رسمية",
  "agent.device_registered": "تسجيل دخول من برنامج الديسكتوب",
  "agent.monitoring_consent": "الموافقة على المراقبة",
  "device.revoked": "إلغاء جهاز",
  "category.set": "تصنيف برنامج/موقع",
  "category.deleted": "حذف تصنيف",
  "trello.connected": "ربط Trello",
  "trello.disconnected": "إلغاء ربط Trello",
  "trello.boards_selected": "اختيار بوردات Trello",
  "leave.requested": "طلب إجازة",
  "leave.cancelled": "إلغاء طلب إجازة",
  "leave.approved": "الموافقة على إجازة",
  "leave.rejected": "رفض إجازة",
  "payroll.refreshed": "حساب مسودة المرتبات",
  "payroll.overtime_approved": "اعتماد ساعات إضافي",
  "payroll.adjustment_added": "إضافة تعديل على مرتب",
  "payroll.adjustment_removed": "حذف تعديل من مرتب",
  "payroll.approved": "اعتماد مرتبات الشهر",
  "payroll.reopened": "إلغاء اعتماد المرتبات",
};

export default async function AuditPage() {
  const { general } = await getSettings();
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  const targetIds = logs.filter((l) => l.targetType === "user" && l.targetId).map((l) => l.targetId!);
  const targets = new Map((await db.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const fmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: general.timezone });

  return (
    <>
      <PageHeader title="سجل العمليات" description="آخر 200 عملية حساسة في النظام" />
      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState title="السجل فاضي" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-right text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">الوقت</th>
                  <th className="px-4 py-3 font-medium">المستخدم</th>
                  <th className="px-4 py-3 font-medium">العملية</th>
                  <th className="px-4 py-3 font-medium">على</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted tabular-nums">{fmt.format(l.createdAt)}</td>
                    <td className="px-4 py-3">{l.actor?.name ?? "النظام"}</td>
                    <td className="px-4 py-3">{ACTIONS[l.action] ?? l.action}</td>
                    <td className="px-4 py-3 text-muted">{l.targetType === "user" ? targets.get(l.targetId!) ?? "—" : l.targetType === "device" ? "جهاز" : l.targetId ?? "—"}</td>
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
