/**
 * متابعة الخمول: لو مفيش أي نشاط (كيبورد/ماوس) أكتر من الحد، الفترة دي بتتعلّم خمول وما بتتحسبش.
 * لو الخمول طوّل أكتر من حد الانصراف التلقائي، البرنامج بيعمل Check-out عند بداية الخمول.
 */
export type IdleConfig = { idleThresholdMs: number; autoCheckoutMs: number; warnBeforeMs: number };

export type IdleEvent =
  | { type: "idle_start"; since: number }
  | { type: "idle_end"; start: number; end: number }
  | { type: "warn_checkout"; since: number }
  | { type: "auto_checkout"; at: number };

export class IdleTracker {
  private idleSince: number | null = null;
  private warned = false;
  private closedRanges: [number, number][] = [];

  constructor(private config: IdleConfig) {}

  setConfig(config: IdleConfig) {
    this.config = config;
  }

  get currentIdleSince() {
    return this.idleSince;
  }

  /**
   * @param systemIdleMs الوقت من آخر نشاط (من نظام التشغيل)
   * @param forceIdle الجهاز مقفول أو نايم
   */
  update(now: number, systemIdleMs: number, forceIdle = false): IdleEvent[] {
    const events: IdleEvent[] = [];
    const lastActivity = now - systemIdleMs;
    const idle = forceIdle || systemIdleMs >= this.config.idleThresholdMs;

    if (idle && this.idleSince === null) {
      this.idleSince = forceIdle ? Math.min(now, lastActivity) : lastActivity;
      this.warned = false;
      events.push({ type: "idle_start", since: this.idleSince });
    }

    if (this.idleSince !== null) {
      const idleFor = now - this.idleSince;
      if (idle && idleFor >= this.config.autoCheckoutMs) {
        const at = this.idleSince;
        this.reset();
        events.push({ type: "auto_checkout", at });
        return events;
      }
      if (idle && !this.warned && idleFor >= this.config.autoCheckoutMs - this.config.warnBeforeMs) {
        this.warned = true;
        events.push({ type: "warn_checkout", since: this.idleSince });
      }
      if (!idle) {
        const start = this.idleSince;
        const end = Math.max(start, lastActivity);
        this.closedRanges.push([start, end]);
        this.idleSince = null;
        this.warned = false;
        events.push({ type: "idle_end", start, end });
      }
    }
    return events;
  }

  /** هل الدقيقة دي كانت كلها خمول؟ (لتعليم ملخص الدقيقة) */
  isIdleMinute(minuteStart: number, minuteMs = 60_000): boolean {
    const end = minuteStart + minuteMs;
    let covered = 0;
    const ranges = this.idleSince !== null ? [...this.closedRanges, [this.idleSince, Infinity] as [number, number]] : this.closedRanges;
    for (const [a, b] of ranges) covered += Math.max(0, Math.min(b, end) - Math.max(a, minuteStart));
    return covered >= minuteMs / 2;
  }

  /** بنحتفظ بالفترات القديمة لحد ما الدقائق بتاعتها تتبعت بس */
  prune(before: number) {
    this.closedRanges = this.closedRanges.filter(([, b]) => b >= before);
  }

  /** لما الموظف يعمل انصراف أو استراحة */
  reset() {
    this.idleSince = null;
    this.warned = false;
  }
}
