import "server-only";
import { db } from "@/lib/db";
import { isConnected } from "./hub";
import { buildPushPayload, selectPushRecipients } from "./notify-format";
import { isPushEnabled, sendPushToUser } from "./push";
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
 * Web Push لأعضاء المحادثة اللي مش فاتحين الشات (الموقع أو البرنامج — اللي فاتحين بيوصلهم الحدث على SSE،
 * وبرنامج الديسكتوب بيعرض إشعار ويندوز منه). القناة العامة: المنشن بس.
 * الأدمن مش بياخد إشعار عن محادثات هو مش عضو فيها (recipientIds = الأعضاء بس).
 * إيميل الرسايل اللي ماتقرتش مش هنا: مهمة دورية في ./email.ts
 */
export async function onMessageCreated(notice: NewMessageNotice): Promise<void> {
  if (!isPushEnabled()) return;
  const targets = selectPushRecipients(
    { conversationType: notice.conversationType, recipientIds: notice.recipientIds, mentionIds: notice.mentionIds, senderId: notice.sender.id },
    isConnected,
  );
  if (!targets.length) return;
  const users = await db.user.findMany({
    where: { id: { in: targets }, active: true, pushSubscriptions: { some: {} } },
    select: { id: true, role: true },
  });
  const mentioned = new Set(notice.mentionIds);
  await Promise.all(
    users.map((u) =>
      sendPushToUser(
        u.id,
        buildPushPayload({
          conversationId: notice.conversationId,
          conversationType: notice.conversationType,
          groupName: notice.title,
          senderName: notice.sender.name,
          message: notice.message,
          recipientRole: u.role,
          mentioned: mentioned.has(u.id),
        }),
      ).catch((err) => console.error("chat push failed", err)),
    ),
  );
}
