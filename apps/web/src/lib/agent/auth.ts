import "server-only";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";

/** بيتأكد من توكن الجهاز (Authorization: Bearer ...) وبيحدّث آخر ظهور */
export async function authenticateDevice(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const device = await db.device.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!device || device.revokedAt || !device.user.active || device.user.role !== "EMPLOYEE") return null;
  await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return device;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const UNAUTHORIZED = () => jsonError("الجلسة انتهت، سجل دخول تاني", 401);
