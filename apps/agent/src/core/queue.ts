import type { MinuteRecord } from "./minutes";

/** نفس شكل أحداث السيرفر (apps/web/src/lib/agent/protocol.ts) */
export type QueuedEvent =
  | { id: string; type: "check_in" | "break_start" | "break_end"; at: string }
  | { id: string; type: "check_out"; at: string; reason: "MANUAL" | "AUTO_IDLE" }
  | { id: string; type: "idle"; at: string; endAt: string };

export type QueueData = { events: QueuedEvent[]; minutes: MinuteRecord[] };

export type QueueStorage = { load(): QueueData | null; save(data: QueueData): void };

const MAX_MINUTES = 60 * 24 * 3; // 3 أيام أوفلاين

/** طابور محفوظ على الجهاز: لو النت فصل، الأحداث والدقائق بتفضل محفوظة لحد ما تتبعت */
export class SyncQueue {
  private data: QueueData;

  constructor(private storage: QueueStorage) {
    this.data = storage.load() ?? { events: [], minutes: [] };
  }

  pushEvent(e: QueuedEvent) {
    this.data.events.push(e);
    this.persist();
  }

  pushMinutes(m: MinuteRecord[]) {
    if (!m.length) return;
    this.data.minutes.push(...m);
    if (this.data.minutes.length > MAX_MINUTES) this.data.minutes.splice(0, this.data.minutes.length - MAX_MINUTES);
    this.persist();
  }

  /** دفعة للإرسال. بعد ما السيرفر يرد بنجاح بننادي ack بنفس الأعداد */
  peek(maxEvents = 200, maxMinutes = 1000) {
    return { events: this.data.events.slice(0, maxEvents), minutes: this.data.minutes.slice(0, maxMinutes) };
  }

  ack(events: number, minutes: number) {
    this.data.events.splice(0, events);
    this.data.minutes.splice(0, minutes);
    this.persist();
  }

  get size() {
    return this.data.events.length + this.data.minutes.length;
  }

  clear() {
    this.data = { events: [], minutes: [] };
    this.persist();
  }

  private persist() {
    this.storage.save(this.data);
  }
}
