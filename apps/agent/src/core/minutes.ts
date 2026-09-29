/**
 * تجميع النشاط لكل دقيقة: عدد ضغطات الكيبورد، عدد أحداث الماوس، والبرنامج اللي أخد أطول وقت في الدقيقة.
 * مفيش أي تسجيل لمحتوى اللي بيتكتب.
 */
export type WindowSample = { app: string; title: string; site: string | null };

export type MinuteRecord = {
  minute: string; // ISO لبداية الدقيقة (بتوقيت السيرفر)
  keyboard: number;
  mouse: number;
  app: string | null;
  title: string | null;
  domain: string | null;
  idle: boolean;
};

type Bucket = {
  keyboard: number;
  mouse: number;
  windows: Map<string, { ms: number; sample: WindowSample }>;
};

export const MINUTE_MS = 60_000;
export const floorMinute = (t: number) => Math.floor(t / MINUTE_MS) * MINUTE_MS;

export class MinuteAggregator {
  private buckets = new Map<number, Bucket>();

  private bucket(t: number): Bucket {
    const key = floorMinute(t);
    let b = this.buckets.get(key);
    if (!b) {
      b = { keyboard: 0, mouse: 0, windows: new Map() };
      this.buckets.set(key, b);
    }
    return b;
  }

  key(t: number) {
    this.bucket(t).keyboard++;
  }

  mouse(t: number) {
    this.bucket(t).mouse++;
  }

  /** عينة من النافذة النشطة غطّت الـ ms اللي فاتت لحد t */
  window(sample: WindowSample, t: number, ms: number) {
    const b = this.bucket(t);
    const id = `${sample.app}\u0000${sample.site ?? ""}`;
    const cur = b.windows.get(id);
    if (cur) {
      cur.ms += ms;
      cur.sample = sample;
    } else b.windows.set(id, { ms, sample });
  }

  /** بيطلّع الدقائق اللي خلصت (قبل الدقيقة الحالية) */
  flush(now: number, isIdle: (minuteStart: number) => boolean, all = false): MinuteRecord[] {
    const current = floorMinute(now);
    const out: MinuteRecord[] = [];
    for (const [key, b] of [...this.buckets.entries()].sort((a, c) => a[0] - c[0])) {
      if (!all && key >= current) continue;
      this.buckets.delete(key);
      let top: { ms: number; sample: WindowSample } | null = null;
      for (const w of b.windows.values()) if (!top || w.ms > top.ms) top = w;
      out.push({
        minute: new Date(key).toISOString(),
        keyboard: b.keyboard,
        mouse: b.mouse,
        app: top?.sample.app.slice(0, 200) ?? null,
        title: top?.sample.title.slice(0, 300) || null,
        domain: top?.sample.site ?? null,
        idle: isIdle(key),
      });
    }
    return out;
  }

  clear() {
    this.buckets.clear();
  }
}
