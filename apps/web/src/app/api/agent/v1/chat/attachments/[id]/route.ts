import { attachmentResponse } from "@/lib/chat/attachments";
import { canViewAttachment, ChatError } from "@/lib/chat/service";
import { chatRoute } from "../../_lib/handler";

/** الملف نفسه (أو redirect لرابط موقّع). ?download=1 يخليه تحميل */
export async function GET(request: Request, ctx: RouteContext<"/api/agent/v1/chat/attachments/[id]">) {
  const { id } = await ctx.params;
  return chatRoute(request, async (viewer) => {
    const attachment = await canViewAttachment(viewer, id);
    if (!attachment) throw new ChatError("الملف مش موجود", 404);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return attachmentResponse(attachment, { download });
  });
}
