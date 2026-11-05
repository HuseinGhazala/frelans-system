/**
 * نسخة من apps/web/src/lib/chat/types.ts و mentions.ts (البرنامج مش بيستورد من الموقع).
 * لو العقد اتغير هناك، غيّره هنا كمان.
 */

export type ConversationType = "DIRECT" | "GROUP" | "GENERAL";
export type AttachmentKind = "IMAGE" | "FILE" | "VOICE";
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
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: ChatReplyPreview | null;
  attachments: ChatAttachment[];
  mentionIds: string[];
};

export type ConversationMemberInfo = ChatUser & {
  memberRole: "OWNER" | "MEMBER";
  lastReadAt: string | null;
};

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  title: string;
  members: ConversationMemberInfo[];
  lastMessage: { id: string; senderId: string; preview: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
  isMember: boolean;
  myRole: "OWNER" | "MEMBER" | null;
};

export type ChatEvent =
  | { type: "message.created"; message: ChatMessage }
  | { type: "message.updated"; message: ChatMessage }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  | { type: "conversation.updated"; conversation: ConversationSummary }
  | { type: "conversation.removed"; conversationId: string }
  | { type: "read"; conversationId: string; userId: string; lastReadAt: string }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "presence"; userId: string; status: PresenceStatus }
  | { type: "hello"; userId: string; presence: Record<string, PresenceStatus> };

export type SearchResult = { message: ChatMessage; conversationTitle: string };

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_GROUP_NAME = 80;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([a-z0-9]{10,40})\)/g;

export function plainText(body: string): string {
  return body.replace(MENTION_RE, (_, name: string) => `@${name}`);
}

export function mentionToken(name: string, userId: string): string {
  return `@[${name.replace(/[\]\n]/g, "")}](${userId})`;
}

export function messagePreview(m: { body: string; deletedAt: string | null; attachments: { kind: AttachmentKind }[] }): string {
  if (m.deletedAt) return "الرسالة اتمسحت";
  const text = plainText(m.body).trim().replace(/\s+/g, " ");
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const first = m.attachments[0];
  if (!first) return "";
  if (first.kind === "VOICE") return "🎤 رسالة صوتية";
  if (first.kind === "IMAGE") return "🖼️ صورة";
  return "📎 ملف";
}

/** شكل أحداث SSE الصالحة — أي حاجة تانية بتتجاهل */
export function isChatEvent(x: unknown): x is ChatEvent {
  if (!x || typeof x !== "object") return false;
  const t = (x as { type?: unknown }).type;
  return (
    t === "message.created" ||
    t === "message.updated" ||
    t === "message.deleted" ||
    t === "conversation.updated" ||
    t === "conversation.removed" ||
    t === "read" ||
    t === "typing" ||
    t === "presence" ||
    t === "hello"
  );
}
