import { z } from "zod";
import { deleteMessage, editMessage } from "@/lib/chat/service";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/types";
import { chatRoute, readBody } from "../../_lib/handler";

type Ctx = RouteContext<"/api/agent/v1/chat/messages/[id]">;

const editSchema = z.object({ body: z.string().max(MAX_MESSAGE_LENGTH + 500) });

/** تعديل رسالتك (السيرفس بيتأكد من مدة التعديل) */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const { body } = await readBody(request, editSchema);
    return { message: await editMessage(viewer, id, body) };
  });
}

/** حذف رسالتك (خلال مدة التعديل) */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    await deleteMessage(viewer, id);
    return { ok: true };
  });
}
