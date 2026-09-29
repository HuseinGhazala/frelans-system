import { describe, expect, it } from "vitest";
import { computePayroll, type PayrollInput } from "./payroll-calc";

// شهر فيه 26 يوم عمل × 8 ساعات = 208 ساعة، ومرتب 20800 → سعر الساعة 100
const base: PayrollInput = {
  monthlySalary: 20800,
  fullMonthWorkingDays: 26,
  dailyHours: 8,
  requiredHours: 208,
  workedHours: 208,
  paidLeaveHours: 0,
  approvedOvertimeHours: 0,
  overtimeMultiplier: 1.5,
  adjustments: [],
};

describe("computePayroll", () => {
  it("pays the full salary when hours are complete", () => {
    expect(computePayroll(base)).toMatchObject({ hourlyRate: 100, baseSalary: 20800, deduction: 0, net: 20800 });
  });

  it("deducts missing hours after netting the month", () => {
    expect(computePayroll({ ...base, workedHours: 198 })).toMatchObject({ shortHours: 10, deduction: 1000, net: 19800 });
  });

  it("counts paid leave as worked", () => {
    expect(computePayroll({ ...base, workedHours: 200, paidLeaveHours: 8 }).net).toBe(20800);
  });

  it("pays overtime only for approved hours, capped by the surplus", () => {
    expect(computePayroll({ ...base, workedHours: 220 })).toMatchObject({ surplusHours: 12, overtimePay: 0, net: 20800 });
    expect(computePayroll({ ...base, workedHours: 220, approvedOvertimeHours: 10 })).toMatchObject({ overtimePay: 1500, net: 22300 });
    expect(computePayroll({ ...base, workedHours: 220, approvedOvertimeHours: 50 }).approvedOvertimeHours).toBe(12);
  });

  it("prorates the base for a mid-month hire", () => {
    expect(computePayroll({ ...base, requiredHours: 104, workedHours: 104 }).net).toBe(10400);
  });

  it("applies bonuses and deductions", () => {
    const r = computePayroll({
      ...base,
      adjustments: [
        { kind: "BONUS", amount: 500, reason: "مكافأة" },
        { kind: "DEDUCTION", amount: 200, reason: "سلفة" },
      ],
    });
    expect(r.net).toBe(21100);
  });
});

import { computeTaskPayroll } from "./payroll-calc";

describe("computeTaskPayroll", () => {
  const base = { monthlySalary: 13000, fullMonthWorkingDays: 26, employeeWorkingDays: 26, unpaidLeaveDays: 0, adjustments: [] };
  it("pays a fixed salary regardless of hours", () => {
    expect(computeTaskPayroll(base).net).toBe(13000);
  });
  it("applies manual late-delivery deductions", () => {
    expect(computeTaskPayroll({ ...base, adjustments: [{ kind: "DEDUCTION", amount: 300, reason: "تأخير تسليم" }] }).net).toBe(12700);
  });
  it("prorates a mid-month hire and deducts unpaid leave days", () => {
    expect(computeTaskPayroll({ ...base, employeeWorkingDays: 13 }).net).toBe(6500);
    expect(computeTaskPayroll({ ...base, unpaidLeaveDays: 2 })).toMatchObject({ deduction: 1000, net: 12000 });
  });
});
