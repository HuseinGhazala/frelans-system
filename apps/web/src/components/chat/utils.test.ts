import { describe, expect, it } from "vitest";
import type { ChatMessage, ConversationMemberInfo } from "../../lib/chat/types";
import {
  activeMentionQuery,
  applyMention,
  canEditMessage,
  decodeMentions,
  encodeMentions,
  filterMentionCandidates,
  groupMessages,
  highlightParts,
  linkify,
  parseBody,
  seenBy,
  snippetAround,
} from "./utils";

const TZ = "Africa/Cairo";
const ID_A = "ckaaaaaaaaaaaaaaaaaaaaaa1";
const ID_B = "ckbbbbbbbbbbbbbbbbbbbbbb2";

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    conversationId: "c1",
    senderId: ID_A,
    body: "",
    createdAt: "2026-11-05T10:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    replyTo: null,
    attachments: [],
    mentionIds: [],
    ...over,
  };
}

function member(id: string, name: string, lastReadAt: string | null): ConversationMemberInfo {
  return { id, name, role: "EMPLOYEE", jobTitle: null, active: true, memberRole: "MEMBER", lastReadAt };
}

describe("parseBody", () => {
  it("keeps plain text (with newlines) as one segment", () => {
    expect(parseBody("أهلاً\nإزيك؟")).toEqual([{ type: "text", text: "أهلاً\nإزيك؟" }]);
  });

  it("extracts mentions and links in order", () => {
    const body = `يا @[أحمد علي](${ID_A}) شوف https://example.com/a?b=1.`;
    expect(parseBody(body)).toEqual([
      { type: "text", text: "يا " },
      { type: "mention", name: "أحمد علي", userId: ID_A },
      { type: "text", text: " شوف " },
      { type: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { type: "text", text: "." },
    ]);
  });

  it("treats html as text (no markup)", () => {
    expect(parseBody("<b>hi</b>")).toEqual([{ type: "text", text: "<b>hi</b>" }]);
  });
});

describe("linkify", () => {
  it("only links http(s) and www, never javascript:", () => {
    expect(linkify("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }]);
    expect(linkify("www.rased.app")).toEqual([{ type: "link", text: "www.rased.app", href: "https://www.rased.app" }]);
  });

  it("trims trailing punctuation and unbalanced parens", () => {
    expect(linkify("(https://x.com/a)")).toEqual([
      { type: "text", text: "(" },
      { type: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { type: "text", text: ")" },
    ]);
    expect(linkify("https://en.wikipedia.org/wiki/A_(b)")[0]).toMatchObject({ type: "link", text: "https://en.wikipedia.org/wiki/A_(b)" });
    expect(linkify("شوف https://x.com؟")[1]).toMatchObject({ text: "https://x.com" });
  });

  it("does not link inside a word", () => {
    expect(linkify("abchttps://x.com")).toEqual([{ type: "text", text: "abchttps://x.com" }]);
  });
});

describe("mentions in the composer", () => {
  it("encodes picked names to tokens and decodes back", () => {
    const picked = [
      { id: ID_A, name: "أحمد" },
      { id: ID_B, name: "أحمد علي" },
    ];
    const encoded = encodeMentions("@أحمد علي و @أحمد و @أحمدين", picked);
    expect(encoded).toBe(`@[أحمد علي](${ID_B}) و @[أحمد](${ID_A}) و @أحمدين`);
    expect(decodeMentions(encoded)).toEqual({ text: "@أحمد علي و @أحمد و @أحمدين", mentions: [{ id: ID_B, name: "أحمد علي" }, { id: ID_A, name: "أحمد" }] });
  });

  it("detects an @query before the caret", () => {
    expect(activeMentionQuery("ازيك @مح", 8)).toEqual({ start: 5, query: "مح" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMentionQuery("mail@x", 6)).toBeNull();
    expect(activeMentionQuery("@a\nb", 4)).toBeNull();
  });

  it("applies a picked mention and moves the caret", () => {
    expect(applyMention("يا @مح كده", 3, 6, "محمد")).toEqual({ text: "يا @محمد  كده", caret: 9 });
  });

  it("filters candidates, excludes me, prefers prefix matches", () => {
    const members = [member("me", "سارة", null), member("1", "علي محمد", null), member("2", "محمد", null)];
    expect(filterMentionCandidates(members, "محمد", "me").map((m) => m.id)).toEqual(["2", "1"]);
  });
});

describe("groupMessages", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("inserts day separators in company timezone and groups consecutive messages", () => {
    const rows = groupMessages(
      [
        msg({ id: "a", createdAt: "2026-11-04T21:30:00.000Z" }), // 23:30 Cairo (UTC+2) → امبارح
        msg({ id: "b", createdAt: "2026-11-04T22:10:00.000Z" }), // 00:10 Cairo → النهارده
        msg({ id: "c", createdAt: "2026-11-04T22:12:00.000Z" }),
        msg({ id: "d", createdAt: "2026-11-04T22:13:00.000Z", senderId: ID_B }),
        msg({ id: "e", createdAt: "2026-11-04T22:40:00.000Z", senderId: ID_B }),
      ],
      TZ,
      now,
    );
    expect(rows.map((r) => (r.kind === "day" ? r.label : `${r.message.id}:${r.showHeader}`))).toEqual([
      "امبارح",
      "a:true",
      "النهارده",
      "b:true",
      "c:false",
      "d:true",
      "e:true",
    ]);
  });
});

describe("read receipts and permissions", () => {
  it("seenBy counts members (not the sender) who read after the message", () => {
    const m = msg({ senderId: ID_A, createdAt: "2026-11-05T10:00:00.000Z" });
    const members = [member(ID_A, "أ", "2026-11-05T11:00:00.000Z"), member(ID_B, "ب", "2026-11-05T10:00:00.000Z"), member("x", "ج", "2026-11-05T09:00:00.000Z"), member("y", "د", null)];
    expect(seenBy(m, members).map((x) => x.id)).toEqual([ID_B]);
  });

  it("allows editing own messages inside the window only", () => {
    const m = msg({ senderId: ID_A, createdAt: "2026-11-05T10:00:00.000Z" });
    const t = Date.parse("2026-11-05T10:10:00.000Z");
    expect(canEditMessage(m, ID_A, 15, t)).toBe(true);
    expect(canEditMessage(m, ID_A, 5, t)).toBe(false);
    expect(canEditMessage(m, ID_B, 15, t)).toBe(false);
    expect(canEditMessage({ ...m, deletedAt: m.createdAt }, ID_A, 15, t)).toBe(false);
    expect(canEditMessage({ ...m, id: "tmp-1" }, ID_A, 15, t)).toBe(false);
  });
});

describe("search helpers", () => {
  it("highlights case-insensitively and escapes regex chars", () => {
    expect(highlightParts("Hello (world) hello", "hello")).toEqual([
      { text: "Hello", match: true },
      { text: " (world) ", match: false },
      { text: "hello", match: true },
    ]);
    expect(highlightParts("a+b", "+")).toEqual([
      { text: "a", match: false },
      { text: "+", match: true },
      { text: "b", match: false },
    ]);
  });

  it("cuts a snippet around the match", () => {
    const text = `${"x".repeat(100)}هدف${"y".repeat(100)}`;
    const s = snippetAround(text, "هدف", 10);
    expect(s).toBe(`…${"x".repeat(10)}هدف${"y".repeat(10)}…`);
  });
});
