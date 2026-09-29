import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { hashToken, newToken } from "./crypto";

export const SESSION_COOKIE = "rased_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;
  await db.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt, userAgent } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session;
}

export async function deleteSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** تسجيل خروج من كل الأجهزة (مثلاً بعد تغيير كلمة المرور أو إيقاف الموظف) */
export async function deleteAllSessions(userId: string) {
  await db.authSession.deleteMany({ where: { userId } });
}

/** تسجيل خروج من كل الأجهزة التانية مع الإبقاء على الجلسة الحالية */
export async function deleteOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.authSession.deleteMany({ where: { userId, ...(token && { tokenHash: { not: hashToken(token) } }) } });
}
