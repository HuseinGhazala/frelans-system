import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";
import type { PushPayload } from "./notify-format";

/**
 * Web Push (إشعارات المتصفح). المفاتيح من المتغيرات:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@company.com)
 * لو ناقصين الإشعارات بتتقفل بهدوء (الموقع يكمل عادي).
 * توليد المفاتيح: npx web-push generate-vapid-keys
 */

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || process.env.APP_URL?.trim();
  if (!publicKey || !privateKey || !subject) return (configured = false);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error("web push: invalid VAPID settings", err);
    configured = false;
  }
  return configured;
}

export function isPushEnabled(): boolean {
  return configure();
}

/** المفتاح العام للمتصفح (null = الإشعارات مقفولة) */
export function pushPublicKey(): string | null {
  return configure() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
}

// الـ topic لازم يكون base64url ولحد 32 حرف — بيخلّي خدمة الـ push تستبدل الإشعار اللي لسه ماوصلش لنفس المحادثة
const TOPIC_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** يبعت لكل أجهزة/متصفحات المستخدم، ويمسح الاشتراكات اللي انتهت (404/410). بيرجع عدد اللي وصلت */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  if (!subs.length) return 0;
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 12,
          urgency: "high",
          ...(TOPIC_RE.test(payload.tag) ? { topic: payload.tag } : {}),
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("web push failed", status ?? "", (err as Error).message);
      }
    }),
  );
  if (gone.length) await db.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  return sent;
}
