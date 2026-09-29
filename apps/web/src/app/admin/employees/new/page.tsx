import type { Metadata } from "next";
import { createEmployee } from "@/app/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { PageHeader } from "@/components/ui/card";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "إضافة موظف" };

export default async function NewEmployeePage() {
  const { attendance, general } = await getSettings();
  return (
    <>
      <PageHeader title="إضافة موظف" description="بعد الحفظ هيوصل الموظف رابط يعيّن منه كلمة المرور" />
      <EmployeeForm
        action={createEmployee}
        submitLabel="حفظ وإرسال دعوة"
        currency={general.currency}
        globalDefaults={attendance}
        defaults={{
          name: "",
          email: "",
          phone: "",
          jobTitle: "",
          hiredAt: "",
          monthlySalary: "",
          dailyHours: String(attendance.defaultDailyHours),
          annualLeaveDays: "21",
          casualLeaveDays: "6",
          screenshotIntervalMin: "",
          idleThresholdMin: "",
          blurScreenshots: "default",
        }}
      />
    </>
  );
}
