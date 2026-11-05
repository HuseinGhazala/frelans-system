"use client";

import type { ChatAttachment } from "@/lib/chat/types";

/**
 * [المرحلة 2 — الملفات والصوت] الواجهة المتفق عليها. اللي بيبني الشات (المرحلة 1) بيستخدمها كده بس.
 * الرفع: POST /api/chat/attachments (multipart: file, kind?, durationSec?) → ChatAttachment
 * العرض/التحميل: GET /api/chat/attachments/[id]
 */

/** زرار اختيار ملف/صورة (أو أكتر). بيرفع ويرجع كل مرفق اترفع */
export function AttachmentButton(_props: { onUploaded: (a: ChatAttachment) => void; disabled?: boolean }) {
  return null;
}

/** زرار تسجيل صوت: ضغطة تبدأ، ضغطة تبعت. بيرفع الريكورد ويرجعه */
export function VoiceRecorderButton(_props: { onUploaded: (a: ChatAttachment) => void; disabled?: boolean }) {
  return null;
}

/** المرفقات اللي اترفعت ولسه ما اتبعتتش (فوق خانة الكتابة) مع زرار شيل */
export function PendingAttachments(_props: { items: ChatAttachment[]; onRemove: (id: string) => void }) {
  return null;
}

/** عرض مرفقات رسالة: صور مصغرة (تكبر بالضغط)، مشغل صوت، وملفات بزرار تحميل. expired = "الملف اتمسح" */
export function MessageAttachments(_props: { attachments: ChatAttachment[]; mine: boolean }) {
  return null;
}
