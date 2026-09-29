import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { AlertsForm, AttendanceForm, GeneralForm, HolidaysCard, PayrollForm, SmtpForm } from "@/components/settings/settings-forms";
import { CategoriesManager } from "@/components/settings/categories";
import { TrelloSettings } from "@/components/settings/trello";
import { listBoards } from "@/lib/trello";
import { unclassifiedNames } from "@/lib/activity";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "الإعدادات" };

const tabs = [
  { id: "general", label: "عام" },
  { id: "attendance", label: "الحضور والمراقبة" },
  { id: "payroll", label: "المرتبات" },
  { id: "categories", label: "تصنيف البرامج" },
  { id: "alerts", label: "التنبيهات" },
  { id: "email", label: "البريد الإلكتروني" },
  { id: "trello", label: "Trello" },
] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const tab = tabs.find((t) => t.id === sp.tab)?.id ?? "general";
  const settings = await getSettings();
  const holidays = tab === "general" ? await db.holiday.findMany({ orderBy: { date: "asc" } }) : [];
  const { password, ...smtp } = settings.smtp;
  const [rules, unclassified] =
    tab === "categories" ? await Promise.all([db.appCategory.findMany({ orderBy: [{ category: "asc" }, { pattern: "asc" }] }), unclassifiedNames()]) : [[], []];

  return (
    <>
      <PageHeader title="الإعدادات" />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={`?tab=${t.id}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === t.id ? "bg-primary-soft text-primary" : "hover:bg-surface-2"}`}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {tab === "general" && (
            <>
              <GeneralForm s={settings.general} />
              <HolidaysCard holidays={holidays.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10) }))} />
            </>
          )}
          {tab === "attendance" && <AttendanceForm s={settings.attendance} />}
          {tab === "payroll" && <PayrollForm s={settings.payroll} />}
          {tab === "categories" && <CategoriesManager rules={rules} unclassified={unclassified} />}
          {tab === "alerts" && <AlertsForm s={settings.alerts} />}
          {tab === "email" && <SmtpForm s={{ ...smtp, hasPassword: Boolean(password) }} />}
          {tab === "trello" && <TrelloTab trello={settings.trello} tz={settings.general.timezone} />}
        </div>
      </div>
    </>
  );
}

async function TrelloTab({ trello, tz }: { trello: { apiKey: string; token: string; boardIds: string[] }; tz: string }) {
  let boards: { id: string; name: string }[] = [];
  let boardsError: string | null = null;
  if (trello.apiKey && trello.token) {
    try {
      boards = await listBoards(trello);
    } catch (e) {
      boardsError = e instanceof Error ? e.message : "مش قادر يوصل لـ Trello";
    }
  }
  const last = await db.trelloBoard.findFirst({ where: { syncedAt: { not: null } }, orderBy: { syncedAt: "desc" } });
  return (
    <TrelloSettings
      apiKey={trello.apiKey}
      hasToken={Boolean(trello.token)}
      boards={boards}
      selected={trello.boardIds}
      boardsError={boardsError}
      lastSync={last?.syncedAt ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(last.syncedAt) : null}
    />
  );
}
