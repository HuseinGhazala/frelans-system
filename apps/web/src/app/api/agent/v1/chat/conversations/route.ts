import { listConversations } from "@/lib/chat/service";
import { chatRoute } from "../_lib/handler";

/** محادثات الموظف (اللي هو عضو فيها)، الأحدث الأول */
export async function GET(request: Request) {
  return chatRoute(request, async (viewer) => ({ conversations: await listConversations(viewer) }));
}
