import { authenticateDevice, UNAUTHORIZED } from "@/lib/agent/auth";
import { cardsForUser } from "@/lib/trello";

/** كروت Trello المسندة للموظف عشان يختار هيشتغل على إيه */
export async function GET(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  return Response.json({ cards: await cardsForUser(device.userId) });
}
