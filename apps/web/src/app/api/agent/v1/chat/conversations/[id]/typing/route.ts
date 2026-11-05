import { setTyping } from "@/lib/chat/service";
import { chatRoute } from "../../../_lib/handler";

/** "بيكتب دلوقتي" — البرنامج يبعته كل ~3 ثواني وهو بيكتب */
export async function POST(request: Request, ctx: RouteContext<"/api/agent/v1/chat/conversations/[id]/typing">) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    await setTyping(viewer, id);
    return { ok: true };
  });
}
