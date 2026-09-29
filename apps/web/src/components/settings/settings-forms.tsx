"use client";

import { useFormAction } from "@/components/ui/use-form-action";
import { useEffect, useRef, useTransition, useState } from "react";
import { Trash2 } from "lucide-react";
import { addHoliday, deleteHoliday, saveSettings, sendTestMail } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Toggle } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import type { Settings, SettingsSection } from "@/lib/settings-schema";

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function SectionForm({ section, title, description, children }: { section: SettingsSection; title: string; description?: string; children: React.ReactNode }) {
  const [state, action, pending] = useFormAction(saveSettings.bind(null, section));
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <form onSubmit={action} className="space-y-4 p-5">
        {children}
        <FormMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </form>
    </Card>
  );
}

const numInput = (name: string, value: number, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
  <Input id={name} name={name} type="number" dir="ltr" defaultValue={value} required {...props} />
);

export function GeneralForm({ s }: { s: Settings["general"] }) {
  return (
    <SectionForm section="general" title="عام">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم الشركة" htmlFor="companyName">
          <Input id="companyName" name="companyName" defaultValue={s.companyName} required />
        </Field>
        <Field label="العملة" htmlFor="currency">
          <Input id="currency" name="currency" defaultValue={s.currency} required />
        </Field>
        <Field label="المنطقة الزمنية" htmlFor="timezone" hint="اليوم بيبدأ وينتهي الساعة 12 بالليل حسبها">
          <Input id="timezone" name="timezone" dir="ltr" defaultValue={s.timezone} required />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">أيام الإجازة الأسبوعية</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => (
            <label key={i} className="cursor-pointer">
              <input type="checkbox" name="weekendDays" value={i} defaultChecked={s.weekendDays.includes(i)} className="peer sr-only" />
              <span className="inline-block rounded-lg border border-border px-3 py-1.5 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
                {d}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </SectionForm>
  );
}

export function AttendanceForm({ s }: { s: Settings["attendance"] }) {
  return (
    <SectionForm section="attendance" title="الحضور والمراقبة" description="القيم دي بتطبق على كل الموظفين، إلا لو اتغيرت لموظف معين">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="الساعات اليومية الافتراضية" htmlFor="defaultDailyHours">
          {numInput("defaultDailyHours", s.defaultDailyHours, { min: 1, max: 24, step: 0.5 })}
        </Field>
        <Field label="حد الخمول (دقيقة)" htmlFor="idleThresholdMin" hint="وقت الخمول ما بيتحسبش">
          {numInput("idleThresholdMin", s.idleThresholdMin, { min: 1, max: 60 })}
        </Field>
        <Field label="السكرين شوت كل (دقيقة)" htmlFor="screenshotIntervalMin" hint="في وقت عشوائي جوه الفترة">
          {numInput("screenshotIntervalMin", s.screenshotIntervalMin, { min: 1, max: 60 })}
        </Field>
        <Field label="حذف اللقطات بعد (يوم)" htmlFor="screenshotRetentionDays">
          {numInput("screenshotRetentionDays", s.screenshotRetentionDays, { min: 1, max: 365 })}
        </Field>
        <Field label="انصراف تلقائي بعد خمول (دقيقة)" htmlFor="autoCheckoutIdleMin">
          {numInput("autoCheckoutIdleMin", s.autoCheckoutIdleMin, { min: 5, max: 240 })}
        </Field>
      </div>
      <div className="divide-y divide-border">
        <Toggle name="blurScreenshots" defaultChecked={s.blurScreenshots} label="تشويش السكرين شوت" hint="التشويش بيتم على جهاز الموظف قبل الرفع" />
        <Toggle name="allowWebCheckIn" defaultChecked={s.allowWebCheckIn} label="السماح بتسجيل الحضور من الموقع" hint="جلسة الموقع بتسجل الوقت بس من غير تتبع نشاط" />
      </div>
    </SectionForm>
  );
}

export function PayrollForm({ s }: { s: Settings["payroll"] }) {
  return (
    <SectionForm section="payroll" title="المرتبات" description="الحساب شهري صافي، والإضافي بيتحسب بعد موافقتك">
      <Field label="معامل الإضافي" htmlFor="overtimeMultiplier" hint="سعر ساعة الإضافي = سعر الساعة × المعامل" className="max-w-xs">
        {numInput("overtimeMultiplier", s.overtimeMultiplier, { min: 1, max: 5, step: 0.05 })}
      </Field>
    </SectionForm>
  );
}

export function AlertsForm({ s }: { s: Settings["alerts"] }) {
  return (
    <SectionForm section="alerts" title="التنبيهات">
      <div className="divide-y divide-border">
        <Toggle name="absence" defaultChecked={s.absence} label="غياب" hint="يوم عمل خلص من غير Check-in ومفيش إجازة" />
        <Toggle name="missingHours" defaultChecked={s.missingHours} label="ساعات ناقصة" hint="الموظف ما كملش ساعاته في اليوم" />
        <Toggle name="longIdle" defaultChecked={s.longIdle} label="خمول طويل" />
        <Toggle name="lowProductivity" defaultChecked={s.lowProductivity} label="إنتاجية منخفضة" />
        <Toggle name="dailySummary" defaultChecked={s.dailySummary} label="ملخص يومي بالإيميل" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="الخمول الطويل بعد (دقيقة)" htmlFor="longIdleMin">
          {numInput("longIdleMin", s.longIdleMin, { min: 5, max: 240 })}
        </Field>
        <Field label="الإنتاجية أقل من (%)" htmlFor="lowProductivityPercent">
          {numInput("lowProductivityPercent", s.lowProductivityPercent, { min: 1, max: 100 })}
        </Field>
        <Field label="وقت الملخص اليومي" htmlFor="dailySummaryTime">
          <Input id="dailySummaryTime" name="dailySummaryTime" type="time" dir="ltr" defaultValue={s.dailySummaryTime} required />
        </Field>
      </div>
      <Field label="الإيميلات اللي يوصلها الملخص والتنبيهات" htmlFor="recipients" hint="افصل بينهم بفاصلة">
        <Input id="recipients" name="recipients" dir="ltr" defaultValue={s.recipients.join(", ")} />
      </Field>
    </SectionForm>
  );
}

export function SmtpForm({ s }: { s: Omit<Settings["smtp"], "password"> & { hasPassword: boolean } }) {
  const [pending, start] = useTransition();
  const [test, setTest] = useState<ActionState>(null);
  return (
    <SectionForm section="smtp" title="البريد الإلكتروني" description="لإرسال الدعوات والتنبيهات. مع Gmail: smtp.gmail.com، بورت 587، وكلمة مرور تطبيق (App Password)">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SMTP Host" htmlFor="host">
          <Input id="host" name="host" dir="ltr" defaultValue={s.host} placeholder="smtp.gmail.com" />
        </Field>
        <Field label="Port" htmlFor="port">
          <Input id="port" name="port" type="number" dir="ltr" defaultValue={s.port} />
        </Field>
        <Field label="اسم المستخدم" htmlFor="user">
          <Input id="user" name="user" dir="ltr" defaultValue={s.user} autoComplete="off" />
        </Field>
        <Field label="كلمة المرور" htmlFor="password" hint={s.hasPassword ? "متسجلة — سيبها فاضية عشان تفضل زي ما هي" : undefined}>
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" />
        </Field>
        <Field label="المرسل (From)" htmlFor="from">
          <Input id="from" name="from" dir="ltr" defaultValue={s.from} placeholder="Rased <you@gmail.com>" />
        </Field>
      </div>
      <Toggle name="secure" defaultChecked={s.secure} label="اتصال SSL مباشر" hint="فعّله مع بورت 465 بس" />
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setTest(await sendTestMail()))}>
          إرسال بريد تجريبي
        </Button>
      </div>
      <FormMessage state={test} />
    </SectionForm>
  );
}

export function HolidaysCard({ holidays }: { holidays: { id: string; date: string; name: string }[] }) {
  const [state, action, pending] = useFormAction(addHoliday);
  const [removing, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);
  return (
    <Card>
      <CardHeader title="الإجازات الرسمية" description="الأيام دي ما بتتحسبش أيام عمل" />
      <div className="space-y-4 p-5">
        <form ref={formRef} onSubmit={action} className="flex flex-wrap items-end gap-3">
          <Field label="التاريخ" htmlFor="date" error={state?.fieldErrors?.date}>
            <Input id="date" name="date" type="date" required />
          </Field>
          <Field label="الاسم" htmlFor="hname" error={state?.fieldErrors?.name} className="min-w-48 flex-1">
            <Input id="hname" name="name" placeholder="مثلاً: عيد الأضحى" required />
          </Field>
          <Button type="submit" disabled={pending}>إضافة</Button>
        </form>
        <FormMessage state={state?.success ? state : null} />
        {holidays.length === 0 ? (
          <p className="text-sm text-muted">مفيش إجازات رسمية متسجلة.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{h.name}</span>
                  <span className="mr-3 text-muted tabular-nums">{h.date}</span>
                </span>
                <button
                  className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                  disabled={removing}
                  onClick={() => start(() => deleteHoliday(h.id))}
                  aria-label={`حذف ${h.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
