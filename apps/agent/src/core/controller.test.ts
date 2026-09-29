import { describe, expect, it, vi } from "vitest";
import { ApiError, Controller, type Api, type Platform, type Session } from "./controller";
import { SyncQueue, type QueueData, type QueuedEvent } from "./queue";
import type { ServerState } from "./types";

const base: ServerState = {
  serverTime: new Date().toISOString(),
  companyName: "شركة",
  user: { id: "u1", name: "أحمد", email: "a@x.com", jobTitle: null },
  consentRequired: false,
  config: { dailyHours: 8, idleThresholdMin: 5, autoCheckoutIdleMin: 30, screenshotIntervalMin: 10, blurScreenshots: false },
  status: "OFFLINE",
  session: null,
  todayWorkedMs: 0,
};

function setup(initial: Partial<ServerState> = {}) {
  let server: ServerState = { ...base, ...initial };
  const sent: QueuedEvent[] = [];
  let offline = false;
  const api: Api = {
    login: vi.fn(async () => ({ token: "tok", state: server })),
    state: vi.fn(async () => server),
    consent: vi.fn(async () => (server = { ...server, consentRequired: false })),
    sync: vi.fn(async (body) => {
      if (offline) throw new Error("network");
      for (const e of body.events) {
        sent.push(e);
        if (e.type === "check_in") server = { ...server, status: "WORKING", session: { id: "s", source: "AGENT", startedAt: e.at, breakStartedAt: null } };
        if (e.type === "check_out") server = { ...server, status: "OFFLINE", session: null };
        if (e.type === "break_start") server = { ...server, status: "ON_BREAK" };
        if (e.type === "break_end") server = { ...server, status: "WORKING" };
      }
      return { ...server, serverTime: new Date().toISOString() };
    }),
    logout: vi.fn(async () => {}),
    uploadScreenshot: vi.fn(async () => {}),
  };
  const input = { on: false };
  const platform: Platform = {
    now: () => Date.now(),
    systemIdleMs: () => 0,
    isLocked: () => false,
    activeWindow: async () => ({ app: "Code", title: "x", site: null }),
    notify: vi.fn(),
    captureScreens: async () => [{ display: 0, jpeg: new Uint8Array([0xff, 0xd8, 0xff]), width: 10, height: 10 }],
    startInput: () => (input.on = true),
    stopInput: () => (input.on = false),
    newId: (() => {
      let i = 0;
      return () => `e${++i}`;
    })(),
    device: { name: "PC", os: "win", appVersion: "0.1.0" },
  };
  let saved: QueueData | null = null;
  const queue = new SyncQueue({ load: () => saved, save: (d) => (saved = structuredClone(d)) });
  const session: Session = {
    serverUrl: "http://x",
    token: "tok",
    saveServerUrl: () => {},
    saveToken(t) {
      this.token = t;
    },
    cachedState: null,
    saveState: () => {},
  };
  const shotsMap = new Map<string, { meta: import("./controller").ShotMeta; jpeg: Uint8Array }>();
  let n = 0;
  const shotStore = {
    add: (meta: import("./controller").ShotMeta, jpeg: Uint8Array) => void shotsMap.set(String(++n), { meta, jpeg }),
    list: (limit: number) => [...shotsMap.entries()].slice(0, limit).map(([id, v]) => ({ id, meta: v.meta })),
    read: (id: string) => shotsMap.get(id)?.jpeg ?? null,
    remove: (id: string) => void shotsMap.delete(id),
    clear: () => shotsMap.clear(),
    count: () => shotsMap.size,
  };
  const c = new Controller(api, queue, platform, session, shotStore);
  return {
    c,
    api,
    shotsMap,
    sent,
    input,
    queue,
    session,
    setOffline: (v: boolean) => (offline = v),
    setServer: (s: Partial<ServerState>) => (server = { ...server, ...s }),
  };
}

describe("Controller", () => {
  it("captures a screenshot while working and uploads it on sync", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-01T09:00:00Z") });
    try {
      const t = setup();
      await t.c.syncNow();
      await t.c.checkIn();
      vi.setSystemTime(Date.now() + 11 * 60_000);
      t.c.tickIdle();
      await vi.waitFor(() => expect(t.shotsMap.size).toBe(1));
      await t.c.syncNow();
      expect(t.api.uploadScreenshot).toHaveBeenCalledOnce();
      expect(t.shotsMap.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks in, tracks input, takes a break and checks out", async () => {
    const t = setup();
    await t.c.syncNow();
    expect(t.c.view().screen).toBe("main");
    await t.c.checkIn();
    expect(t.c.status).toBe("WORKING");
    expect(t.input.on).toBe(true);
    await t.c.startBreak();
    expect(t.input.on).toBe(false);
    await t.c.endBreak();
    await t.c.checkOut();
    expect(t.sent.map((e) => e.type)).toEqual(["check_in", "break_start", "break_end", "check_out"]);
    expect(t.c.status).toBe("OFFLINE");
  });

  it("keeps working offline and sends queued events when back online", async () => {
    const t = setup();
    await t.c.syncNow();
    t.setOffline(true);
    await t.c.checkIn();
    expect(t.c.status).toBe("WORKING");
    expect(t.c.view()).toMatchObject({ online: false });
    expect(t.queue.size).toBe(1);
    t.setOffline(false);
    await t.c.syncNow();
    expect(t.queue.size).toBe(0);
    expect(t.sent[0].type).toBe("check_in");
    expect(t.c.view()).toMatchObject({ online: true, status: "WORKING" });
  });

  it("does not track a web session until the employee continues from the app", async () => {
    const t = setup({ status: "WORKING", session: { id: "w", source: "WEB", startedAt: new Date().toISOString(), breakStartedAt: null } });
    await t.c.syncNow();
    expect(t.c.view()).toMatchObject({ screen: "main", webSession: true });
    expect(t.input.on).toBe(false);
    await t.c.checkIn();
    expect(t.input.on).toBe(true);
    expect(t.sent.map((e) => e.type)).toEqual(["check_in"]);
  });

  it("stops tracking when checked out from the website", async () => {
    const t = setup();
    await t.c.syncNow();
    await t.c.checkIn();
    t.setServer({ status: "OFFLINE", session: null });
    await t.c.syncNow();
    expect(t.c.status).toBe("OFFLINE");
    expect(t.input.on).toBe(false);
  });

  it("goes back to login when the device is revoked", async () => {
    const t = setup();
    await t.c.syncNow();
    (t.api.sync as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ApiError("الجلسة انتهت", 401));
    await t.c.checkIn();
    expect(t.c.view().screen).toBe("login");
    expect(t.session.token).toBeNull();
  });
});
