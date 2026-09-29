import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireEmployee } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";

const nav: NavItem[] = [
  { href: "/me", label: "الرئيسية", icon: "Home", exact: true },
  { href: "/me/activity", label: "نشاطي", icon: "Activity" },
  { href: "/me/leaves", label: "إجازاتي", icon: "CalendarDays", soon: true },
  { href: "/me/payslip", label: "كشف المرتب", icon: "Wallet", soon: true },
  { href: "/me/download", label: "تحميل البرنامج", icon: "Download", soon: true },
];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireEmployee(), getSettings()]);
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email, roleLabel: user.jobTitle ?? "موظف" }} companyName={settings.general.companyName}>
      {children}
    </AppShell>
  );
}
