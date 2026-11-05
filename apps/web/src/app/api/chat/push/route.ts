import * as z from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { pushPublicKey } from "@/lib/chat/push";
import { db } from "@/lib/db";

/**
 * اشتراكات إشعارات المتصفح (Web Push):
 *   GET    → { publicKey } (null لو مفاتيح VAPID مش متظبطة)
 *   POST   → حفظ اشتراك المتصفح ده للمستخدم الحالي (PushSubscription.toJSON())
 *   DELETE → { endpoint } إلغاء الاشتراك
 */

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ publicKey: pushPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushPublicKey()) return Response.json({ error: "الإشعارات مش متظبطة على السيرفر" }, { status: 503 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "اشتراك غير صحيح" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  // نفس المتصفح ممكن يتسجل بحساب تاني — الاشتراك بيتنقل لآخر مستخدم
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "endpoint مطلوب" }, { status: 400 });
  await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });
  return Response.json({ ok: true });
}
