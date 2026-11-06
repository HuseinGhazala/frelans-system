/**
 * أدوات الشات الصافية (من غير React ولا سيرفر) — عرض النص والمنشن والتجميع بالأيام وعلامات القراءة.
 * عليها تستات في utils.test.ts. الـ imports نسبية عشان vitest.
 */
import { MENTION_RE, mentionToken, plainText } from "../../lib/chat/mentions";
import type { ChatMessage, ConversationMemberInfo, ConversationSummary, PresenceStatus } from "../../lib/chat/types";
import { addDays, calendarDateKey as toDateKey } from "../../lib/time";

// ───────────── عرض نص الرسالة ─────────────

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string }
  | { type: "link"; text: string; href: string };

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[.,!?:;'"،؛؟…»]$/;

/** يقطع علامات الترقيم اللي في آخر اللينك (زي النقطة في آخر الجملة) والقوس اللي مش مقفول جواه */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    if (TRAILING_PUNCT.test(url)) {
      url = url.slice(0, -1);
      continue;
    }
    const last = url[url.length - 1];
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    if (last && pairs[last]) {
      const open = url.split(pairs[last]).length - 1;
      const close = url.split(last).length - 1;
      if (close > open) {
        url = url.slice(0, -1);
        continue;
      }
    }
    return url;
  }
}

function pushText(out: BodySegment[], text: string) {
  if (!text) return;
  const prev = out[out.length - 1];
  if (prev?.type === "text") prev.text += text;
  else out.push({ type: "text", text });
}

/** يحوّل النص للينكات آمنة (http/https بس) ونص عادي */
export function linkify(text: string): BodySegment[] {
  const out: BodySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    // لازم اللينك يبدأ أول الكلمة
    if (start > 0 && /[\p{L}\p{N}_@]/u.test(text[start - 1])) continue;
    const url = trimUrl(m[0]);
    if (url.length < 5 || /^www\.?$/i.test(url)) continue;
    pushText(out, text.slice(last, start));
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    out.push({ type: "link", text: url, href });
    last = start + url.length;
  }
  pushText(out, text.slice(last));
  return out;
}

function appendSegments(out: BodySegment[], segs: BodySegment[]) {
  for (const s of segs) {
    if (s.type === "text") pushText(out, s.text);
    else out.push(s);
  }
}

/** يقسم نص الرسالة لنص + منشن + لينكات. النتيجة بتتعرض بعناصر React عادية (من غير HTML خام) */
export function parseBody(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  let last = 0;
  for (const m of body.matchAll(new RegExp(MENTION_RE.source, "g"))) {
    const start = m.index ?? 0;
    appendSegments(out, linkify(body.slice(last, start)));
    out.push({ type: "mention", name: m[1], userId: m[2] });
    last = start + m[0].length;
  }
  appendSegments(out, linkify(body.slice(last)));
  return out;
}

// ───────────── المنشن في خانة الكتابة ─────────────
// خانة الكتابة بتعرض "@الاسم" بس، ولما نبعت بنحوّلها لـ @[الاسم](id)

export type PickedMention = { id: string; name: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** يحوّل "@الاسم" للصيغة اللي السيرفر بيفهمها، للأسماء اللي اتختارت من القائمة بس */
export function encodeMentions(text: string, mentions: PickedMention[]): string {
  const unique = [...new Map(mentions.map((m) => [m.id, m])).values()].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const m of unique) {
    const re = new RegExp(`@${escapeRe(m.name)}(?![\\p{L}\\p{N}_])`, "gu");
    out = out.replace(re, () => mentionToken(m.name, m.id));
  }
  return out;
}

/** العكس: لما نعدل رسالة، نرجعها "@الاسم" ونحفظ مين اتعمله منشن */
export function decodeMentions(body: string): { text: string; mentions: PickedMention[] } {
  const mentions = new Map<string, PickedMention>();
  for (const m of body.matchAll(new RegExp(MENTION_RE.source, "g"))) mentions.set(m[2], { id: m[2], name: m[1] });
  return { text: plainText(body), mentions: [...mentions.values()] };
}

/** لو المؤشر بعد "@كلام" يرجع مكان الـ @ والكلام اللي بعدها (لقائمة الاقتراحات) */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query) || /^\s/.test(query) || (query.match(/\s/g)?.length ?? 0) > 2) return null;
  return { start: at, query };
}

/** يحط الاسم مكان "@كلام" ويرجع النص الجديد ومكان المؤشر */
export function applyMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const insert = `@${name} `;
  return { text: text.slice(0, start) + insert + text.slice(caret), caret: start + insert.length };
}

/** فلترة أعضاء المحادثة حسب اللي اتكتب بعد @ */
export function filterMentionCandidates<T extends { id: string; name: string }>(members: T[], query: string, myId: string, limit = 6): T[] {
  const q = query.trim().toLowerCase();
  return members
    .filter((m) => m.id !== myId && (!q || m.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, limit);
}

// ───────────── التواريخ ─────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = `${tz}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat("ar-EG", { timeZone: tz, ...opts })));
  return f;
}

export function formatTime(iso: string, tz: string): string {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string, tz: string): string {
  return fmt(tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function dayLabel(dayKey: string, tz: string, now: Date): string {
  const today = toDateKey(now, tz);
  if (dayKey === today) return "النهارده";
  if (dayKey === addDays(today, -1)) return "امبارح";
  const d = new Date(`${dayKey}T12:00:00Z`);
  const sameYear = dayKey.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** الوقت في قائمة المحادثات: الساعة لو النهارده، "امبارح"، وإلا التاريخ */
export function listTime(iso: string, tz: string, now: Date): string {
  const key = toDateKey(new Date(iso), tz);
  const today = toDateKey(now, tz);
  if (key === today) return formatTime(iso, tz);
  if (key === addDays(today, -1)) return "امبارح";
  return fmt(tz, { day: "numeric", month: "numeric" }).format(new Date(iso));
}

// ───────────── تجميع الرسايل ─────────────

export type MessageRow<M extends ChatMessage = ChatMessage> =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; message: M; showHeader: boolean };

const GROUP_GAP_MS = 5 * 60_000;

/** يحط فاصل لكل يوم، ويخبي اسم المرسل لو نفس الشخص بعت ورا بعض في خلال 5 دقايق */
export function groupMessages<M extends ChatMessage>(messages: M[], tz: string, now: Date): MessageRow<M>[] {
  const rows: MessageRow<M>[] = [];
  let lastDay = "";
  let prev: M | null = null;
  for (const m of messages) {
    const day = toDateKey(new Date(m.createdAt), tz);
    if (day !== lastDay) {
      rows.push({ kind: "day", key: day, label: dayLabel(day, tz, now) });
      lastDay = day;
      prev = null;
    }
    const showHeader = !prev || prev.senderId !== m.senderId || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > GROUP_GAP_MS;
    rows.push({ kind: "message", message: m, showHeader });
    prev = m;
  }
  return rows;
}

// ───────────── القراءة والصلاحيات ─────────────

/** الأعضاء اللي قروا الرسالة (آخر قراءة ليهم بعد وقت الرسالة)، من غير المرسل */
export function seenBy(message: Pick<ChatMessage, "senderId" | "createdAt">, members: ConversationMemberInfo[]): ConversationMemberInfo[] {
  const at = Date.parse(message.createdAt);
  return members.filter((m) => m.id !== message.senderId && m.lastReadAt !== null && Date.parse(m.lastReadAt) >= at);
}

export function isTempId(id: string) {
  return id.startsWith("tmp-");
}

/** صاحب الرسالة يعدل/يمسح خلال مدة التعديل */
export function canEditMessage(m: ChatMessage, myId: string, editWindowMin: number, nowMs: number): boolean {
  return m.senderId === myId && !m.deletedAt && !isTempId(m.id) && nowMs - Date.parse(m.createdAt) < editWindowMin * 60_000;
}

export function sortConversations(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

// ───────────── البحث ─────────────

/** يقسم النص لأجزاء عشان نعلّم على الكلمة اللي اتدوّر عليها */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const re = new RegExp(escapeRe(q), "gi");
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), match: false });
    parts.push({ text: m[0], match: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/** جزء من النص حوالين الكلمة اللي اتدوّر عليها */
export function snippetAround(text: string, query: string, radius = 60): string {
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i < 0 || text.length <= radius * 2) return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

// ───────────── الحالة ─────────────

export const PRESENCE_META: Record<PresenceStatus, { label: string; dot: string }> = {
  WORKING: { label: "شغال دلوقتي", dot: "bg-success" },
  IDLE: { label: "خامل", dot: "bg-idle" },
  ON_BREAK: { label: "في استراحة", dot: "bg-warning" },
  ONLINE: { label: "متصل", dot: "bg-info" },
  OFFLINE: { label: "مش متصل", dot: "bg-muted" },
};
