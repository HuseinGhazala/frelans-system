import { authenticateDevice, UNAUTHORIZED } from "@/lib/agent/auth";
import { chatEventStream } from "@/lib/chat/sse";

/** أحداث الشات اللحظية للبرنامج (SSE: event: chat). ملحوظة للنشر: nginx لازم proxy_buffering off */
export async function GET(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  return chatEventStream(request, device.user.id);
}
