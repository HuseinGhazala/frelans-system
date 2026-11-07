import { afterEach, describe, expect, it, vi } from "vitest";
import { Backoff, backoffDelay } from "./backoff";
import { badgeCircle, drawBadgeDot } from "./badge";
import {
  applyChatEvent,
  badgeLabel,
  emptyChatState,
  isUnknownConversation,
  notificationText,
  readersOf,
  setConversations,
  shouldNotify,
  unreadTotal,
  type ChatListState,
} from "./chat-state";
import { ChatStream, type StreamResponse } from "./chat-stream";
import { decodeMentions, encodeMentions, mentionQuery, segments } from "./chat-text";
import type { ChatEvent, ChatMessage, ConversationSummary } from "./chat-types";
import { SseParser } from "./sse";

// ───────────── SSE ─────────────

describe("SseParser", () => {
  it("parses events split across arbitrary chunks", () => {
    const p = new SseParser();
    const raw = `retry: 3000\n\nevent: chat\ndata: {"type":"hello"}\n\n: ping\n\nevent: chat\ndata: {"a":1}\n\n`;
    const out = [];
    for (let i = 0; i < raw.length; i += 3) out.push(...p.push(raw.slice(i, i + 3)));
    expect(out).toEqual([
      { event: "chat", data: '{"type":"hello"}', id: null },
      { event: "chat", data: '{"a":1}', id: null },
    ]);
    expect(p.retry).toBe(3000);
  });

  it("handles CRLF (even split between chunks), multi-line data, default event and ids", () => {
    const p = new SseParser();
    expect(p.push("id: 7\r")).toEqual([]);
    expect(p.push("\ndata: a\r\ndata:b\r\n\r")).toEqual([]);
    expect(p.push("\n")).toEqual([{ event: "message", data: "a\nb", id: "7" }]);
  });

  it("ignores comments and blank events, keeps incomplete lines buffered", () => {
    const p = new SseParser();
    expect(p.push(": ping\n\n\n")).toEqual([]);
    expect(p.push("event: chat\ndata: {")).toEqual([]);
    expect(p.push("}\n\n")).toEqual([{ event: "chat", data: "{}", id: null }]);
  });

  it("reset drops a half-received event", () => {
    const p = new SseParser();
    p.push("event: chat\ndata: x\n");
    p.reset();
    expect(p.push("\n")).toEqual([]);
  });
});

// ───────────── backoff ─────────────

describe("backoff", () => {
  it("grows exponentially with equal jitter and caps", () => {
    const lo = { baseMs: 1000, maxMs: 30_000, random: () => 0 };
    const hi = { ...lo, random: () => 1 };
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, hi))).toEqual([1000, 2000, 4000, 8000]);
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, lo))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffDelay(10, hi)).toBe(30_000);
    expect(backoffDelay(1000, hi)).toBe(30_000);
  });

  it("counts attempts and resets", () => {
    const b = new Backoff({ baseMs: 100, maxMs: 1000, random: () => 1 });
    expect([b.next(), b.next(), b.next()]).toEqual([100, 200, 400]);
    b.reset();
    expect(b.next()).toBe(100);
  });
});

// ───────────── unread / الحالة ─────────────

const ME = "me000000001";
const BOB = "bob00000001";
const ANN = "ann00000001";

function member(id: string, name: string, lastReadAt: string | null = null) {
  return { id, name, role: "EMPLOYEE" as const, jobTitle: null, active: true, memberRole: "MEMBER" as const, lastReadAt };
}

function conv(id: string, type: ConversationSummary["type"], unread: number, at: string, members = [member(ME, "أنا"), member(BOB, "بوب علي")]): ConversationSummary {
  return { id, type, title: type === "GENERAL" ? "القناة العامة" : type === "GROUP" ? "فريق" : "بوب علي", members, lastMessage: null, lastMessageAt: at, unread, isMember: true, myRole: "MEMBER" };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m1", conversationId: "d1", senderId: BOB, body: "أهلا", createdAt: "2026-11-05T10:00:00.000Z", editedAt: null, deletedAt: null, replyTo: null, attachments: [], mentionIds: [], ...over };
}

function base(): ChatListState {
  let s = applyChatEvent(emptyChatState(), { type: "hello", userId: ME, presence: { [BOB]: "WORKING" } });
  s = setConversations(s, [conv("d1", "DIRECT", 2, "2026-11-05T09:00:00.000Z"), conv("g0", "GENERAL", 1, "2026-11-05T09:30:00.000Z")]);
  return s;
}

describe("chat state / unread", () => {
  it("sums unread across conversations and sorts newest first", () => {
    const s = base();
    expect(unreadTotal(s)).toBe(3);
    expect(s.conversations.map((c) => c.id)).toEqual(["g0", "d1"]);
    expect(s.me).toBe(ME);
  });

  it("message from someone else increments unread, updates preview, moves conversation to top", () => {
    const s = applyChatEvent(base(), { type: "message.created", message: msg({ body: "@[أنا](me000000001) شوف ده" }) });
    const d = s.conversations[0];
    expect(d.id).toBe("d1");
    expect(d.unread).toBe(3);
    expect(d.lastMessage?.preview).toBe("@أنا شوف ده");
    expect(unreadTotal(s)).toBe(4);
  });

  it("my own message zeroes unread (server marks it read)", () => {
    const s = applyChatEvent(base(), { type: "message.created", message: msg({ senderId: ME }) });
    expect(s.conversations.find((c) => c.id === "d1")?.unread).toBe(0);
    expect(unreadTotal(s)).toBe(1);
  });

  it("read event by me clears that conversation; read by others only updates receipts", () => {
    let s = applyChatEvent(base(), { type: "read", conversationId: "d1", userId: BOB, lastReadAt: "2026-11-05T11:00:00.000Z" });
    expect(unreadTotal(s)).toBe(3);
    expect(s.conversations.find((c) => c.id === "d1")?.members.find((m) => m.id === BOB)?.lastReadAt).toBe("2026-11-05T11:00:00.000Z");
    s = applyChatEvent(s, { type: "read", conversationId: "d1", userId: ME, lastReadAt: "2026-11-05T11:00:00.000Z" });
    expect(unreadTotal(s)).toBe(1);
  });

  it("conversation.updated replaces, conversation.removed drops", () => {
    let s = applyChatEvent(base(), { type: "conversation.updated", conversation: conv("g0", "GENERAL", 7, "2026-11-05T09:30:00.000Z") });
    expect(unreadTotal(s)).toBe(9);
    s = applyChatEvent(s, { type: "conversation.removed", conversationId: "g0" });
    expect(unreadTotal(s)).toBe(2);
  });

  it("deleted last message updates preview; unknown conversations are detected", () => {
    let s = applyChatEvent(base(), { type: "message.created", message: msg() });
    s = applyChatEvent(s, { type: "message.deleted", conversationId: "d1", messageId: "m1" });
    expect(s.conversations.find((c) => c.id === "d1")?.lastMessage?.preview).toBe("الرسالة اتمسحت");
    const ev: ChatEvent = { type: "message.created", message: msg({ conversationId: "new" }) };
    expect(isUnknownConversation(s, ev)).toBe(true);
    expect(applyChatEvent(s, ev)).toBe(s);
  });

  it("presence events update the map; non-members don't count", () => {
    let s = applyChatEvent(base(), { type: "presence", userId: BOB, status: "ON_BREAK" });
    expect(s.presence[BOB]).toBe("ON_BREAK");
    s = setConversations(s, [{ ...conv("x", "GROUP", 5, "2026-11-05T09:00:00.000Z"), isMember: false }]);
    expect(unreadTotal(s)).toBe(0);
  });

  it("badge label caps at 99+", () => {
    expect(badgeLabel(5)).toBe("5");
    expect(badgeLabel(120)).toBe("99+");
  });
});

describe("notifications", () => {
  const s = base();
  const direct = s.conversations.find((c) => c.id === "d1");
  const general = s.conversations.find((c) => c.id === "g0");

  it("notifies for others' direct messages only when the window isn't focused", () => {
    expect(shouldNotify(msg(), { me: ME, conversation: direct, windowFocused: false })).toBe(true);
    expect(shouldNotify(msg(), { me: ME, conversation: direct, windowFocused: true })).toBe(false);
    expect(shouldNotify(msg({ senderId: ME }), { me: ME, conversation: direct, windowFocused: false })).toBe(false);
    expect(shouldNotify(msg({ deletedAt: "2026-11-05T10:00:00.000Z" }), { me: ME, conversation: direct, windowFocused: false })).toBe(false);
  });

  it("general channel only notifies when mentioned", () => {
    expect(shouldNotify(msg({ conversationId: "g0" }), { me: ME, conversation: general, windowFocused: false })).toBe(false);
    expect(shouldNotify(msg({ conversationId: "g0", mentionIds: [ME] }), { me: ME, conversation: general, windowFocused: false })).toBe(true);
  });

  it("builds title/body", () => {
    expect(notificationText(msg(), direct, ME)).toEqual({ title: "بوب علي", body: "أهلا" });
    expect(notificationText(msg({ mentionIds: [ME], body: "" , attachments: [{ id: "a", kind: "VOICE", name: "v", mime: "audio/webm", bytes: 1, width: null, height: null, durationSec: 3, expired: false }] }), general, ME)).toEqual({
      title: "بوب علي • القناة العامة (منشن)",
      body: "🎤 رسالة صوتية",
    });
  });
});

describe("read receipts", () => {
  it("counts members other than the sender who read after the message", () => {
    const c = conv("g1", "GROUP", 0, "2026-11-05T09:00:00.000Z", [member(ME, "أنا"), member(BOB, "بوب", "2026-11-05T10:05:00.000Z"), member(ANN, "آن", "2026-11-05T09:00:00.000Z")]);
    expect(readersOf({ senderId: ME, createdAt: "2026-11-05T10:00:00.000Z" }, c)).toEqual({ read: 1, total: 2 });
  });
});

// ───────────── النص والمنشن ─────────────

describe("chat text", () => {
  it("splits mentions and links", () => {
    expect(segments("يا @[بوب علي](bob00000001) شوف https://x.com/a?b=1. تمام")).toEqual([
      { type: "text", text: "يا " },
      { type: "mention", name: "بوب علي", userId: BOB },
      { type: "text", text: " شوف " },
      { type: "link", url: "https://x.com/a?b=1" },
      { type: "text", text: ". تمام" },
    ]);
  });

  it("encodes picked mentions (longest name first) and decodes back", () => {
    const picks = [
      { id: BOB, name: "بوب" },
      { id: ANN, name: "بوب علي" },
    ];
    const body = encodeMentions("@بوب علي و @بوب و @بوبي", picks);
    expect(body).toBe("@[بوب علي](ann00000001) و @[بوب](bob00000001) و @بوبي");
    expect(decodeMentions(body)).toEqual({ text: "@بوب علي و @بوب و @بوبي", picks: [{ id: ANN, name: "بوب علي" }, { id: BOB, name: "بوب" }] });
  });

  it("detects an @query at the caret", () => {
    expect(mentionQuery("أهلا @بو", 8)).toEqual({ query: "بو", start: 5 });
    expect(mentionQuery("@", 1)).toEqual({ query: "", start: 0 });
    expect(mentionQuery("mail@x", 6)).toBeNull();
    expect(mentionQuery("@بوب خلاص", 9)).toBeNull();
  });
});

// ───────────── علامة الأيقونة ─────────────

describe("badge", () => {
  it("draws a red dot in the top-right corner only", () => {
    const w = 16;
    const out = drawBadgeDot(new Uint8Array(w * w * 4), w, w);
    const px = (x: number, y: number) => Array.from(out.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(px(13, 2)).toEqual([38, 38, 220, 255]); // BGRA
    expect(px(0, 15)).toEqual([0, 0, 0, 0]);
    expect(px(2, 2)).toEqual([0, 0, 0, 0]);
    expect(badgeCircle(16)[(8 * 16 + 8) * 4 + 3]).toBe(255);
  });
});

// ───────────── اتصال SSE + إعادة الاتصال ─────────────

function streamOf(chunks: string[], keepOpen = false): StreamResponse {
  const enc = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        if (!keepOpen) c.close();
      },
    }),
  };
}

describe("ChatStream", () => {
  afterEach(() => vi.useRealTimers());

  it("delivers chat events, then reconnects with backoff after the stream ends", async () => {
    vi.useFakeTimers();
    const events: ChatEvent[] = [];
    const statuses: string[] = [];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(streamOf([`event: chat\ndata: {"type":"hello","userId":"u","presence":{}}\n\n`, `event: other\ndata: {}\n\nevent: chat\ndata: not-json\n\n`]))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(streamOf([], true));
    const s = new ChatStream({
      url: () => "http://x/stream",
      token: () => "tok",
      fetch,
      onEvent: (e) => events.push(e),
      onStatus: (st) => statuses.push(st),
      backoff: new Backoff({ baseMs: 1000, maxMs: 8000, random: () => 1 }),
    });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([{ type: "hello", userId: "u", presence: {} }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 1s
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000); // الفشل التاني: 2s
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(statuses).toEqual(["connecting", "open", "connecting"]);
    s.stop();
    expect(s.state).toBe("closed");
  });

  it("reports 401, aborts a silent connection, and stops cleanly", async () => {
    vi.useFakeTimers();
    const unauthorized = vi.fn();
    let aborted = 0;
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, body: null }).mockImplementation((_url: string, init: { signal: AbortSignal }) => {
      init.signal.addEventListener("abort", () => aborted++);
      return Promise.resolve(streamOf([], true));
    });
    const s = new ChatStream({ url: () => "u", token: () => "t", fetch, onEvent: () => {}, onUnauthorized: unauthorized, idleTimeoutMs: 5000, backoff: new Backoff({ baseMs: 100, random: () => 1 }) });
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(aborted).toBe(1);
    s.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("waits without a token instead of calling the server", async () => {
    vi.useFakeTimers();
    let token: string | null = null;
    const fetch = vi.fn().mockResolvedValue(streamOf([], true));
    const s = new ChatStream({ url: () => "u", token: () => token, fetch, onEvent: () => {}, backoff: new Backoff({ baseMs: 100, random: () => 1 }) });
    s.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled();
    token = "t";
    s.reconnectNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    s.stop();
  });
});

import { withinEditWindow } from "./chat-state";
describe("edit window", () => {
  const t0 = Date.parse("2026-11-07T10:00:00Z");
  it("allows edits inside the window and hides them after", () => {
    expect(withinEditWindow("2026-11-07T10:00:00Z", t0 + 14 * 60_000, 15)).toBe(true);
    expect(withinEditWindow("2026-11-07T10:00:00Z", t0 + 15 * 60_000, 15)).toBe(false);
  });
  it("keeps the buttons when the server did not say (old server)", () => {
    expect(withinEditWindow("2026-11-07T10:00:00Z", t0 + 99 * 60_000, null)).toBe(true);
  });
});
