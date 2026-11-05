import "server-only";
import type { Attachment } from "@/generated/prisma/client";
import type { Viewer } from "./service";
import type { AttachmentKind, ChatAttachment } from "./types";

/**
 * [المرحلة 2 — الملفات والصوت]
 * رفع المرفقات: بيعمل صف Attachment (messageId = null) ويحط الملف في التخزين (lib/storage).
 * service.sendMessage بيربط المرفقات بالرسالة عن طريق attachmentIds.
 * مفتاح التخزين: chat/<yyyy>/<mm>/<attachmentId>
 * الدالتين دول هما العقد اللي بيستخدمه /api/chat/attachments و /api/agent/v1/chat/attachments.
 */

/** بيتأكد من الحجم (chat.maxFileMb) والنوع، يخزن الملف، ويرجع المرفق. بيرمي ChatError لو في مشكلة */
export async function saveUpload(_viewer: Viewer, _file: File, _opts: { kind?: AttachmentKind; durationSec?: number } = {}): Promise<ChatAttachment> {
  throw new Error("not implemented");
}

/** Response فيه الملف (أو redirect لرابط S3 موقّع) بالـ headers الصح. download=true يخلي المتصفح يحمّله */
export async function attachmentResponse(_attachment: Attachment, _opts: { download?: boolean } = {}): Promise<Response> {
  throw new Error("not implemented");
}
