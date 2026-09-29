import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authenticateDevice, UNAUTHORIZED } from "@/lib/agent/auth";
import { buildState } from "@/lib/agent/service";

/** الموظف وافق على شاشة شرح المراقبة */
export async function POST(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  if (!device.user.monitoringConsentAt) {
    await db.user.update({ where: { id: device.userId }, data: { monitoringConsentAt: new Date() } });
    await audit(device.userId, "agent.monitoring_consent", { type: "device", id: device.id });
  }
  return Response.json(await buildState(device.userId));
}
