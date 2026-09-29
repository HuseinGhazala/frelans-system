import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type: string; id: string },
  details?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorId, action, targetType: target?.type, targetId: target?.id, details },
  });
}
