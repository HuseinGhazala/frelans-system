import "server-only";

/**
 * [المرحلة 4] إيميل للرسايل اللي ماتقرتش: لو العضو عنده رسايل أقدم من chat.unreadEmailAfterMin
 * ومش متصل، وآخر إيميل له (ConversationMember.lastEmailedAt) أقدم من chat.unreadEmailEveryMin.
 * بيتنادى من lib/jobs.ts كل دقيقة.
 */
export async function sendUnreadChatEmails(_now: Date): Promise<void> {}
