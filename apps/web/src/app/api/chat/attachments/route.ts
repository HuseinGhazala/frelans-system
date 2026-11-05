import { getCurrentUser } from "@/lib/auth/dal";
import { maxUploadBytes, saveUpload } from "@/lib/chat/attachments";
import { ChatError, type Viewer } from "@/lib/chat/service";
import type { AttachmentKind } from "@/lib/chat/types";

const KINDS: AttachmentKind[] = ["IMAGE", "FILE", "VOICE"];
/** هامش لحدود الـ multipart حوالين الملف */
const MULTIPART_OVERHEAD = 1024 * 1024;

/** رفع مرفق للشات (multipart: file, kind?, durationSec?) → ChatAttachment */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "سجّل دخول الأول" }, { status: 401 });
  const viewer: Viewer = { id: user.id, role: user.role, name: user.name };

  try {
    // نرفض بدري قبل ما نقرا الـ body كله في الذاكرة
    const declared = Number(request.headers.get("content-length") ?? 0);
    const max = await maxUploadBytes();
    if (declared > max + MULTIPART_OVERHEAD) {
      return Response.json({ error: `الملف أكبر من ${Math.round(max / 1024 / 1024)} ميجا` }, { status: 413 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return Response.json({ error: "مفيش ملف" }, { status: 400 });
    const rawKind = form.get("kind");
    const kind = typeof rawKind === "string" && KINDS.includes(rawKind as AttachmentKind) ? (rawKind as AttachmentKind) : undefined;
    const rawDuration = form.get("durationSec");
    const durationSec = typeof rawDuration === "string" && rawDuration.trim() !== "" ? Number(rawDuration) : undefined;

    const attachment = await saveUpload(viewer, file, { kind, durationSec });
    return Response.json(attachment, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return Response.json({ error: err.message }, { status: err.status });
    console.error("chat upload failed", err);
    return Response.json({ error: "حصلت مشكلة في الرفع، جرب تاني" }, { status: 500 });
  }
}
