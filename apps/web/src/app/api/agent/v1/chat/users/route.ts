import { listChatUsers } from "@/lib/chat/service";
import { chatRoute } from "../_lib/handler";

/** المستخدمين اللي ينفع تكلمهم */
export async function GET(request: Request) {
  return chatRoute(request, async (viewer) => ({ users: await listChatUsers(viewer) }));
}
