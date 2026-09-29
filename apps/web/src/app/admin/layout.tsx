import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";

const nav: NavItem[] = [
  { href: "/admin", label: "الرئيسية", icon: "Home", exact: true },
  { href: "/admin/employees", label: "الموظفين", icon: "Users" },
  { href: "/admin/reports", label: "التقارير", icon: "BarChart3", soon: true },
  { href: "/admin/tasks", label: "المهام (Trello)", icon: "ListChecks", soon: true },
  { href: "/admin/leaves", label: "الإجازات", icon: "CalendarDays", soon: true },
  { href: "/admin/payroll", label: "المرتبات", icon: "Wallet", soon: true },
  { href: "/admin/alerts", label: "التنبيهات", icon: "Bell", soon: true },
  { href: "/admin/audit", label: "سجل العمليات", icon: "FileText" },
  { href: "/admin/settings", label: "الإعدادات", icon: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireAdmin(), getSettings()]);
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email, roleLabel: "مدير النظام" }} companyName={settings.general.companyName}>
      {children}
    </AppShell>
  );
}
