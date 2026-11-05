import { unreadTotal } from "@/lib/chat/service";
import { chatRoute } from "../_lib/handler";

/** إجمالي الرسايل غير المقروءة */
export async function GET(request: Request) {
  return chatRoute(request, async (viewer) => ({ unread: await unreadTotal(viewer.id) }));
}
