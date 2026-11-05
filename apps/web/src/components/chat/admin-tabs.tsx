import Link from "next/link";
import { cn } from "@/lib/utils";

/** تابات صفحة الشات عند الأدمن: محادثاته هو، ومراقبة كل المحادثات */
export function AdminChatTabs({ active }: { active: "chat" | "monitor" }) {
  const tabs = [
    { key: "chat", href: "/admin/chat", label: "محادثاتي" },
    { key: "monitor", href: "/admin/chat/monitor", label: "مراقبة الشات" },
  ] as const;
  return (
    <nav className="flex gap-1 rounded-lg bg-surface-2 p-1" aria-label="أقسام الشات">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn("rounded-md px-3 py-1 text-sm font-medium", active === t.key ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
