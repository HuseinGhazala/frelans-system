import "server-only";
import { randomUUID } from "node:crypto";
import type { Attachment } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { deleteObject, putObject, readObject } from "@/lib/storage";
import {
  MAX_VOICE_SECONDS,
  contentDisposition,
  detectKind,
  isBlockedFile,
  isInlineMime,
  looksExecutable,
  parseRange,
  sanitizeFilename,
  servedContentType,
  sniffAudio,
  sniffImage,
} from "./attachment-utils";
import { ChatError, type Viewer } from "./service";
import type { AttachmentKind, ChatAttachment } from "./types";

/**
 * [المرحلة 2 — الملفات والصوت]
 * رفع المرفقات: بيعمل صف Attachment (messageId = null) ويحط الملف في التخزين (lib/storage).
 * service.sendMessage بيربط المرفقات بالرسالة عن طريق attachmentIds.
 * مفتاح التخزين: chat/<yyyy>/<mm>/<attachmentId>
 * الدالتين دول هما العقد اللي بيستخدمه /api/chat/attachments و /api/agent/v1/chat/attachments.
 */

const UPLOADS_PER_WINDOW = 60;
const UPLOAD_WINDOW_MS = 10 * 60_000;

/** ChatError.status متحدد بـ 400/403/404 — هنا محتاجين 410/413/429 كمان */
function httpError(message: string, status: ChatError["status"]): ChatError {
  return new ChatError(message, status);
}

export function toChatAttachment(a: Attachment): ChatAttachment {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    mime: a.mime,
    bytes: a.bytes,
    width: a.width,
    height: a.height,
    durationSec: a.durationSec,
    expired: Boolean(a.expiredAt),
  };
}

/** أقصى حجم بالبايت حسب الإعدادات */
export async function maxUploadBytes(): Promise<number> {
  return (await getSettings()).chat.maxFileMb * 1024 * 1024;
}

/** بيتأكد من الحجم (chat.maxFileMb) والنوع، يخزن الملف، ويرجع المرفق. بيرمي ChatError لو في مشكلة */
export async function saveUpload(viewer: Viewer, file: File, opts: { kind?: AttachmentKind; durationSec?: number } = {}): Promise<ChatAttachment> {
  const rateKey = `chat-upload:${viewer.id}`;
  if (isRateLimited(rateKey, UPLOADS_PER_WINDOW)) throw httpError("رفعت ملفات كتير، استنى شوية وجرب تاني", 429);

  const { chat } = await getSettings();
  if (file.size === 0) throw new ChatError("الملف فاضي");
  if (file.size > chat.maxFileMb * 1024 * 1024) throw httpError(`الملف أكبر من ${chat.maxFileMb} ميجا`, 413);

  const name = sanitizeFilename(file.name || (opts.kind === "VOICE" ? "رسالة صوتية" : "file"));
  if (isBlockedFile(name, file.type)) throw new ChatError("النوع ده من الملفات مش مسموح (برامج وسكريبتات)");

  recordFailure(rateKey, UPLOAD_WINDOW_MS);
  const body = Buffer.from(await file.arrayBuffer());
  if (looksExecutable(body)) throw new ChatError("النوع ده من الملفات مش مسموح (برامج وسكريبتات)");

  const image = sniffImage(body);
  const audio = opts.kind === "VOICE" ? sniffAudio(body) : null;
  const { kind, mime } = detectKind({ mime: file.type, requested: opts.kind, image, audio });
  if (opts.kind === "VOICE" && kind !== "VOICE") throw new ChatError("التسجيل الصوتي مش سليم، سجّل تاني");

  let durationSec: number | null = null;
  if (kind === "VOICE" && opts.durationSec !== undefined && Number.isFinite(opts.durationSec)) {
    durationSec = Math.min(MAX_VOICE_SECONDS + 5, Math.max(0, Math.round(opts.durationSec)));
  }

  const id = randomUUID().replace(/-/g, "");
  const now = new Date();
  const storageKey = `chat/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
  await putObject(storageKey, body, mime);
  try {
    const row = await db.attachment.create({
      data: {
        id,
        uploaderId: viewer.id,
        kind,
        name,
        mime,
        bytes: body.length,
        storageKey,
        width: image?.width ?? null,
        height: image?.height ?? null,
        durationSec,
      },
    });
    return toChatAttachment(row);
  } catch (err) {
    await deleteObject(storageKey).catch(() => undefined);
    throw err;
  }
}

/**
 * Response فيه الملف (أو redirect لرابط S3 موقّع) بالـ headers الصح. download=true يخلي المتصفح يحمّله.
 * range = قيمة هيدر Range (اختياري) — Safari محتاجه عشان يشغّل الصوت.
 */
export async function attachmentResponse(attachment: Attachment, opts: { download?: boolean; range?: string | null } = {}): Promise<Response> {
  if (attachment.expiredAt) return Response.json({ error: "الملف اتمسح بعد مدة الحفظ" }, { status: 410 });

  const inline = !opts.download && isInlineMime(attachment.mime);
  const disposition = contentDisposition(inline ? "inline" : "attachment", attachment.name);
  const obj = await readObject(attachment.storageKey, { contentDisposition: disposition, contentType: servedContentType(attachment.mime) }).catch(() => null);
  if (!obj) return Response.json({ error: "الملف مش موجود" }, { status: 404 });
  if ("redirect" in obj) {
    return new Response(null, { status: 302, headers: { location: obj.redirect, "cache-control": "private, no-store" } });
  }

  const headers = new Headers({
    "content-type": servedContentType(attachment.mime),
    "content-disposition": disposition,
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=3600",
    "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "accept-ranges": "bytes",
  });

  const size = obj.body.length;
  const range = parseRange(opts.range, size);
  if (range === "invalid") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("content-length", String(range.end - range.start + 1));
    return new Response(new Uint8Array(obj.body.subarray(range.start, range.end + 1)), { status: 206, headers });
  }
  headers.set("content-length", String(size));
  return new Response(new Uint8Array(obj.body), { status: 200, headers });
}
