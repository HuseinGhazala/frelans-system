import { z } from "zod";
import { addMembers, getConversation } from "@/lib/chat/service";
import { chatRoute, idListSchema, readBody } from "../../../_lib/handler";

const schema = z.object({ userIds: idListSchema.min(1) });

/** إضافة أعضاء للجروب */
export async function POST(request: Request, ctx: RouteContext<"/api/agent/v1/chat/conversations/[id]/members">) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const { userIds } = await readBody(request, schema);
    await addMembers(viewer, id, userIds);
    return { conversation: await getConversation(viewer, id) };
  });
}
