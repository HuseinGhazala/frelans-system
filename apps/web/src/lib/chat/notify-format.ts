/**
 * الأجزاء الصافية من الإشعارات (من غير قاعدة بيانات ولا سيرفر) — عشان تتختبر لوحدها.
 * client-safe.
 */
import { chatUrlFor } from "./links";
import { plainText } from "./mentions";
import { messagePreview, type AttachmentKind, type ConversationType } from "./types";

export const PUSH_BODY_MAX = 120;
export const GENERAL_TITLE = "القناة العامة";

export type PushPayload = {
  title: string;
  body: string;
  /** رابط المحادثة (نسبي) */
  url: string;
  /** المحادثة — الإشعارات الجديدة بتحل محل القديمة لنفس المحادثة */
  tag: string;
  conversationId: string;
};

export function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : s;
}

/** معاينة الرسالة للإشعار/الإيميل: المنشن يتحول لـ @الاسم والمرفقات لوصف قصير */
export function previewOf(m: { body: string; attachments?: { kind: AttachmentKind }[] }, max = PUSH_BODY_MAX): string {
  const text = plainText(m.body).trim().replace(/\s+/g, " ");
  if (text) return truncate(text, max);
  // من غير نص: نفس وصف المرفقات اللي في قائمة المحادثات
  return messagePreview({ body: "", deletedAt: null, attachments: m.attachments ?? [] }) || "رسالة جديدة";
}

/** عنوان الإشعار: اسم اللي بعت، أو "اللي بعت • اسم الجروب" */
export function notificationTitle(senderName: string, type: ConversationType, groupName: string | null): string {
  if (type === "DIRECT") return senderName;
  const name = type === "GENERAL" ? GENERAL_TITLE : groupName || "جروب";
  return `${senderName} • ${name}`;
}

export function buildPushPayload(input: {
  conversationId: string;
  conversationType: ConversationType;
  groupName: string | null;
  senderName: string;
  message: { body: string; attachments?: { kind: AttachmentKind }[] };
  recipientRole: "ADMIN" | "EMPLOYEE";
  mentioned: boolean;
}): PushPayload {
  const prefix = input.mentioned ? "منشن: " : "";
  return {
    title: notificationTitle(input.senderName, input.conversationType, input.groupName),
    body: prefix + previewOf(input.message, PUSH_BODY_MAX - prefix.length),
    url: chatUrlFor(input.recipientRole, input.conversationId),
    tag: input.conversationId,
    conversationId: input.conversationId,
  };
}

/**
 * مين ياخد Web Push: أعضاء المحادثة (مش اللي بعت) اللي مش فاتحين الشات دلوقتي.
 * القناة العامة: المنشن بس (عشان الإزعاج). الخاص والجروبات: دايمًا.
 */
export function selectPushRecipients(
  notice: { conversationType: ConversationType; recipientIds: string[]; mentionIds: string[]; senderId: string },
  isConnected: (userId: string) => boolean,
): string[] {
  const mentioned = new Set(notice.mentionIds);
  return [...new Set(notice.recipientIds)].filter(
    (id) => id !== notice.senderId && !isConnected(id) && (notice.conversationType !== "GENERAL" || mentioned.has(id)),
  );
}

// ───────────── إيميل الرسايل اللي ماتقرتش ─────────────

/** صف لكل (عضو × محادثة) فيها رسايل ماتقرتش ومااتبعتش عنها إيميل قبل كده */
export type UnreadRow = {
  userId: string;
  email: string;
  userName: string;
  role: "ADMIN" | "EMPLOYEE";
  conversationId: string;
  conversationType: ConversationType;
  conversationName: string | null;
  /** عدد الرسايل الجديدة (بعد آخر قراءة وآخر إيميل) */
  count: number;
  oldestAt: Date;
  lastBody: string;
  lastSenderName: string;
  /** أحدث lastEmailedAt للمستخدم ده في كل محادثاته */
  userLastEmailedAt: Date | null;
};

export type DigestItem = {
  conversationId: string;
  title: string;
  count: number;
  preview: string;
  lastSenderName: string;
  url: string;
};

export type Digest = { userId: string; email: string; userName: string; role: "ADMIN" | "EMPLOYEE"; items: DigestItem[]; total: number };

export function digestItemTitle(row: Pick<UnreadRow, "conversationType" | "conversationName" | "lastSenderName">): string {
  if (row.conversationType === "GENERAL") return GENERAL_TITLE;
  if (row.conversationType === "DIRECT") return row.lastSenderName;
  return row.conversationName || "جروب";
}

/**
 * بيختار مين ياخد إيميل ويجمّع محادثاته في إيميل واحد:
 * - في المحادثة رسالة ماتقرتش أقدم من afterMin (المحادثات الأحدث من كده ما بتدخلش لسه)
 * - آخر إيميل للمستخدم (في أي محادثة) أقدم من everyMin
 * - المستخدم مش فاتح الشات
 */
export function selectDigests(
  rows: UnreadRow[],
  opts: { now: Date; afterMin: number; everyMin: number; isConnected: (userId: string) => boolean },
): Digest[] {
  const oldEnough = opts.now.getTime() - opts.afterMin * 60_000;
  const throttle = opts.now.getTime() - opts.everyMin * 60_000;
  const byUser = new Map<string, Digest>();
  for (const r of rows) {
    if (r.count <= 0 || r.oldestAt.getTime() > oldEnough) continue;
    if (r.userLastEmailedAt && r.userLastEmailedAt.getTime() > throttle) continue;
    if (opts.isConnected(r.userId)) continue;
    let d = byUser.get(r.userId);
    if (!d) byUser.set(r.userId, (d = { userId: r.userId, email: r.email, userName: r.userName, role: r.role, items: [], total: 0 }));
    d.items.push({
      conversationId: r.conversationId,
      title: digestItemTitle(r),
      count: r.count,
      preview: previewOf({ body: r.lastBody }, 140),
      lastSenderName: r.lastSenderName,
      url: chatUrlFor(r.role, r.conversationId),
    });
    d.total += r.count;
  }
  for (const d of byUser.values()) d.items.sort((a, b) => b.count - a.count);
  return [...byUser.values()];
}
