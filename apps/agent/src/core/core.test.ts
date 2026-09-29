import { describe, expect, it } from "vitest";
import { IdleTracker } from "./idle";
import { MinuteAggregator } from "./minutes";
import { SyncQueue, type QueueData } from "./queue";
import { siteOf, siteFromTitle } from "./site";

const MIN = 60_000;
const T0 = Date.parse("2026-10-01T09:00:00Z");

describe("siteOf", () => {
  it("uses the URL host when available (macOS)", () => {
    expect(siteOf("Google Chrome", "x", "https://www.github.com/org/repo")).toBe("github.com");
  });
  it("takes the site name from the browser tab title (Windows)", () => {
    expect(siteFromTitle("(3) Inbox - someone@gmail.com - Gmail - Google Chrome")).toBe("Gmail");
    expect(siteFromTitle("Funny cats - YouTube - Personal - Microsoft​ Edge")).toBe("YouTube");
    expect(siteFromTitle("New Tab - Google Chrome")).toBeNull();
  });
  it("ignores non-browser apps", () => {
    expect(siteOf("Code.exe", "index.ts - project - Visual Studio Code")).toBeNull();
  });
});

describe("MinuteAggregator", () => {
  it("counts input per minute and picks the dominant app", () => {
    const a = new MinuteAggregator();
    a.key(T0 + 1000);
    a.key(T0 + 2000);
    a.mouse(T0 + 3000);
    a.window({ app: "Figma", title: "Design", site: null }, T0 + 10_000, 40_000);
    a.window({ app: "Slack", title: "chat", site: null }, T0 + 50_000, 10_000);
    a.key(T0 + MIN + 1000); // الدقيقة الحالية — ما تطلعش
    const out = a.flush(T0 + MIN + 5000, () => false);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ minute: new Date(T0).toISOString(), keyboard: 2, mouse: 1, app: "Figma", idle: false });
    expect(a.flush(T0 + 2 * MIN, () => false)[0].keyboard).toBe(1);
  });
});

describe("IdleTracker", () => {
  const cfg = { idleThresholdMs: 5 * MIN, autoCheckoutMs: 30 * MIN, warnBeforeMs: 5 * MIN };

  it("starts idle at the last activity and ends when activity resumes", () => {
    const t = new IdleTracker(cfg);
    expect(t.update(T0 + 4 * MIN, 4 * MIN)).toEqual([]);
    expect(t.update(T0 + 6 * MIN, 6 * MIN)).toEqual([{ type: "idle_start", since: T0 }]);
    expect(t.isIdleMinute(T0 + 2 * MIN)).toBe(true);
    // رجع اشتغل من 10 ثواني
    expect(t.update(T0 + 12 * MIN, 10_000)).toEqual([{ type: "idle_end", start: T0, end: T0 + 12 * MIN - 10_000 }]);
    expect(t.currentIdleSince).toBeNull();
  });

  it("warns then auto checks out at the start of the idle period", () => {
    const t = new IdleTracker(cfg);
    t.update(T0 + 6 * MIN, 6 * MIN);
    expect(t.update(T0 + 26 * MIN, 26 * MIN)).toEqual([{ type: "warn_checkout", since: T0 }]);
    expect(t.update(T0 + 30 * MIN, 30 * MIN)).toEqual([{ type: "auto_checkout", at: T0 }]);
  });

  it("treats a locked screen as idle immediately", () => {
    const t = new IdleTracker(cfg);
    expect(t.update(T0, 1000, true)).toEqual([{ type: "idle_start", since: T0 - 1000 }]);
  });
});

describe("SyncQueue", () => {
  it("persists and acknowledges in order", () => {
    let saved: QueueData | null = null;
    const storage = { load: () => saved, save: (d: QueueData) => (saved = structuredClone(d)) };
    const q = new SyncQueue(storage);
    q.pushEvent({ id: "1", type: "check_in", at: "x" });
    q.pushEvent({ id: "2", type: "break_start", at: "y" });
    const restored = new SyncQueue(storage); // بعد إعادة تشغيل البرنامج
    expect(restored.peek(1).events.map((e) => e.id)).toEqual(["1"]);
    restored.ack(1, 0);
    expect(restored.peek().events.map((e) => e.id)).toEqual(["2"]);
  });
});

import { ScreenshotScheduler } from "./screenshots";

describe("ScreenshotScheduler", () => {
  it("takes exactly one screenshot per interval at a random time", () => {
    let r = 0.5;
    const s = new ScreenshotScheduler(10 * MIN, () => r);
    s.start(T0);
    expect(s.due(T0 + 4 * MIN)).toBe(false);
    expect(s.due(T0 + 5 * MIN)).toBe(true);
    expect(s.due(T0 + 6 * MIN)).toBe(false); // مرة واحدة بس في الفترة
    r = 0;
    expect(s.due(T0 + 10 * MIN + 5_000)).toBe(false);
    expect(s.due(T0 + 10 * MIN + 10_000)).toBe(true);
  });

  it("skips windows that passed while paused", () => {
    const s = new ScreenshotScheduler(10 * MIN, () => 0.5);
    s.start(T0);
    // الجهاز كان نايم ساعة: لقطة واحدة بس في الفترة الحالية، مش 6
    expect(s.due(T0 + 65 * MIN)).toBe(true);
    expect(s.due(T0 + 66 * MIN)).toBe(false);
  });

  it("does nothing when stopped", () => {
    const s = new ScreenshotScheduler(10 * MIN, () => 0);
    s.start(T0);
    s.stop();
    expect(s.due(T0 + 20 * MIN)).toBe(false);
  });
});
