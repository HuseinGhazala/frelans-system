import "server-only";
import { db } from "@/lib/db";
import { broadcast, isConnected, setPresenceHandler } from "./hub";
import type { PresenceStatus } from "./types";

/** حالة المستخدمين: من الحضور الأول، وبعدين هل هو فاتح الموقع/البرنامج */
export async function presenceFor(userIds?: string[]): Promise<Record<string, PresenceStatus>> {
  const users = await db.user.findMany({
    where: { active: true, ...(userIds ? { id: { in: userIds } } : {}) },
    select: {
      id: true,
      workSessions: {
        where: { endedAt: null },
        take: 1,
        orderBy: { startedAt: "desc" },
        select: { source: true, breaks: { where: { endedAt: null }, select: { id: true } }, device: { select: { idleSince: true } } },
      },
    },
  });
  const out: Record<string, PresenceStatus> = {};
  for (const u of users) {
    const open = u.workSessions[0];
    if (open) {
      if (open.breaks.length > 0) out[u.id] = "ON_BREAK";
      else if (open.source === "AGENT" && open.device?.idleSince) out[u.id] = "IDLE";
      else out[u.id] = "WORKING";
    } else {
      out[u.id] = isConnected(u.id) ? "ONLINE" : "OFFLINE";
    }
  }
  return out;
}

/** يبعت لكل المتصلين الحالة الجديدة للمستخدم — يتنادى بعد الحضور/الانصراف/الاستراحة أو الاتصال */
export async function announcePresence(userId: string) {
  const status = (await presenceFor([userId]))[userId] ?? "OFFLINE";
  broadcast({ type: "presence", userId, status });
}

setPresenceHandler((userId) => {
  void announcePresence(userId).catch((err) => console.error("announcePresence failed", err));
});
