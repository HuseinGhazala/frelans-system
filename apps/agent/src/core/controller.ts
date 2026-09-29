import { ServerClock } from "./clock";
import { IdleTracker, type IdleEvent } from "./idle";
import { MinuteAggregator, type WindowSample } from "./minutes";
import { SyncQueue, type QueuedEvent } from "./queue";
import type { ServerState, ViewModel } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type Api = {
  login(serverUrl: string, body: { email: string; password: string; deviceName: string; os: string; appVersion: string }): Promise<{ token: string; state: ServerState }>;
  state(): Promise<ServerState>;
  consent(): Promise<ServerState>;
  sync(body: { events: QueuedEvent[]; minutes: unknown[]; idleSince: string | null }): Promise<ServerState>;
  logout(): Promise<void>;
};

export type Platform = {
  now(): number;
  systemIdleMs(): number;
  isLocked(): boolean;
  activeWindow(): Promise<WindowSample | null>;
  notify(title: string, body: string): void;
  startInput(onKey: () => void, onMouse: () => void): void;
  stopInput(): void;
  newId(): string;
  device: { name: string; os: string; appVersion: string };
};

export type Session = {
  serverUrl: string;
  token: string | null;
  saveServerUrl(url: string): void;
  saveToken(token: string | null): void;
  /** آخر حالة من السيرفر — عشان البرنامج يشتغل لو اتفتح والنت فاصل */
  cachedState: ServerState | null;
  saveState(state: ServerState | null): void;
};

const SYNC_EVERY_MS = 60_000;
const WINDOW_EVERY_MS = 5_000;
const IDLE_EVERY_MS = 5_000;

export class Controller {
  private state: ServerState | null = null;
  private localStatus: ServerState["status"] = "OFFLINE";
  private workedBaseMs = 0;
  private baseAt = 0;
  private online = true;
  private lastSyncAt: number | null = null;
  private error: string | null = null;
  private screen: "loading" | "login" | "consent" | "main" = "loading";
  private busy = false;
  private clock = new ServerClock();
  private agg = new MinuteAggregator();
  private idle: IdleTracker;
  private timers: ReturnType<typeof setInterval>[] = [];
  private tracking = false;
  private syncing: Promise<void> | null = null;
  private lastWindowAt = 0;
  private lastWindow: WindowSample | null = null;
  private listeners = new Set<(v: ViewModel) => void>();

  constructor(
    private api: Api,
    private queue: SyncQueue,
    private platform: Platform,
    private session: Session,
  ) {
    this.idle = new IdleTracker({ idleThresholdMs: 5 * 60_000, autoCheckoutMs: 30 * 60_000, warnBeforeMs: 5 * 60_000 });
  }

  // ---------- الحالة والواجهة ----------

  onChange(fn: (v: ViewModel) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  view(): ViewModel {
    if (this.screen === "loading") return { screen: "loading" };
    if (this.screen === "login") return { screen: "login", serverUrl: this.session.serverUrl, error: this.error, busy: this.busy };
    const s = this.state!;
    if (this.screen === "consent")
      return {
        screen: "consent",
        companyName: s.companyName,
        userName: s.user.name,
        idleThresholdMin: s.config.idleThresholdMin,
        screenshotIntervalMin: s.config.screenshotIntervalMin,
        busy: this.busy,
        error: this.error,
      };
    const webSession = this.localStatus !== "OFFLINE" && s.session?.source === "WEB";
    return {
      screen: "main",
      companyName: s.companyName,
      user: s.user,
      status: this.localStatus,
      webSession,
      sessionStartedAt: s.session ? Date.parse(s.session.startedAt) : null,
      breakStartedAt: s.session?.breakStartedAt ? Date.parse(s.session.breakStartedAt) : null,
      workedBaseMs: this.workedBaseMs,
      baseAt: this.baseAt,
      clockOffsetMs: this.clock.offsetMs,
      dailyMs: s.config.dailyHours * 3_600_000,
      idleSince: this.idle.currentIdleSince,
      online: this.online,
      pending: this.queue.size,
      lastSyncAt: this.lastSyncAt,
      error: this.error,
      dashboardUrl: `${this.session.serverUrl.replace(/\/$/, "")}/me`,
    };
  }

  private emit() {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }

  get status() {
    return this.localStatus;
  }

  get isTracking() {
    return this.tracking;
  }

  // ---------- التشغيل ----------

  async start() {
    this.timers.push(setInterval(() => void this.syncNow(), SYNC_EVERY_MS));
    this.timers.push(setInterval(() => this.tickIdle(), IDLE_EVERY_MS));
    this.timers.push(setInterval(() => void this.tickWindow(), WINDOW_EVERY_MS));
    if (!this.session.token) {
      this.screen = "login";
      this.emit();
      return;
    }
    // نبدأ بآخر حالة محفوظة لحد ما السيرفر يرد (لو النت فاصل البرنامج يفضل شغال)
    const cached = this.session.cachedState;
    if (cached) this.applyState(cached, Date.now(), Date.now(), false);
    await this.syncNow();
    if (this.screen === "loading") {
      this.screen = "login";
      this.error = "مش قادر يوصل للسيرفر. اتأكد من النت.";
      this.emit();
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.setTracking(false);
  }

  // ---------- الدخول والموافقة ----------

  async login(serverUrl: string, email: string, password: string) {
    this.busy = true;
    this.error = null;
    this.emit();
    try {
      const url = serverUrl.trim().replace(/\/$/, "");
      const t0 = Date.now();
      const { name: deviceName, os, appVersion } = this.platform.device;
      const { token, state } = await this.api.login(url, { email, password, deviceName, os, appVersion });
      this.session.saveServerUrl(url);
      this.session.saveToken(token);
      this.queue.clear();
      this.applyState(state, t0, Date.now());
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : "مش قادر يوصل للسيرفر. اتأكد من الرابط والنت.";
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async consent() {
    this.busy = true;
    this.emit();
    try {
      const t0 = Date.now();
      const state = await this.api.consent();
      this.applyState(state, t0, Date.now());
    } catch (e) {
      this.error = e instanceof ApiError ? e.message : "مش قادر يوصل للسيرفر";
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async logout() {
    if (this.localStatus !== "OFFLINE") await this.checkOut();
    await this.syncNow();
    try {
      await this.api.logout();
    } catch {
      // حتى لو فشل، نمسح التوكن من الجهاز
    }
    this.session.saveToken(null);
    this.session.saveState(null);
    this.queue.clear();
    this.state = null;
    this.localStatus = "OFFLINE";
    this.setTracking(false);
    this.screen = "login";
    this.error = null;
    this.emit();
  }

  // ---------- الحضور ----------

  private push(type: "check_in" | "break_start" | "break_end", at = this.clock.now()) {
    this.queue.pushEvent({ id: this.platform.newId(), type, at: new Date(at).toISOString() });
  }

  /** بيقفل الدقائق المفتوحة قبل أي تغيير في الحالة */
  private flushMinutes(all: boolean) {
    const now = this.clock.now();
    this.queue.pushMinutes(this.agg.flush(now, (m) => this.idle.isIdleMinute(m), all));
    this.idle.prune(now - 10 * 60_000);
  }

  private rebase(worked: number) {
    this.workedBaseMs = worked;
    this.baseAt = this.clock.now();
  }

  /** الوقت اللي اتحسب محليًا من آخر مزامنة (للعرض الفوري) */
  private liveWorked() {
    if (this.localStatus !== "WORKING") return this.workedBaseMs;
    const now = this.clock.now();
    const idleSince = this.idle.currentIdleSince;
    return this.workedBaseMs + Math.max(0, (idleSince ?? now) - this.baseAt);
  }

  async checkIn() {
    if (this.localStatus !== "OFFLINE" && this.state?.session?.source !== "WEB") return;
    this.idle.reset();
    this.rebase(this.liveWorked());
    this.push("check_in");
    this.localStatus = "WORKING";
    if (this.state) this.state.session = { id: "local", source: "AGENT", startedAt: new Date(this.clock.now()).toISOString(), breakStartedAt: null };
    this.setTracking(true);
    this.emit();
    await this.syncNow();
  }

  async checkOut(reason: "MANUAL" | "AUTO_IDLE" = "MANUAL", at = this.clock.now()) {
    if (this.localStatus === "OFFLINE") return;
    this.flushMinutes(true);
    this.rebase(this.localStatus === "WORKING" ? this.workedBaseMs + Math.max(0, Math.min(at, this.clock.now()) - this.baseAt) : this.workedBaseMs);
    this.queue.pushEvent({ id: this.platform.newId(), type: "check_out", at: new Date(at).toISOString(), reason });
    this.localStatus = "OFFLINE";
    this.idle.reset();
    this.setTracking(false);
    this.emit();
    await this.syncNow();
  }

  async startBreak() {
    if (this.localStatus !== "WORKING") return;
    this.flushMinutes(true);
    this.rebase(this.liveWorked());
    this.push("break_start");
    this.localStatus = "ON_BREAK";
    if (this.state?.session) this.state.session.breakStartedAt = new Date(this.clock.now()).toISOString();
    this.idle.reset();
    this.setTracking(false);
    this.emit();
    await this.syncNow();
  }

  async endBreak() {
    if (this.localStatus !== "ON_BREAK") return;
    this.rebase(this.workedBaseMs);
    this.push("break_end");
    this.localStatus = "WORKING";
    if (this.state?.session) this.state.session.breakStartedAt = null;
    this.setTracking(true);
    this.emit();
    await this.syncNow();
  }

  // ---------- التتبع ----------

  private setTracking(on: boolean) {
    const canTrack = on && this.state?.session?.source !== "WEB";
    if (canTrack === this.tracking) return;
    this.tracking = canTrack;
    if (canTrack) {
      const onInput = (kind: "key" | "mouse") => {
        const t = this.clock.now();
        if (kind === "key") this.agg.key(t);
        else this.agg.mouse(t);
      };
      this.platform.startInput(() => onInput("key"), () => onInput("mouse"));
      this.lastWindowAt = this.clock.now();
    } else {
      this.platform.stopInput();
      this.agg.clear();
      this.lastWindow = null;
    }
  }

  private async tickWindow() {
    if (!this.tracking) return;
    const now = this.clock.now();
    const elapsed = Math.min(now - this.lastWindowAt, WINDOW_EVERY_MS * 2);
    this.lastWindowAt = now;
    if (this.lastWindow && this.idle.currentIdleSince === null) this.agg.window(this.lastWindow, now, elapsed);
    try {
      this.lastWindow = await this.platform.activeWindow();
    } catch {
      this.lastWindow = null;
    }
  }

  tickIdle() {
    if (!this.tracking) return;
    const now = this.clock.now();
    const events = this.idle.update(now, this.platform.systemIdleMs(), this.platform.isLocked());
    for (const e of events) this.handleIdle(e);
    if (events.length) this.emit();
  }

  /** نادِ دي لما الجهاز يقفل أو ينام أو يرجع */
  onPowerChange() {
    this.tickIdle();
  }

  private handleIdle(e: IdleEvent) {
    switch (e.type) {
      case "idle_start":
        // الوقت من بداية الخمول ما يتحسبش في العداد
        this.rebase(this.workedBaseMs + Math.max(0, e.since - this.baseAt));
        this.baseAt = e.since;
        break;
      case "idle_end": {
        this.queue.pushEvent({ id: this.platform.newId(), type: "idle", at: new Date(e.start).toISOString(), endAt: new Date(e.end).toISOString() });
        this.baseAt = e.end;
        const min = Math.round((e.end - e.start) / 60_000);
        if (min >= 1) this.platform.notify("مرحبًا بعودتك", `${min} دقيقة خمول ما اتحسبتش من ساعات العمل`);
        void this.syncNow();
        break;
      }
      case "warn_checkout": {
        const left = Math.max(1, Math.round((e.since + this.idleConfig().autoCheckoutMs - this.clock.now()) / 60_000));
        this.platform.notify("لسه موجود؟", `مفيش نشاط من فترة — هيتسجل انصراف تلقائي خلال ${left} دقيقة لو مفيش نشاط.`);
        break;
      }
      case "auto_checkout":
        void this.checkOut("AUTO_IDLE", e.at);
        this.platform.notify("تم تسجيل الانصراف", "اتسجل انصراف تلقائي لأن مفيش نشاط لفترة طويلة. سجل حضور تاني لما ترجع.");
        break;
    }
  }

  // ---------- المزامنة ----------

  syncNow(): Promise<void> {
    if (!this.session.token) return Promise.resolve();
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async doSync() {
    if (this.tracking) this.flushMinutes(false);
    try {
      let state: ServerState;
      const t0 = Date.now();
      if (this.state && !this.state.consentRequired) {
        // نبعت كل اللي في الطابور على دفعات
        do {
          const batch = this.queue.peek();
          const idleSince = this.idle.currentIdleSince;
          state = await this.api.sync({ ...batch, idleSince: idleSince ? new Date(idleSince).toISOString() : null });
          this.queue.ack(batch.events.length, batch.minutes.length);
        } while (this.queue.size > 0);
      } else {
        state = await this.api.state();
      }
      this.online = true;
      this.error = null;
      this.lastSyncAt = Date.now();
      this.applyState(state, t0, Date.now());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.session.saveToken(null);
        this.session.saveState(null);
        this.queue.clear();
        this.setTracking(false);
        this.localStatus = "OFFLINE";
        this.screen = "login";
        this.error = e.message;
      } else {
        this.online = false;
      }
    }
    this.emit();
  }

  private idleConfig() {
    const c = this.state?.config ?? { idleThresholdMin: 5, autoCheckoutIdleMin: 30 };
    return {
      idleThresholdMs: c.idleThresholdMin * 60_000,
      autoCheckoutMs: c.autoCheckoutIdleMin * 60_000,
      warnBeforeMs: Math.min(5 * 60_000, (c.autoCheckoutIdleMin * 60_000) / 2),
    };
  }

  private applyState(state: ServerState, t0: number, t1: number, fresh = true) {
    if (fresh) {
      this.clock.sync(state.serverTime, t0, t1);
      this.session.saveState(state);
    }
    this.state = state;
    this.idle.setConfig(this.idleConfig());
    this.screen = state.consentRequired ? "consent" : "main";
    // لو في أحداث لسه ما اتبعتتش، الحالة المحلية هي الأحدث
    if (this.queue.peek().events.length === 0) {
      const wasTracking = this.tracking;
      this.localStatus = state.status;
      this.rebase(state.todayWorkedMs);
      // لو في خمول دلوقتي، العداد يقف عند بدايته
      if (this.idle.currentIdleSince !== null) this.baseAt = Math.max(this.idle.currentIdleSince, this.baseAt);
      this.setTracking(state.status === "WORKING" && state.session?.source === "AGENT");
      if (wasTracking && !this.tracking && state.status === "OFFLINE") {
        this.platform.notify("تم تسجيل الانصراف", "الحضور اتقفل من الموقع أو من المدير.");
      }
    }
  }
}
