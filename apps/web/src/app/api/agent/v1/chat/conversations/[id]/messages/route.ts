import { z } from "zod";
import { getMessages, sendMessage } from "@/lib/chat/service";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH } from "@/lib/chat/types";
import { chatRoute, idSchema, readBody } from "../../../_lib/handler";

type Ctx = RouteContext<"/api/agent/v1/chat/conversations/[id]/messages">;

/** الرسايل الأقدم الأول. ?before=<messageId> عشان تحمّل اللي قبلها، ?limit= (أقصى 100) */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const params = new URL(request.url).searchParams;
    const before = params.get("before")?.slice(0, 64) || undefined;
    const limit = Number(params.get("limit")) || undefined;
    return getMessages(viewer, id, { before, limit });
  });
}

const sendSchema = z.object({
  // السيرفس بيقص المسافات ويتأكد من الطول الفعلي؛ هنا حد أعلى بس
  body: z.string().max(MAX_MESSAGE_LENGTH + 500).default(""),
  replyToId: idSchema.nullish(),
  attachmentIds: z.array(idSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
});

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const input = await readBody(request, sendSchema);
    return { message: await sendMessage(viewer, { conversationId: id, ...input }) };
  });
}
