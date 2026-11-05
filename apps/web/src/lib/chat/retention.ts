import "server-only";

/**
 * [المرحلة 2] بيمسح ملفات الشات الأقدم من chat.fileRetentionDays من التخزين، ويحط expiredAt (الرسالة بتفضل).
 * وبيمسح كمان المرفقات اللي اترفعت وما اتبعتتش (messageId = null) بعد 24 ساعة.
 * بيتنادى من lib/jobs.ts.
 */
export async function deleteExpiredChatAttachments(_now: Date): Promise<void> {}
