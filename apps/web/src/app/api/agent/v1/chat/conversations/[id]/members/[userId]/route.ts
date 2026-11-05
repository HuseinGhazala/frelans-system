import { removeMember } from "@/lib/chat/service";
import { chatRoute } from "../../../../_lib/handler";

/** شيل عضو من الجروب (صاحب الجروب)، أو خروج الموظف نفسه لو userId = هو */
export async function DELETE(request: Request, ctx: RouteContext<"/api/agent/v1/chat/conversations/[id]/members/[userId]">) {
  const { id, userId } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    await removeMember(viewer, id, userId);
    return { ok: true };
  });
}
