import { ChatUnreadBadge } from "@/components/chat/unread-badge";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireEmployee } from "@/lib/auth/dal";
import { unreadTotal } from "@/lib/chat/service";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

const HOURS_NAV: NavItem[] = [
  { href: "/me", label: "الرئيسية", icon: "Home", exact: true },
  { href: "/me/activity", label: "نشاطي", icon: "Activity" },
  { href: "/me/chat", label: "الشات", icon: "MessageCircle" },
  { href: "/me/leaves", label: "إجازاتي", icon: "CalendarDays" },
  { href: "/me/payslip", label: "كشف المرتب", icon: "Wallet" },
  { href: "/me/download", label: "تحميل البرنامج", icon: "Download" },
];
const TASKS_NAV: NavItem[] = [
  { href: "/me", label: "تاسكاتي", icon: "ListChecks", exact: true },
  { href: "/me/chat", label: "الشات", icon: "MessageCircle" },
  { href: "/me/leaves", label: "إجازاتي", icon: "CalendarDays" },
  { href: "/me/payslip", label: "كشف المرتب", icon: "Wallet" },
];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireEmployee(), getSettings()]);
  const [profile, chatUnread] = await Promise.all([
    db.employeeProfile.findUnique({ where: { userId: user.id }, select: { workMode: true } }),
    unreadTotal(user.id).catch(() => 0),
  ]);
  const nav = (profile?.workMode === "TASKS" ? TASKS_NAV : HOURS_NAV).map((item) =>
    item.href === "/me/chat" ? { ...item, badgeNode: <ChatUnreadBadge initial={chatUnread} /> } : item,
  );
  return (
    <AppShell nav={nav} user={{ name: user.name, email: user.email, roleLabel: user.jobTitle ?? "موظف" }} companyName={settings.general.companyName} accountHref="/me/account">
      {children}
    </AppShell>
  );
}
