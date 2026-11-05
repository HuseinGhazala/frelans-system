import { searchMessages } from "@/lib/chat/service";
import { chatRoute } from "../_lib/handler";

/** بحث في رسايل محادثات الموظف. ?q= (حرفين على الأقل) و ?conversationId= اختياري */
export async function GET(request: Request) {
  return chatRoute(request, async (viewer) => {
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").slice(0, 200);
    const conversationId = params.get("conversationId")?.slice(0, 64) || undefined;
    return { results: await searchMessages(viewer, q, { conversationId }) };
  });
}
