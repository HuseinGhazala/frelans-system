import { describe, expect, it } from "vitest";
import { chatUrlFor } from "./links";
import { buildPushPayload, notificationTitle, previewOf, selectDigests, selectPushRecipients, type UnreadRow } from "./notify-format";

const ALI = "cluseraaaaaaaaaaaaaaaaaa1";

describe("chatUrlFor", () => {
  it("routes by role", () => {
    expect(chatUrlFor("EMPLOYEE", "c1")).toBe("/me/chat?c=c1");
    expect(chatUrlFor("ADMIN", "c1")).toBe("/admin/chat?c=c1");
    expect(chatUrlFor("ADMIN")).toBe("/admin/chat");
  });
});

describe("push payload", () => {
  it("titles by conversation type", () => {
    expect(notificationTitle("أحمد", "DIRECT", null)).toBe("أحمد");
    expect(notificationTitle("أحمد", "GROUP", "التسويق")).toBe("أحمد • التسويق");
    expect(notificationTitle("أحمد", "GENERAL", "القناة العامة")).toBe("أحمد • القناة العامة");
  });

  it("renders mentions as plain text and marks mentions", () => {
    const p = buildPushPayload({
      conversationId: "conv1",
      conversationType: "GROUP",
      groupName: "التسويق",
      senderName: "أحمد",
      message: { body: `@[علي](${ALI}) شوف ده` },
      recipientRole: "EMPLOYEE",
      mentioned: true,
    });
    expect(p).toEqual({ title: "أحمد • التسويق", body: "منشن: @علي شوف ده", url: "/me/chat?c=conv1", tag: "conv1", conversationId: "conv1" });
  });

  it("truncates long bodies to 120 chars", () => {
    const p = buildPushPayload({
      conversationId: "c",
      conversationType: "DIRECT",
      groupName: null,
      senderName: "x",
      message: { body: "ا".repeat(500) },
      recipientRole: "ADMIN",
      mentioned: true,
    });
    expect([...p.body].length).toBe(120);
    expect(p.body.endsWith("…")).toBe(true);
    expect(p.url).toBe("/admin/chat?c=c");
  });

  it("describes attachment-only messages", () => {
    expect(previewOf({ body: "", attachments: [{ kind: "VOICE" }] })).toBe("🎤 رسالة صوتية");
    expect(previewOf({ body: "  " })).toBe("رسالة جديدة");
  });
});

describe("selectPushRecipients", () => {
  const offline = () => false;
  it("skips connected users and the sender", () => {
    const ids = selectPushRecipients({ conversationType: "GROUP", recipientIds: ["a", "b", "s"], mentionIds: [], senderId: "s" }, (id) => id === "a");
    expect(ids).toEqual(["b"]);
  });
  it("general channel: mentions only", () => {
    expect(selectPushRecipients({ conversationType: "GENERAL", recipientIds: ["a", "b"], mentionIds: ["b"], senderId: "s" }, offline)).toEqual(["b"]);
  });
  it("direct: always", () => {
    expect(selectPushRecipients({ conversationType: "DIRECT", recipientIds: ["a"], mentionIds: [], senderId: "s" }, offline)).toEqual(["a"]);
  });
});

describe("selectDigests", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const min = (m: number) => new Date(now.getTime() - m * 60_000);
  const row = (o: Partial<UnreadRow>): UnreadRow => ({
    userId: "u1",
    email: "u1@x.com",
    userName: "يوسف",
    role: "EMPLOYEE",
    conversationId: "c1",
    conversationType: "GROUP",
    conversationName: "التسويق",
    count: 2,
    oldestAt: min(45),
    lastBody: "تمام",
    lastSenderName: "أحمد",
    userLastEmailedAt: null,
    ...o,
  });
  const opts = { now, afterMin: 30, everyMin: 60, isConnected: () => false };

  it("groups conversations into one digest per user, biggest first", () => {
    const d = selectDigests(
      [row({}), row({ conversationId: "c2", conversationType: "DIRECT", conversationName: null, count: 5, lastSenderName: "سارة" }), row({ userId: "u2", email: "u2@x.com" })],
      opts,
    );
    expect(d).toHaveLength(2);
    const u1 = d.find((x) => x.userId === "u1")!;
    expect(u1.total).toBe(7);
    expect(u1.items.map((i) => [i.conversationId, i.title, i.url])).toEqual([
      ["c2", "سارة", "/me/chat?c=c2"],
      ["c1", "التسويق", "/me/chat?c=c1"],
    ]);
  });

  it("waits until messages are old enough", () => {
    expect(selectDigests([row({ oldestAt: min(10) })], opts)).toEqual([]);
  });

  it("throttles per user", () => {
    expect(selectDigests([row({ userLastEmailedAt: min(20) })], opts)).toEqual([]);
    expect(selectDigests([row({ userLastEmailedAt: min(90) })], opts)).toHaveLength(1);
  });

  it("skips connected users", () => {
    expect(selectDigests([row({})], { ...opts, isConnected: () => true })).toEqual([]);
  });

  it("uses plain text previews and admin links", () => {
    const [d] = selectDigests([row({ role: "ADMIN", conversationType: "GENERAL", lastBody: `@[يوسف](${ALI}) تعالى` })], opts);
    expect(d.items[0]).toMatchObject({ title: "القناة العامة", preview: "@يوسف تعالى", url: "/admin/chat?c=c1" });
  });
});
