"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Home,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
  Activity,
  BarChart3,
  ListChecks,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const icons = { Home, Users, Settings, ClipboardList, CalendarDays, Wallet, Bell, FileText, Download, Activity, BarChart3, ListChecks };
export type IconName = keyof typeof icons;
export type NavItem = { href: string; label: string; icon: IconName; soon?: boolean; exact?: boolean; badge?: number };

export function AppShell({
  nav,
  user,
  companyName,
  alertsBadge,
  children,
}: {
  nav: NavItem[];
  user: { name: string; email: string; roleLabel: string };
  companyName: string;
  /** عدد التنبيهات غير المقروءة (للأدمن) — بيظهر كجرس في الموبايل */
  alertsBadge?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-on-primary">ر</span>
        <div className="min-w-0">
          <p className="font-bold leading-tight">راصد</p>
          <p className="truncate text-xs text-muted">{companyName}</p>
        </div>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const Icon = icons[item.icon];
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          if (item.soon) {
            return (
              <li key={item.href}>
                <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/70" title="قريبًا">
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">قريبًا</span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary-soft text-primary" : "text-text hover:bg-surface-2",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.roleLabel}</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label="تسجيل الخروج" title="تسجيل الخروج">
              <LogOut size={18} className="rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-l border-border bg-surface lg:block">{sidebar}</aside>

      {/* موبايل */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="فتح القائمة">
          <Menu size={20} />
        </button>
        <span className="font-bold">راصد</span>
        {alertsBadge !== undefined ? (
          <Link href="/admin/alerts" className="relative rounded-lg p-2 hover:bg-surface-2" aria-label="التنبيهات">
            <Bell size={20} />
            {alertsBadge > 0 && <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-danger" />}
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85%] bg-surface shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute left-3 top-4 rounded-lg p-2 hover:bg-surface-2" aria-label="إغلاق القائمة">
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
