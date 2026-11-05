import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatMessage, ConversationSummary } from "../../lib/chat/types";
import { chatReducer, initialChatState, mergeMessages, type ChatState } from "./reducer";

const ME = "me";
const OTHER = "other";

function conv(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    type: "DIRECT",
    title: "علي",
    members: [
      { id: ME, name: "أنا", role: "EMPLOYEE", jobTitle: null, active: true, memberRole: "MEMBER", lastReadAt: null },
      { id: OTHER, name: "علي", role: "EMPLOYEE", jobTitle: null, active: true, memberRole: "MEMBER", lastReadAt: null },
    ],
    lastMessage: null,
    lastMessageAt: "2026-11-05T09:00:00.000Z",
    unread: 0,
    isMember: true,
    myRole: "MEMBER",
    ...over,
  };
}

function msg(id: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    conversationId: "c1",
    senderId: OTHER,
    body: `رسالة ${id}`,
    createdAt: "2026-11-05T10:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    replyTo: null,
    attachments: [],
    mentionIds: [],
    ...over,
  };
}

function loaded(state: ChatState, messages: ChatMessage[], hasMore = false): ChatState {
  return chatReducer(state, { type: "messages.loaded", conversationId: "c1", messages, hasMore, older: false });
}

const ev = (state: ChatState, event: ChatEvent) =>
  chatReducer(state, { type: "event", event, at: Date.parse("2026-11-05T12:00:00.000Z") });

describe("chatReducer", () => {
  it("adds incoming messages once (dedupe) and counts unread", () => {
    let s = loaded(initialChatState(ME, [conv()]), []);
    s = ev(s, { type: "message.created", message: msg("a") });
    s = ev(s, { type: "message.created", message: msg("a") });
    expect(s.messages.c1!.items.map((m) => m.id)).toEqual(["a"]);
    expect(s.conversations[0].unread).toBe(1);
    expect(s.conversations[0].lastMessage?.preview).toBe("رسالة a");
  });

  it("keeps conversations sorted by last message", () => {
    let s = initialChatState(ME, [conv({ id: "c1", lastMessageAt: "2026-11-05T09:00:00.000Z" }), conv({ id: "c2", lastMessageAt: "2026-11-05T08:00:00.000Z" })]);
    expect(s.conversations.map((c) => c.id)).toEqual(["c1", "c2"]);
    s = ev(s, { type: "message.created", message: msg("x", { conversationId: "c2" }) });
    expect(s.conversations.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("replaces the optimistic message with the confirmed one, even if SSE came first", () => {
    let s = loaded(initialChatState(ME, [conv()]), []);
    s = chatReducer(s, { type: "message.optimistic", message: { ...msg("tmp-1", { senderId: ME }), pending: true } });
    expect(s.messages.c1!.items[0].pending).toBe(true);
    const real = msg("real", { senderId: ME });
    s = ev(s, { type: "message.created", message: real });
    s = chatReducer(s, { type: "message.confirmed", tempId: "tmp-1", message: real });
    expect(s.messages.c1!.items.map((m) => m.id)).toEqual(["real"]);
    expect(s.conversations[0].lastMessage?.id).toBe("real");
    expect(s.conversations[0].unread).toBe(0);
  });

  it("drops a failed optimistic message", () => {
    let s = loaded(initialChatState(ME, [conv()]), []);
    s = chatReducer(s, { type: "message.optimistic", message: { ...msg("tmp-1", { senderId: ME }), pending: true } });
    s = chatReducer(s, { type: "message.failed", tempId: "tmp-1", conversationId: "c1" });
    expect(s.messages.c1!.items).toEqual([]);
  });

  it("merges older pages in order without duplicates", () => {
    const a = msg("a", { createdAt: "2026-11-05T08:00:00.000Z" });
    const b = msg("b", { createdAt: "2026-11-05T09:00:00.000Z" });
    const c = msg("c", { createdAt: "2026-11-05T10:00:00.000Z" });
    let s = loaded(initialChatState(ME, [conv()]), [b, c], true);
    s = chatReducer(s, { type: "messages.loaded", conversationId: "c1", messages: [a, b], hasMore: false, older: true });
    expect(s.messages.c1!.items.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(s.messages.c1!.hasMore).toBe(false);
    expect(mergeMessages([c], [a]).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("blanks deleted messages, their replies, and fixes unread", () => {
    let s = loaded(initialChatState(ME, [conv()]), []);
    s = ev(s, { type: "message.created", message: msg("a") });
    s = ev(s, { type: "message.created", message: msg("b", { createdAt: "2026-11-05T10:01:00.000Z", replyTo: { id: "a", senderId: OTHER, body: "رسالة a", deleted: false, hasAttachments: false } }) });
    expect(s.conversations[0].unread).toBe(2);
    s = ev(s, { type: "message.deleted", conversationId: "c1", messageId: "a" });
    const [a, b] = s.messages.c1!.items;
    expect(a.body).toBe("");
    expect(a.deletedAt).not.toBeNull();
    expect(b.replyTo).toMatchObject({ deleted: true, body: "" });
    expect(s.conversations[0].unread).toBe(1);
  });

  it("updates read receipts and my unread on read events", () => {
    let s = initialChatState(ME, [conv({ unread: 3 })]);
    s = ev(s, { type: "read", conversationId: "c1", userId: OTHER, lastReadAt: "2026-11-05T11:00:00.000Z" });
    expect(s.conversations[0].members.find((m) => m.id === OTHER)?.lastReadAt).toBe("2026-11-05T11:00:00.000Z");
    expect(s.conversations[0].unread).toBe(3);
    // قراءة أقدم ما ترجعش الوقت لورا
    s = ev(s, { type: "read", conversationId: "c1", userId: OTHER, lastReadAt: "2026-11-05T10:00:00.000Z" });
    expect(s.conversations[0].members.find((m) => m.id === OTHER)?.lastReadAt).toBe("2026-11-05T11:00:00.000Z");
    s = ev(s, { type: "read", conversationId: "c1", userId: ME, lastReadAt: "2026-11-05T11:00:00.000Z" });
    expect(s.conversations[0].unread).toBe(0);
  });

  it("tracks typing, clears it on message, and prunes after 5s", () => {
    let s = initialChatState(ME, [conv()]);
    s = chatReducer(s, { type: "event", event: { type: "typing", conversationId: "c1", userId: OTHER, name: "علي" }, at: 1000 });
    expect(Object.keys(s.typing.c1 ?? {})).toEqual([OTHER]);
    expect(chatReducer(s, { type: "typing.prune", now: 3000 })).toBe(s);
    expect(chatReducer(s, { type: "typing.prune", now: 7000 }).typing).toEqual({});
    s = ev(s, { type: "message.created", message: msg("a") });
    expect(s.typing.c1).toEqual({});
  });

  it("applies presence and removal", () => {
    let s = initialChatState(ME, [conv()]);
    s = ev(s, { type: "hello", userId: ME, presence: { [OTHER]: "WORKING" } });
    s = ev(s, { type: "presence", userId: OTHER, status: "ON_BREAK" });
    expect(s.presence[OTHER]).toBe("ON_BREAK");
    s = ev(s, { type: "conversation.removed", conversationId: "c1" });
    expect(s.conversations).toEqual([]);
  });
});
