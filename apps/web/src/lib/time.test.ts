import { describe, expect, it } from "vitest";
import {
  addDays,
  dayRange,
  formatDuration,
  HOUR_MS,
  startOfDay,
  toDateKey,
  weekdayOf,
  workedMs,
  workingDaysInMonth,
} from "./time";

const TZ = "Africa/Cairo";

describe("zoned days", () => {
  it("starts the Cairo day at local midnight (summer time, UTC+3)", () => {
    expect(startOfDay("2026-07-15", TZ).toISOString()).toBe("2026-07-14T21:00:00.000Z");
  });

  it("starts the Cairo day at local midnight (winter time, UTC+2)", () => {
    expect(startOfDay("2026-12-15", TZ).toISOString()).toBe("2026-12-14T22:00:00.000Z");
  });

  it("maps an instant to the Cairo date, not the UTC date", () => {
    // 22:30 UTC = 01:30 next day in Cairo (summer)
    expect(toDateKey(new Date("2026-07-14T22:30:00Z"), TZ)).toBe("2026-07-15");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows Friday", () => {
    expect(weekdayOf("2026-10-02")).toBe(5);
  });
});

describe("workingDaysInMonth", () => {
  it("excludes Fridays and holidays", () => {
    const days = workingDaysInMonth(2026, 10, [5], ["2026-10-06"]);
    // أكتوبر 2026: 31 يوم، فيه 5 جمع (2، 9، 16، 23، 30) + إجازة رسمية
    expect(days).toHaveLength(31 - 5 - 1);
    expect(days).not.toContain("2026-10-02");
    expect(days).not.toContain("2026-10-06");
  });
});

describe("workedMs", () => {
  const { start, end } = dayRange("2026-10-01", TZ);
  const at = (h: number, m = 0) => new Date(start.getTime() + h * HOUR_MS + m * 60000);

  it("subtracts breaks from sessions", () => {
    const ms = workedMs(
      [{ startedAt: at(9), endedAt: at(17), breaks: [{ startedAt: at(13), endedAt: at(13, 30) }] }],
      start,
      end,
    );
    expect(ms).toBe(7.5 * HOUR_MS);
  });

  it("sums multiple sessions", () => {
    const ms = workedMs(
      [
        { startedAt: at(9), endedAt: at(12), breaks: [] },
        { startedAt: at(20), endedAt: at(22), breaks: [] },
      ],
      start,
      end,
    );
    expect(ms).toBe(5 * HOUR_MS);
  });

  it("clips sessions that cross midnight into the requested day", () => {
    const ms = workedMs([{ startedAt: at(22), endedAt: at(26), breaks: [] }], start, end);
    expect(ms).toBe(2 * HOUR_MS);
  });

  it("counts an open session and open break up to now", () => {
    const ms = workedMs(
      [{ startedAt: at(9), endedAt: null, breaks: [{ startedAt: at(11), endedAt: null }] }],
      start,
      end,
      at(12),
    );
    expect(ms).toBe(2 * HOUR_MS);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(5 * HOUR_MS + 7 * 60000)).toBe("5:07");
    expect(formatDuration(-90 * 60000)).toBe("-1:30");
    expect(formatDuration(208 * HOUR_MS - 5000)).toBe("208:00");
  });
});
