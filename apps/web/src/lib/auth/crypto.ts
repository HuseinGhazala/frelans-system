import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** بنخزن hash للتوكن بس، عشان لو قاعدة البيانات اتسربت التوكنات ما تبقاش صالحة */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
