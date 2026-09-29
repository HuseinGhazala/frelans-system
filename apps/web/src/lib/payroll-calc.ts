/**
 * حساب المرتب الشهري (دالة صافية من غير قاعدة بيانات):
 * - سعر الساعة = المرتب ÷ (أيام عمل الشهر كله × الساعات اليومية)
 * - الأساسي = سعر الساعة × الساعات المطلوبة (بيساوي المرتب لو الموظف موجود الشهر كله)
 * - الساعات المحسوبة = الفعلية + الإجازات المدفوعة. الحساب شهري صافي (اليوم الناقص بيتعوض بيوم زيادة)
 * - الناقص × سعر الساعة = خصم
 * - الزيادة = "إضافي مقترح"، وبيتصرف بس اللي الأدمن اعتمده × سعر الساعة × المعامل
 */
export type Adjustment = { kind: "BONUS" | "DEDUCTION"; amount: number; reason: string };

export type PayrollInput = {
  monthlySalary: number;
  fullMonthWorkingDays: number;
  dailyHours: number;
  requiredHours: number;
  workedHours: number;
  paidLeaveHours: number;
  approvedOvertimeHours: number;
  overtimeMultiplier: number;
  adjustments: Adjustment[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computePayroll(i: PayrollInput) {
  const monthHours = i.fullMonthWorkingDays * i.dailyHours;
  const hourlyRate = monthHours > 0 ? i.monthlySalary / monthHours : 0;
  const baseSalary = hourlyRate * i.requiredHours;
  const credited = i.workedHours + i.paidLeaveHours;
  const shortHours = Math.max(0, i.requiredHours - credited);
  const surplusHours = Math.max(0, credited - i.requiredHours);
  const approvedOvertimeHours = Math.min(Math.max(0, i.approvedOvertimeHours), surplusHours);
  const deduction = shortHours * hourlyRate;
  const overtimePay = approvedOvertimeHours * hourlyRate * i.overtimeMultiplier;
  const adjustmentsTotal = i.adjustments.reduce((t, a) => t + (a.kind === "BONUS" ? a.amount : -a.amount), 0);
  const net = baseSalary - deduction + overtimePay + adjustmentsTotal;
  return {
    hourlyRate: Math.round(hourlyRate * 10000) / 10000,
    baseSalary: r2(baseSalary),
    shortHours: r2(shortHours),
    surplusHours: r2(surplusHours),
    approvedOvertimeHours: r2(approvedOvertimeHours),
    deduction: r2(deduction),
    overtimePay: r2(overtimePay),
    adjustmentsTotal: r2(adjustmentsTotal),
    net: r2(Math.max(0, net)),
  };
}
