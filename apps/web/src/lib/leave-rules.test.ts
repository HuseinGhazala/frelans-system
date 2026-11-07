import { describe, expect, it } from "vitest";
import { casualMonthOverflow, monthLabel } from "./leave-rules";

describe("casual leave monthly cap (3 days)", () => {
  it("allows up to 3 days in a month", () => {
    expect(casualMonthOverflow(["2026-11-10", "2026-11-11", "2026-11-12"], [])).toBeNull();
  });

  it("rejects a 4th day in the same month", () => {
    expect(casualMonthOverflow(["2026-11-20"], ["2026-11-02", "2026-11-03", "2026-11-04"])).toEqual({
      month: "2026-11",
      used: 3,
      requested: 1,
      available: 0,
    });
  });

  it("counts each month separately for a request across months", () => {
    // 2 أيام آخر نوفمبر + 2 أول ديسمبر، ونوفمبر فيه يوم قديم → 3 تمام، وديسمبر 2 تمام
    expect(casualMonthOverflow(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"], ["2026-11-05"])).toBeNull();
    // ونوفمبر فيه يومين قدام → 4 مش مسموح
    expect(casualMonthOverflow(["2026-11-29", "2026-11-30", "2026-12-01"], ["2026-11-05", "2026-11-06"])?.month).toBe("2026-11");
  });

  it("rejects more than 3 days in one request", () => {
    expect(casualMonthOverflow(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"], [])?.available).toBe(3);
  });

  it("labels months in Arabic", () => {
    expect(monthLabel("2026-11")).toBe("نوفمبر 2026");
  });
});
