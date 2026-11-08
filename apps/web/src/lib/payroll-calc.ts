/**
 * حساب المرتب الشهري (دالة صافية من غير قاعدة بيانات):
 * - سعر الساعة = المرتب ÷ (أيام عمل الشهر كله × الساعات اليومية)
 * - الأساسي = سعر الساعة × الساعات المطلوبة (بيساوي المرتب لو الموظف موجود الشهر كله)
 * - الساعات المحسوبة = الفعلية + الإجازات المدفوعة. الحساب شهري صافي (اليوم الناقص بيتعوض بيوم زيادة)
 * - الناقص × سعر الساعة = خصم
 * - الزيادة = "إضافي مقترح"، وبيتصرف بس اللي الأدمن اعتمده × سعر الساعة × المعامل
 */
/**
 * مكافأة أو خصم يدوي. unit: فلوس (المبلغ مكتوب)، أو يوم/ساعة (quantity × سعر اليوم/الساعة من مرتب الموظف).
 * amount دايمًا بالفلوس — لليوم والساعة بيتحسب تلقائي ويتحدّث لو المرتب اتغير.
 * التعديلات القديمة (قبل الوحدات) مفيهاش unit = فلوس.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export type AdjustmentUnit = "MONEY" | "DAY" | "HOUR";
export type Adjustment = { kind: "BONUS" | "DEDUCTION"; amount: number; reason: string; unit?: AdjustmentUnit; quantity?: number };

/** سعر اليوم والساعة: المرتب ÷ أيام عمل الشهر، و÷ الساعات اليومية */
export function salaryRates(monthlySalary: number, fullMonthWorkingDays: number, dailyHours: number) {
  const dayRate = fullMonthWorkingDays > 0 ? monthlySalary / fullMonthWorkingDays : 0;
  const hourRate = dailyHours > 0 ? dayRate / dailyHours : 0;
  return { dayRate, hourRate };
}

/** بيحسب قيمة تعديلات اليوم/الساعة بالفلوس من أسعار المرتب الحالية */
export function priceAdjustments(list: Adjustment[], rates: { dayRate: number; hourRate: number }): Adjustment[] {
  return list.map((a) => {
    if (a.unit === "DAY" && a.quantity != null) return { ...a, amount: r2(a.quantity * rates.dayRate) };
    if (a.unit === "HOUR" && a.quantity != null) return { ...a, amount: r2(a.quantity * rates.hourRate) };
    return a;
  });
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** "خصم يومين" / "مكافأة 3 ساعات" / "خصم" — الكمية بالعربي لليوم والساعة */
export function adjustmentUnitLabel(a: Adjustment): string | null {
  if (a.unit !== "DAY" && a.unit !== "HOUR") return null;
  const q = a.quantity ?? 0;
  if (a.unit === "DAY") return q === 1 ? "يوم" : q === 2 ? "يومين" : `${fmtQty(q)} ${q > 2 && q <= 10 ? "أيام" : "يوم"}`;
  return q === 1 ? "ساعة" : q === 2 ? "ساعتين" : `${fmtQty(q)} ${q > 2 && q <= 10 ? "ساعات" : "ساعة"}`;
}

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

/**
 * مرتب موظف نظام التاسكات: ثابت (بيتقسم بالأيام لو اتعين في نص الشهر)،
 * ناقص أيام الإجازة بدون مرتب، زائد/ناقص التعديلات اليدوية (زي خصم التأخير في التسليم).
 */
export function computeTaskPayroll(i: {
  monthlySalary: number;
  fullMonthWorkingDays: number;
  employeeWorkingDays: number;
  unpaidLeaveDays: number;
  adjustments: Adjustment[];
}) {
  const dayRate = i.fullMonthWorkingDays > 0 ? i.monthlySalary / i.fullMonthWorkingDays : 0;
  const baseSalary = Math.min(i.monthlySalary, dayRate * i.employeeWorkingDays);
  const deduction = dayRate * i.unpaidLeaveDays;
  const adjustmentsTotal = i.adjustments.reduce((t, a) => t + (a.kind === "BONUS" ? a.amount : -a.amount), 0);
  return {
    baseSalary: r2(baseSalary),
    deduction: r2(deduction),
    adjustmentsTotal: r2(adjustmentsTotal),
    net: r2(Math.max(0, baseSalary - deduction + adjustmentsTotal)),
  };
}
