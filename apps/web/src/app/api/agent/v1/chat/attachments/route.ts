import { saveUpload } from "@/lib/chat/attachments";
import { ChatError } from "@/lib/chat/service";
import type { AttachmentKind } from "@/lib/chat/types";
import { chatRoute } from "../_lib/handler";

const KINDS: readonly AttachmentKind[] = ["IMAGE", "FILE", "VOICE"];

/** رفع مرفق (multipart): file + kind? + durationSec? — والرد فيه المرفق عشان الـ id يتبعت مع الرسالة */
export async function POST(request: Request) {
  return chatRoute(request, async (viewer) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new ChatError("مفيش ملف", 400);
    const rawKind = form.get("kind");
    const kind = KINDS.find((k) => k === rawKind);
    const rawDuration = Number(form.get("durationSec"));
    const durationSec = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(Math.round(rawDuration), 24 * 3600) : undefined;
    return { attachment: await saveUpload(viewer, file, { kind, durationSec }) };
  });
}
