import { db } from "@/lib/db";
import { authenticateDevice, UNAUTHORIZED } from "@/lib/agent/auth";

export async function POST(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  await db.device.update({ where: { id: device.id }, data: { revokedAt: new Date(), idleSince: null } });
  return Response.json({ ok: true });
}
