import { authenticateDevice, UNAUTHORIZED } from "@/lib/agent/auth";
import { buildState } from "@/lib/agent/service";

export async function GET(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  return Response.json(await buildState(device.userId));
}
