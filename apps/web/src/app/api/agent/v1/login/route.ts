import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashToken, newToken, verifyPassword } from "@/lib/auth/crypto";
import { jsonError } from "@/lib/agent/auth";
import { loginSchema } from "@/lib/agent/protocol";
import { buildState } from "@/lib/agent/service";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اكتب البريد الإلكتروني وكلمة المرور", 400);
  const { email, password, deviceName, os, appVersion } = parsed.data;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `agent|${email}|${ip}`;
  if (isRateLimited(key)) return jsonError("محاولات كتير غلط. استنى 15 دقيقة وحاول تاني.", 429);

  const user = await db.user.findUnique({ where: { email } });
  const ok = user?.passwordHash && user.active ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    recordFailure(key);
    return jsonError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401);
  }
  if (user.role !== "EMPLOYEE") return jsonError("البرنامج للموظفين بس. المدير يستخدم الموقع.", 403);
  const profile = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { workMode: true } });
  if (profile?.workMode === "TASKS") return jsonError("حسابك بنظام التاسكات — مش محتاج البرنامج. تابع تاسكاتك من الموقع.", 403);
  clearFailures(key);

  const token = newToken();
  const device = await db.device.create({
    data: { userId: user.id, name: deviceName, os, appVersion, tokenHash: hashToken(token), lastSeenAt: new Date() },
  });
  await audit(user.id, "agent.device_registered", { type: "device", id: device.id }, { name: deviceName, os });
  return Response.json({ token, state: await buildState(user.id) });
}
