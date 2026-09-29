"use client";

import { useFormAction } from "@/components/ui/use-form-action";
import Link from "next/link";
import type { ActionState } from "@/app/actions/types";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { CopyLink } from "./employee-actions";

export type EmployeeFormValues = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  hiredAt: string;
  monthlySalary: string;
  dailyHours: string;
  annualLeaveDays: string;
  casualLeaveDays: string;
  screenshotIntervalMin: string;
  idleThresholdMin: string;
  blurScreenshots: "default" | "on" | "off";
  trelloMemberId: string;
};

export function EmployeeForm({
  action,
  defaults,
  globalDefaults,
  submitLabel,
  currency,
  trelloMembers = [],
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: EmployeeFormValues;
  globalDefaults: { screenshotIntervalMin: number; idleThresholdMin: number; blurScreenshots: boolean };
  submitLabel: string;
  currency: string;
  trelloMembers?: { id: string; fullName: string; username: string }[];
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state?.fieldErrors ?? {};
  if (state?.link && state.id) {
    return (
      <Card className="space-y-4 p-5">
        <FormMessage state={state} />
        <CopyLink link={state.link} />
        <div className="flex gap-3">
          <Link href={`/admin/employees/${state.id}`} className={buttonClass()}>عرض الموظف</Link>
          <Link href="/admin/employees" className={buttonClass("secondary")}>كل الموظفين</Link>
        </div>
      </Card>
    );
  }
  return (
    <form onSubmit={formAction} className="space-y-6">
      <FormMessage state={state} />

      <Card>
        <CardHeader title="البيانات الأساسية" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="الاسم" htmlFor="name" error={e.name}>
            <Input id="name" name="name" defaultValue={defaults.name} required />
          </Field>
          <Field label="البريد الإلكتروني الشخصي" htmlFor="email" error={e.email} hint="هيوصله عليه رابط الدعوة وهيدخل بيه">
            <Input id="email" name="email" type="email" dir="ltr" defaultValue={defaults.email} required />
          </Field>
          <Field label="رقم الموبايل" htmlFor="phone" error={e.phone}>
            <Input id="phone" name="phone" dir="ltr" defaultValue={defaults.phone} />
          </Field>
          <Field label="المسمى الوظيفي" htmlFor="jobTitle" error={e.jobTitle}>
            <Input id="jobTitle" name="jobTitle" defaultValue={defaults.jobTitle} />
          </Field>
          <Field label="تاريخ التعيين" htmlFor="hiredAt" error={e.hiredAt}>
            <Input id="hiredAt" name="hiredAt" type="date" defaultValue={defaults.hiredAt} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="العمل والمرتب" description="الخصم والإضافي بيتحسبوا بالساعة من المرتب الشهري" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={`المرتب الشهري (${currency})`} htmlFor="monthlySalary" error={e.monthlySalary}>
            <Input id="monthlySalary" name="monthlySalary" type="number" min={0} step="0.01" dir="ltr" defaultValue={defaults.monthlySalary} required />
          </Field>
          <Field label="عدد الساعات اليومية المطلوبة" htmlFor="dailyHours" error={e.dailyHours}>
            <Input id="dailyHours" name="dailyHours" type="number" min={1} max={24} step="0.5" dir="ltr" defaultValue={defaults.dailyHours} required />
          </Field>
          <Field label="رصيد الإجازات السنوية (يوم)" htmlFor="annualLeaveDays" error={e.annualLeaveDays}>
            <Input id="annualLeaveDays" name="annualLeaveDays" type="number" min={0} max={60} dir="ltr" defaultValue={defaults.annualLeaveDays} required />
          </Field>
          <Field label="رصيد الإجازات العارضة (يوم)" htmlFor="casualLeaveDays" error={e.casualLeaveDays}>
            <Input id="casualLeaveDays" name="casualLeaveDays" type="number" min={0} max={60} dir="ltr" defaultValue={defaults.casualLeaveDays} required />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="إعدادات المراقبة" description="سيبها فاضية عشان تاخد الإعدادات العامة" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="السكرين شوت كل (دقيقة)" htmlFor="screenshotIntervalMin" error={e.screenshotIntervalMin}>
            <Input id="screenshotIntervalMin" name="screenshotIntervalMin" type="number" min={1} max={60} dir="ltr" placeholder={`${globalDefaults.screenshotIntervalMin} (عام)`} defaultValue={defaults.screenshotIntervalMin} />
          </Field>
          <Field label="حد الخمول (دقيقة)" htmlFor="idleThresholdMin" error={e.idleThresholdMin}>
            <Input id="idleThresholdMin" name="idleThresholdMin" type="number" min={1} max={60} dir="ltr" placeholder={`${globalDefaults.idleThresholdMin} (عام)`} defaultValue={defaults.idleThresholdMin} />
          </Field>
          <Field label="تشويش السكرين شوت" htmlFor="blurScreenshots">
            <Select id="blurScreenshots" name="blurScreenshots" defaultValue={defaults.blurScreenshots}>
              <option value="default">حسب الإعدادات العامة ({globalDefaults.blurScreenshots ? "مفعّل" : "متوقف"})</option>
              <option value="on">مفعّل</option>
              <option value="off">متوقف</option>
            </Select>
          </Field>
        </div>
      </Card>

      {trelloMembers.length > 0 && (
        <Card>
          <CardHeader title="ربط Trello" description="عشان الكروت المسندة له تظهرله في البرنامج" />
          <div className="p-5">
            <Field label="عضو Trello" htmlFor="trelloMemberId" className="max-w-sm">
              <Select id="trelloMemberId" name="trelloMemberId" defaultValue={defaults.trelloMemberId}>
                <option value="">— مش مربوط —</option>
                {trelloMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} (@{m.username})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "جاري الحفظ..." : submitLabel}
        </Button>
        <Link href="/admin/employees" className={buttonClass("secondary")}>
          إلغاء
        </Link>
      </div>
    </form>
  );
}
