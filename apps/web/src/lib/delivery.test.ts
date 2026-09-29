import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: {} }));
vi.mock("./settings", () => ({ getSettings: async () => ({}) }));

const { cardState } = await import("./delivery");

const due = new Date("2026-10-05T12:00:00Z");
const now = new Date("2026-10-10T12:00:00Z");

describe("cardState", () => {
  it("is on time when delivered before the due date or without one", () => {
    expect(cardState(due, new Date("2026-10-05T10:00:00Z"), now)).toEqual({ state: "DONE_ON_TIME", lateDays: 0 });
    expect(cardState(null, new Date("2026-10-09T10:00:00Z"), now)).toEqual({ state: "DONE_ON_TIME", lateDays: 0 });
  });
  it("counts late days for late deliveries", () => {
    expect(cardState(due, new Date("2026-10-07T13:00:00Z"), now)).toEqual({ state: "DONE_LATE", lateDays: 3 });
  });
  it("marks open cards past their due date as overdue", () => {
    expect(cardState(due, null, now)).toEqual({ state: "OVERDUE", lateDays: 5 });
    expect(cardState(new Date("2026-10-20T00:00:00Z"), null, now)).toEqual({ state: "OPEN", lateDays: 0 });
  });
});
