import { describe, expect, it } from "vitest";
import { shortfallAndSurplus } from "./hours-balance";

const H = 3_600_000;
const days = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
const workingDays = new Set(days);
const dailyMs = 8 * H;

describe("shortfall: monthly net vs per day", () => {
  // يوم 6 ساعات (ناقص 2) ويوم 10 ساعات (زيادة 2)
  const worked = new Map([
    ["2026-11-08", 8 * H],
    ["2026-11-09", 8 * H],
    ["2026-11-10", 6 * H],
    ["2026-11-11", 10 * H],
  ]);

  it("nets days when per-day is off", () => {
    expect(shortfallAndSurplus({ days, workingDays, dailyMs, workedPerDay: worked, paidLeavePerDay: new Map(), dailyFrom: null })).toEqual({ shortMs: 0, surplusMs: 0 });
  });

  it("does not let a long day make up a short day from the start date", () => {
    expect(shortfallAndSurplus({ days, workingDays, dailyMs, workedPerDay: worked, paidLeavePerDay: new Map(), dailyFrom: "2026-11-09" })).toEqual({ shortMs: 2 * H, surplusMs: 2 * H });
  });

  it("keeps netting for days before the start date", () => {
    const w = new Map([
      ["2026-11-08", 6 * H], // قبل التاريخ: ناقص 2
      ["2026-11-09", 10 * H], // من التاريخ: زيادة 2 (ما بتعوضش اللي قبلها)
      ["2026-11-10", 8 * H],
      ["2026-11-11", 8 * H],
    ]);
    expect(shortfallAndSurplus({ days, workingDays, dailyMs, workedPerDay: w, paidLeavePerDay: new Map(), dailyFrom: "2026-11-09" })).toEqual({ shortMs: 2 * H, surplusMs: 2 * H });
  });

  it("counts paid leave as worked and weekend work as surplus", () => {
    const wd = new Set(["2026-11-09", "2026-11-10"]);
    const w = new Map([
      ["2026-11-09", 3 * H],
      ["2026-11-11", 4 * H], // يوم إجازة
    ]);
    const leave = new Map([
      ["2026-11-09", 5 * H],
      ["2026-11-10", 8 * H],
    ]);
    expect(shortfallAndSurplus({ days, workingDays: wd, dailyMs, workedPerDay: w, paidLeavePerDay: leave, dailyFrom: "2026-11-01" })).toEqual({ shortMs: 0, surplusMs: 4 * H });
  });
});
