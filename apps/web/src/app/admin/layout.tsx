import { ChatUnreadBadge } from "@/components/chat/unread-badge";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { unreadAlertCount } from "@/lib/alerts";
import { requireAdmin } from "@/lib/auth/dal";
import { unreadTotal } from "@/lib/chat/service";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const [settings, unread, pendingLeaves, chatUnread] = await Promise.all([
    getSettings(),
    unreadAlertCount(),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    unreadTotal(user.id).catch(() => 0),
  ]);
  const nav: NavItem[] = [
    { href: "/admin", label: "الرئيسية", icon: "Home", exact: true },
    { href: "/admin/employees", label: "الموظفين", icon: "Users" },
    { href: "/admin/reports", label: "التقارير", icon: "BarChart3" },
    { href: "/admin/tasks", label: "المهام (Trello)", icon: "ListChecks" },
    { href: "/admin/chat", label: "الشات", icon: "MessageCircle", badgeNode: <ChatUnreadBadge initial={chatUnread} /> },
    { href: "/admin/leaves", label: "الإجازات", icon: "CalendarDays", badge: pendingLeaves },
    { href: "/admin/payroll", label: "المرتبات", icon: "Wallet" },
    { href: "/admin/alerts", label: "التنبيهات", icon: "Bell", badge: unread },
    { href: "/admin/audit", label: "سجل العمليات", icon: "FileText" },
    { href: "/admin/settings", label: "الإعدادات", icon: "Settings" },
  ];
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email, roleLabel: "مدير النظام" }} companyName={settings.general.companyName} alertsBadge={unread} accountHref="/admin/account">
      {children}
    </AppShell>
  );
}
