import "server-only";
import type { Viewer } from "./service";
import type { ChatMessage, ConversationType } from "./types";

export type NewMessageNotice = {
  message: ChatMessage;
  conversationId: string;
  conversationType: ConversationType;
  /** اسم الجروب (null للخاص والعامة) */
  title: string | null;
  sender: Viewer;
  /** كل الأعضاء ما عدا اللي بعت */
  recipientIds: string[];
  /** اللي اتعملهم منشن (أعضاء فقط) */
  mentionIds: string[];
};

/**
 * بيتنادى بعد كل رسالة جديدة (من غير await — ما يأخرش الإرسال).
 * [المرحلة 4 — الإشعارات] هنا Web Push للي مش فاتحين الشات.
 * إيميل الرسايل اللي ماتقرتش مش هنا: مهمة دورية في ./email.ts
 */
export async function onMessageCreated(_notice: NewMessageNotice): Promise<void> {}
