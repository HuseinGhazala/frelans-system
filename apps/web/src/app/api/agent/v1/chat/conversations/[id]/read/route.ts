import { markRead } from "@/lib/chat/service";
import { chatRoute } from "../../../_lib/handler";

/** قرا المحادثة لحد دلوقتي */
export async function POST(request: Request, ctx: RouteContext<"/api/agent/v1/chat/conversations/[id]/read">) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    await markRead(viewer, id);
    return { ok: true };
  });
}
