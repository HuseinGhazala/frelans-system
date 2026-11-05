import { mentionToken, MENTION_RE } from "./chat-types";

/** أجزاء نص الرسالة للعرض: نص عادي، منشن، رابط */
export type Segment = { type: "text"; text: string } | { type: "mention"; name: string; userId: string } | { type: "link"; url: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;

function linkify(text: string, out: Segment[]) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // علامات الترقيم في آخر الرابط مش منه
    const trail = /[.,!?؟،؛:)\]}'"]+$/.exec(url);
    if (trail) url = url.slice(0, -trail[0].length);
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", text: text.slice(last, start) });
    out.push({ type: "link", url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
}

export function segments(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(new RegExp(MENTION_RE.source, "g"))) {
    const start = m.index ?? 0;
    if (start > last) linkify(body.slice(last, start), out);
    out.push({ type: "mention", name: m[1], userId: m[2] });
    last = start + m[0].length;
  }
  if (last < body.length) linkify(body.slice(last), out);
  return out;
}

export type MentionPick = { id: string; name: string };

/**
 * الموظف بيكتب "@الاسم" في خانة الكتابة، والمنشنات اللي اختارها من القايمة محفوظة جنب.
 * قبل الإرسال بنحوّل "@الاسم" لصيغة السيرفر @[الاسم](id). الأسماء الأطول الأول (عشان "أحمد علي" قبل "أحمد").
 */
export function encodeMentions(text: string, picks: MentionPick[]): string {
  const uniq = [...new Map(picks.map((p) => [p.id, p])).values()].sort((a, b) => b.name.length - a.name.length);
  if (uniq.length === 0) return text;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(${uniq.map((p) => escape(p.name)).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  return text.replace(re, (whole, name: string) => {
    const p = uniq.find((x) => x.name === name);
    return p ? mentionToken(p.name, p.id) : whole;
  });
}

/** العكس — للتعديل: نص الرسالة بصيغة السيرفر → اللي يتعرض في خانة الكتابة + المنشنات */
export function decodeMentions(body: string): { text: string; picks: MentionPick[] } {
  const picks: MentionPick[] = [];
  const text = body.replace(new RegExp(MENTION_RE.source, "g"), (_, name: string, id: string) => {
    picks.push({ id, name });
    return `@${name}`;
  });
  return { text, picks };
}

/** لو المؤشر بعد "@كلمة" بيرجع الكلمة وبدايتها (عشان نعرض قايمة الأعضاء)، وإلا null */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]{0,30})$/u.exec(before);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
