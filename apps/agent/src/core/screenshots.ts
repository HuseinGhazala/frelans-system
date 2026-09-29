/**
 * جدولة اللقطات: لقطة واحدة في وقت عشوائي جوه كل فترة (مثلاً كل 10 دقايق).
 * لو الموظف في استراحة أو خامل، الفترة بتعدي من غير لقطة.
 */
export class ScreenshotScheduler {
  private windowStart = 0;
  private nextAt = Infinity;
  private taken = false;

  constructor(
    private intervalMs: number,
    private random: () => number = Math.random,
  ) {}

  setInterval(ms: number) {
    this.intervalMs = Math.max(60_000, ms);
  }

  /** بداية التتبع (حضور / رجوع من استراحة) */
  start(now: number) {
    this.windowStart = now;
    this.plan();
  }

  stop() {
    this.nextAt = Infinity;
  }

  private plan() {
    this.taken = false;
    // ما ناخدش لقطة في أول/آخر 10 ثواني من الفترة عشان ما تتلزقش في بعض
    const margin = Math.min(10_000, this.intervalMs / 10);
    this.nextAt = this.windowStart + margin + this.random() * (this.intervalMs - 2 * margin);
  }

  /** هل جه وقت لقطة؟ لو أيوه بيرجع true مرة واحدة للفترة دي */
  due(now: number): boolean {
    if (this.nextAt === Infinity) return false;
    while (now >= this.windowStart + this.intervalMs) {
      this.windowStart += this.intervalMs;
      this.plan();
    }
    if (!this.taken && now >= this.nextAt) {
      this.taken = true;
      return true;
    }
    return false;
  }
}
