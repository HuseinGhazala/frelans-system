import "server-only";
import { db } from "@/lib/db";
import type { TokenType } from "@/generated/prisma/enums";
import { hashToken, newToken } from "./crypto";

const TTL_HOURS: Record<TokenType, number> = { INVITE: 7 * 24, PASSWORD_RESET: 2 };

/** بيعمل رابط دعوة أو استعادة كلمة مرور جديد، وبيلغي أي رابط قديم من نفس النوع */
export async function issueAuthToken(userId: string, type: TokenType): Promise<string> {
  const token = newToken();
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    db.authToken.create({
      data: { tokenHash: hashToken(token), type, userId, expiresAt: new Date(Date.now() + TTL_HOURS[type] * 3_600_000) },
    }),
  ]);
  return token;
}

export async function findValidToken(token: string) {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) return null;
  return row;
}

export function tokenUrl(token: string, type: TokenType): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/${type === "INVITE" ? "invite" : "reset"}/${token}`;
}
