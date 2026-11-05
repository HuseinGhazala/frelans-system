/**
 * أنواع الشات المشتركة بين السيرفر والمتصفح وبرنامج الديسكتوب.
 * الملف ده client-safe: مفيش فيه أي import من السيرفر.
 * كل التواريخ ISO strings.
 */

export type ConversationType = "DIRECT" | "GROUP" | "GENERAL";
export type AttachmentKind = "IMAGE" | "FILE" | "VOICE";

/**
 * حالة المستخدم في الشات:
 * WORKING / IDLE / ON_BREAK من الحضور، ONLINE = فاتح الموقع أو البرنامج من غير حضور، OFFLINE = مش موجود
 */
export type PresenceStatus = "WORKING" | "IDLE" | "ON_BREAK" | "ONLINE" | "OFFLINE";

export type ChatUser = {
  id: string;
  name: string;
  role: "ADMIN" | "EMPLOYEE";
  jobTitle: string | null;
  active: boolean;
};

export type ChatAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** الملف اتمسح بعد مدة الحفظ */
  expired: boolean;
};

export type ChatReplyPreview = {
  id: string;
  senderId: string;
  body: string;
  deleted: boolean;
  hasAttachments: boolean;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  /** لو الرسالة اتمسحت: فاضي للموظفين، والأصل للأدمن */
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: ChatReplyPreview | null;
  attachments: ChatAttachment[];
  mentionIds: string[];
  /** للأدمن بس: النسخ القديمة قبل التعديل */
  edits?: { body: string; createdAt: string }[];
};

export type ConversationMemberInfo = ChatUser & {
  memberRole: "OWNER" | "MEMBER";
  lastReadAt: string | null;
};

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  /** اسم الجروب، أو اسم الطرف التاني في الخاص، أو "القناة العامة" */
  title: string;
  members: ConversationMemberInfo[];
  lastMessage: { id: string; senderId: string; preview: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
  /** المستخدم الحالي عضو فيها (الأدمن ممكن يشوف محادثات مش عضو فيها من صفحة المراقبة) */
  isMember: boolean;
  myRole: "OWNER" | "MEMBER" | null;
};

/** الأحداث اللي بتوصل لحظيًا عن طريق SSE (event: chat, data: JSON) */
export type ChatEvent =
  | { type: "message.created"; message: ChatMessage }
  | { type: "message.updated"; message: ChatMessage }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  /** محادثة اتعملت أو اتغير اسمها أو أعضاءها — العميل يحدّث القائمة */
  | { type: "conversation.updated"; conversation: ConversationSummary }
  /** المستخدم اتشال من محادثة */
  | { type: "conversation.removed"; conversationId: string }
  | { type: "read"; conversationId: string; userId: string; lastReadAt: string }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "presence"; userId: string; status: PresenceStatus }
  /** أول حدث بعد الاتصال */
  | { type: "hello"; userId: string; presence: Record<string, PresenceStatus> };

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_GROUP_NAME = 80;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/** نص قصير للرسالة في قائمة المحادثات والإشعارات */
export function messagePreview(m: { body: string; deletedAt: string | null; attachments: { kind: AttachmentKind }[] }): string {
  if (m.deletedAt) return "الرسالة اتمسحت";
  const text = m.body.trim().replace(/\s+/g, " ");
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const first = m.attachments[0];
  if (!first) return "";
  if (first.kind === "VOICE") return "🎤 رسالة صوتية";
  if (first.kind === "IMAGE") return "🖼️ صورة";
  return "📎 ملف";
}
