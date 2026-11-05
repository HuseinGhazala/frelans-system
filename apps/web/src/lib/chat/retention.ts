import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { deleteObject } from "@/lib/storage";

const BATCH = 200;
/** المرفقات اللي اترفعت وما اتبعتتش بتتمسح بعد المدة دي */
const UNSENT_TTL_MS = 24 * 3_600_000;

/**
 * [المرحلة 2] بيمسح ملفات الشات الأقدم من chat.fileRetentionDays من التخزين، ويحط expiredAt (الرسالة بتفضل).
 * وبيمسح كمان المرفقات اللي اترفعت وما اتبعتتش (messageId = null) بعد 24 ساعة.
 * بيتنادى من lib/jobs.ts.
 */
export async function deleteExpiredChatAttachments(now: Date): Promise<{ expired: number; unsent: number }> {
  const { chat } = await getSettings();
  const cutoff = new Date(now.getTime() - chat.fileRetentionDays * 86_400_000);
  const unsentCutoff = new Date(now.getTime() - UNSENT_TTL_MS);

  // 1) مرفقات مبعوتة وعدّت مدة الحفظ: الملف يتمسح والصف يفضل بـ expiredAt
  let expired = 0;
  for (;;) {
    const batch = await db.attachment.findMany({
      where: { messageId: { not: null }, expiredAt: null, createdAt: { lt: cutoff } },
      take: BATCH,
      select: { id: true, storageKey: true },
    });
    if (!batch.length) break;
    for (const a of batch) await deleteObject(a.storageKey).catch(() => undefined);
    await db.attachment.updateMany({ where: { id: { in: batch.map((a) => a.id) } }, data: { expiredAt: now } });
    expired += batch.length;
  }

  // 2) مرفقات اترفعت وما اتبعتتش: الملف والصف يتمسحوا
  let unsent = 0;
  for (;;) {
    const batch = await db.attachment.findMany({
      where: { messageId: null, createdAt: { lt: unsentCutoff } },
      take: BATCH,
      select: { id: true, storageKey: true },
    });
    if (!batch.length) break;
    for (const a of batch) {
      // الصف الأول (بشرط messageId: null) عشان لو اتبعت في نفس اللحظة ملفه ما يتمسحش
      const res = await db.attachment.deleteMany({ where: { id: a.id, messageId: null } });
      if (!res.count) continue;
      await deleteObject(a.storageKey).catch(() => undefined);
      unsent++;
    }
  }

  return { expired, unsent };
}
