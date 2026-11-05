import { getCurrentUser } from "@/lib/auth/dal";
import { attachmentResponse } from "@/lib/chat/attachments";
import { ChatError, canViewAttachment, type Viewer } from "@/lib/chat/service";

/** عرض/تحميل مرفق شات (?download=1 للتحميل). الصلاحية من canViewAttachment */
export async function GET(request: Request, ctx: RouteContext<"/api/chat/attachments/[id]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "سجّل دخول الأول" }, { status: 401 });
  const viewer: Viewer = { id: user.id, role: user.role, name: user.name };
  const { id } = await ctx.params;

  try {
    const attachment = await canViewAttachment(viewer, id);
    if (!attachment) return Response.json({ error: "الملف مش موجود" }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return await attachmentResponse(attachment, { download, range: request.headers.get("range") });
  } catch (err) {
    if (err instanceof ChatError) return Response.json({ error: err.message }, { status: err.status });
    console.error("chat attachment read failed", err);
    return Response.json({ error: "حصلت مشكلة" }, { status: 500 });
  }
}
