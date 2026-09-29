import { db } from "@/lib/db";
import { authenticateDevice, jsonError, UNAUTHORIZED } from "@/lib/agent/auth";
import { syncSchema } from "@/lib/agent/protocol";
import { applyEvents, buildState, resumeLostSession, saveMinutes } from "@/lib/agent/service";

/** مزامنة: الأحداث بالترتيب + ملخص الدقائق + حالة الخمول الحالية، والرد بالحالة الجديدة */
export async function POST(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  if (!device.user.monitoringConsentAt) return jsonError("لازم توافق على شروط المراقبة الأول", 403);

  const parsed = syncSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("بيانات غير صالحة", 400);
  const { events, minutes, idleSince } = parsed.data;

  await resumeLostSession(device.userId, device.id, minutes);
  await applyEvents(device.userId, device.id, events);
  await saveMinutes(device.userId, minutes);
  await db.device.update({ where: { id: device.id }, data: { idleSince: idleSince ?? null } });

  return Response.json(await buildState(device.userId));
}
