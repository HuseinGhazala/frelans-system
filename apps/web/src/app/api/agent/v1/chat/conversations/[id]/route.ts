import { z } from "zod";
import { getConversation, renameGroup } from "@/lib/chat/service";
import { chatRoute, readBody } from "../../_lib/handler";

type Ctx = RouteContext<"/api/agent/v1/chat/conversations/[id]">;

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => ({ conversation: await getConversation(viewer, id) }));
}

const renameSchema = z.object({ name: z.string().max(200) });

/** تغيير اسم الجروب */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const { name } = await readBody(request, renameSchema);
    await renameGroup(viewer, id, name);
    return { conversation: await getConversation(viewer, id) };
  });
}
