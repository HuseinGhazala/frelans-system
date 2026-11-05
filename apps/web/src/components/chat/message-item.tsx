"use client";

import { memo, useState } from "react";
import { Check, CheckCheck, Clock, History, Pencil, Reply, Trash2 } from "lucide-react";
import type { ConversationMemberInfo, ConversationType } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { MessageAttachments } from "./attachments";
import { ChatAvatar, MessageBody } from "./parts";
import type { UIMessage } from "./reducer";
import { formatDateTime, formatTime, seenBy } from "./utils";

export type MessageItemProps = {
  message: UIMessage;
  myId: string;
  isAdmin: boolean;
  showHeader: boolean;
  senderName: string;
  replySenderName: string | null;
  members: ConversationMemberInfo[];
  conversationType: ConversationType;
  /** آخر رسالة ليا: نكتب تحتها مين قراها */
  isLastMine: boolean;
  tz: string;
  canEdit: boolean;
  canDelete: boolean;
  canReply: boolean;
  highlighted: boolean;
  onReply: (m: UIMessage) => void;
  onEdit: (m: UIMessage) => void;
  onDelete: (m: UIMessage) => void;
  onJump: (messageId: string) => void;
};

function MessageItemImpl(p: MessageItemProps) {
  const { message: m, myId } = p;
  const mine = m.senderId === myId;
  const deleted = Boolean(m.deletedAt);
  const [showEdits, setShowEdits] = useState(false);
  const seen = mine && !m.pending ? seenBy(m, p.members) : [];
  const others = p.members.filter((x) => x.id !== myId).length;

  return (
    <div id={`msg-${m.id}`} className={cn("group flex gap-2 px-3 sm:px-4", p.showHeader ? "mt-3" : "mt-0.5", mine ? "flex-row-reverse" : "flex-row")}>
      <div className="w-8 shrink-0">{!mine && p.showHeader && p.conversationType !== "DIRECT" && <ChatAvatar name={p.senderName} size={32} />}</div>
      <div className={cn("flex min-w-0 max-w-[80%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
        {p.showHeader && !mine && p.conversationType !== "DIRECT" && <span className="mb-0.5 px-1 text-xs font-medium text-muted">{p.senderName}</span>}
        <div className={cn("flex items-end gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            className={cn(
              "min-w-0 rounded-2xl px-3 py-2 text-sm transition-shadow",
              mine ? "rounded-tl-md bg-primary text-on-primary" : "rounded-tr-md border border-border bg-surface",
              deleted && "border border-dashed border-border bg-surface-2 text-muted",
              m.pending && "opacity-70",
              p.highlighted && "ring-2 ring-warning ring-offset-2 ring-offset-bg",
            )}
          >
            {m.replyTo && (
              <button
                type="button"
                onClick={() => p.onJump(m.replyTo!.id)}
                className={cn(
                  "mb-1.5 block w-full rounded-lg border-r-4 px-2 py-1 text-right text-xs",
                  mine && !deleted ? "border-white/60 bg-white/15" : "border-primary bg-surface-2",
                )}
              >
                <span className="block font-semibold">{p.replySenderName ?? "مستخدم"}</span>
                <span className="line-clamp-2 opacity-80">
                  {m.replyTo.deleted && !m.replyTo.body ? "الرسالة اتمسحت" : m.replyTo.body || (m.replyTo.hasAttachments ? "📎 مرفق" : "")}
                </span>
              </button>
            )}

            {deleted && !p.isAdmin ? (
              <p className="italic">الرسالة اتمسحت</p>
            ) : (
              <>
                {deleted && <p className="mb-1 text-[11px] font-semibold text-danger">اتمسحت — ظاهرة ليك عشان انت المدير</p>}
                {m.body && (
                  <p className={cn("whitespace-pre-wrap break-words leading-6", deleted && "line-through decoration-danger/60")} dir="auto">
                    <MessageBody body={m.body} myId={myId} mine={mine && !deleted} />
                  </p>
                )}
                {m.attachments.length > 0 && (
                  <div className={cn(m.body && "mt-1.5")}>
                    <MessageAttachments attachments={m.attachments} mine={mine} />
                  </div>
                )}
              </>
            )}

            <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine && !deleted ? "text-on-primary/75" : "text-muted")}>
              {m.editedAt && !deleted && (
                p.isAdmin && m.edits?.length ? (
                  <button type="button" onClick={() => setShowEdits((v) => !v)} className="inline-flex items-center gap-0.5 underline" title="النسخ القديمة">
                    <History size={10} /> اتعدلت
                  </button>
                ) : (
                  <span>اتعدلت</span>
                )
              )}
              <time dateTime={m.createdAt} title={formatDateTime(m.createdAt, p.tz)}>
                {formatTime(m.createdAt, p.tz)}
              </time>
              {mine && !deleted && (
                m.pending ? (
                  <Clock size={12} aria-label="بتتبعت" />
                ) : seen.length > 0 && (p.conversationType === "DIRECT" || seen.length >= others) ? (
                  <CheckCheck size={14} aria-label="اتقرت" className="text-info-soft" />
                ) : seen.length > 0 ? (
                  <CheckCheck size={14} aria-label="اتقرت من بعض الأعضاء" />
                ) : (
                  <Check size={14} aria-label="اتبعتت" />
                )
              )}
            </div>
          </div>

          {!m.pending && (p.canReply || p.canEdit || p.canDelete) && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60">
              {p.canReply && !deleted && (
                <button type="button" onClick={() => p.onReply(m)} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="رد" title="رد">
                  <Reply size={14} />
                </button>
              )}
              {p.canEdit && (
                <button type="button" onClick={() => p.onEdit(m)} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="تعديل" title="تعديل">
                  <Pencil size={14} />
                </button>
              )}
              {p.canDelete && !deleted && (
                <button type="button" onClick={() => p.onDelete(m)} className="rounded-full p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label="مسح" title="مسح">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {showEdits && m.edits && (
          <div className="mt-1 w-full rounded-lg border border-border bg-surface-2 p-2 text-xs">
            <p className="mb-1 font-semibold text-muted">النسخ القديمة</p>
            <ul className="space-y-1">
              {m.edits.map((e, i) => (
                <li key={i} className="whitespace-pre-wrap break-words" dir="auto">
                  <span className="text-muted">{formatDateTime(e.createdAt, p.tz)}: </span>
                  <MessageBody body={e.body} myId={myId} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.isLastMine && seen.length > 0 && (
          <span className="mt-0.5 px-1 text-[11px] text-muted" title={seen.map((s) => s.name).join("، ")}>
            {p.conversationType === "DIRECT" ? "اتقرت" : seen.length >= others ? "اتقرت من الكل" : `اتقرت من ${seen.length}`}
          </span>
        )}
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemImpl);
