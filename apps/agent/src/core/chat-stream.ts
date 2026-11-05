import { Backoff } from "./backoff";
import { isChatEvent, type ChatEvent } from "./chat-types";
import { SseParser } from "./sse";

export type StreamStatus = "connecting" | "open" | "closed";

export type StreamResponse = { ok: boolean; status: number; body: ReadableStream<Uint8Array> | null };
export type StreamFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<StreamResponse>;

export type ChatStreamDeps = {
  url: () => string;
  token: () => string | null;
  fetch: StreamFetch;
  onEvent: (ev: ChatEvent) => void;
  onStatus?: (s: StreamStatus) => void;
  /** التوكن اترفض (401) — البرنامج بيكمل يحاول بس أبطأ، والـ Controller هو اللي بيعمل logout */
  onUnauthorized?: () => void;
  /** لو مفيش أي حاجة وصلت المدة دي (السيرفر بيبعت ping كل 25 ثانية) نعتبر الاتصال مات */
  idleTimeoutMs?: number;
  /** الاتصال لازم يفضل مفتوح المدة دي عشان عداد المحاولات يرجع صفر */
  stableAfterMs?: number;
  backoff?: Backoff;
  now?: () => number;
};

/**
 * اتصال SSE بـ /api/agent/v1/chat/stream من الـ main process (التوكن ما بيخرجش للواجهة).
 * بيعيد الاتصال تلقائي بـ backoff أُسّي، وبيقطع ويعيد لو الاتصال سكت (proxy قافل من غير ما يقول).
 */
export class ChatStream {
  private running = false;
  private generation = 0;
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff: Backoff;
  private status: StreamStatus = "closed";
  private now: () => number;

  constructor(private deps: ChatStreamDeps) {
    this.backoff = deps.backoff ?? new Backoff({ baseMs: 1000, maxMs: 60_000 });
    this.now = deps.now ?? Date.now;
  }

  get state() {
    return this.status;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.backoff.reset();
    void this.connect();
  }

  stop() {
    this.running = false;
    this.generation++;
    this.clearRetry();
    this.abort?.abort();
    this.abort = null;
    this.setStatus("closed");
  }

  /** إعادة اتصال فورية (بعد ما الجهاز يصحى من النوم أو النت يرجع) */
  reconnectNow() {
    if (!this.running) return;
    this.generation++;
    this.clearRetry();
    this.abort?.abort();
    this.backoff.reset();
    void this.connect();
  }

  private setStatus(s: StreamStatus) {
    if (s === this.status) return;
    this.status = s;
    this.deps.onStatus?.(s);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private schedule(gen: number) {
    if (!this.running || gen !== this.generation) return;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (gen === this.generation) void this.connect();
    }, this.backoff.next());
  }

  private async connect() {
    if (!this.running) return;
    const gen = ++this.generation;
    const token = this.deps.token();
    if (!token) {
      this.setStatus("connecting");
      this.schedule(gen);
      return;
    }
    this.setStatus("connecting");
    const ac = new AbortController();
    this.abort = ac;
    const idleMs = this.deps.idleTimeoutMs ?? 70_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ac.abort(), idleMs);
    };
    let openedAt: number | null = null;
    try {
      armIdle();
      const res = await this.deps.fetch(this.deps.url(), {
        headers: { authorization: `Bearer ${token}`, accept: "text/event-stream", "cache-control": "no-cache" },
        signal: ac.signal,
      });
      if (res.status === 401) this.deps.onUnauthorized?.();
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done || gen !== this.generation) break;
          armIdle();
          for (const msg of parser.push(decoder.decode(value, { stream: true }))) {
            if (msg.event !== "chat") continue;
            let data: unknown;
            try {
              data = JSON.parse(msg.data);
            } catch {
              continue;
            }
            if (!isChatEvent(data)) continue;
            if (data.type === "hello") {
              openedAt = this.now();
              this.setStatus("open");
            }
            this.deps.onEvent(data);
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    } catch {
      // الاتصال وقع أو اتقطع — هنعيد تحت
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (this.abort === ac) this.abort = null;
    }
    if (!this.running || gen !== this.generation) return;
    if (openedAt != null && this.now() - openedAt >= (this.deps.stableAfterMs ?? 30_000)) this.backoff.reset();
    this.setStatus("connecting");
    this.schedule(gen);
  }
}
