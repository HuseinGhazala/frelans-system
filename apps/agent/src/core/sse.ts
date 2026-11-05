/**
 * قارئ Server-Sent Events بسيط (حسب مواصفة WHATWG) — من غير مكتبات.
 * بتديله النص زي ما بيوصل (قطع عشوائية)، وبيرجعلك الأحداث الكاملة.
 */

export type SseMessage = { event: string; data: string; id: string | null };

export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private event = "";
  private lastId: string | null = null;
  /** آخر قيمة retry من السيرفر (ms) */
  retry: number | null = null;

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    // السطر بينتهي بـ \n أو \r\n أو \r. لو آخر حرف \r ممكن \n جاية في القطعة الجاية
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c !== "\n" && c !== "\r") continue;
      if (c === "\r" && i === this.buffer.length - 1) break;
      const line = this.buffer.slice(start, i);
      if (c === "\r" && this.buffer[i + 1] === "\n") i++;
      start = i + 1;
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** بداية اتصال جديد: نرمي أي حاجة ناقصة */
  reset() {
    this.buffer = "";
    this.data = [];
    this.event = "";
  }

  private line(line: string): SseMessage | null {
    if (line === "") {
      if (this.data.length === 0) {
        this.event = "";
        return null;
      }
      const msg = { event: this.event || "message", data: this.data.join("\n"), id: this.lastId };
      this.data = [];
      this.event = "";
      return msg;
    }
    if (line.startsWith(":")) return null; // تعليق (ping)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
    else if (field === "id" && !value.includes("\0")) this.lastId = value;
    else if (field === "retry" && /^\d+$/.test(value)) this.retry = Number(value);
    return null;
  }
}
