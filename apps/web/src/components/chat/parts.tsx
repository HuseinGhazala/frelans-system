"use client";

import { useEffect, useId } from "react";
import { Users, X } from "lucide-react";
import type { ConversationSummary, PresenceStatus } from "@/lib/chat/types";
import { cn, initialsOf } from "@/lib/utils";
import { PRESENCE_META, type BodySegment, parseBody } from "./utils";

export function PresenceDot({ status, className }: { status: PresenceStatus | undefined; className?: string }) {
  const meta = PRESENCE_META[status ?? "OFFLINE"];
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", meta.dot, className)} title={meta.label} aria-label={meta.label} />;
}

export function ChatAvatar({ name, status, size = 40, group }: { name: string; status?: PresenceStatus; size?: number; group?: boolean }) {
  const initials = initialsOf(name);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className={cn("flex h-full w-full items-center justify-center rounded-full font-semibold", group ? "bg-info-soft text-info" : "bg-primary-soft text-primary", size < 36 ? "text-xs" : "text-sm")}>
        {group ? <Users size={Math.round(size * 0.45)} /> : initials}
      </span>
      {status && (
        <span className="absolute bottom-0 left-0 flex rounded-full border-2 border-surface leading-none">
          <PresenceDot status={status} className="block" />
        </span>
      )}
    </span>
  );
}

/** الصورة الصغيرة للمحادثة: للخاص بيبان حالة الطرف التاني */
export function ConversationAvatar({ conversation, myId, presence, size = 40 }: { conversation: ConversationSummary; myId: string; presence: Record<string, PresenceStatus>; size?: number }) {
  if (conversation.type !== "DIRECT") return <ChatAvatar name={conversation.title} group size={size} />;
  const other = conversation.members.find((m) => m.id !== myId) ?? conversation.members[0];
  return <ChatAvatar name={conversation.title} size={size} status={conversation.isMember && other ? presence[other.id] ?? "OFFLINE" : undefined} />;
}

/** نص الرسالة: منشن مميز، لينكات آمنة، والسطور زي ما هي (whitespace-pre-wrap عند اللي بيعرض) */
export function MessageBody({ body, myId, mine }: { body: string; myId: string; mine?: boolean }) {
  const segments: BodySegment[] = parseBody(body);
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === "text") return <span key={i}>{s.text}</span>;
        if (s.type === "link")
          return (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className={cn("break-all underline underline-offset-2", mine ? "text-on-primary" : "text-primary")} dir="ltr">
              {s.text}
            </a>
          );
        return (
          <span
            key={i}
            className={cn(
              "rounded px-1 font-medium",
              s.userId === myId ? "bg-warning-soft text-warning" : mine ? "bg-white/20 text-on-primary" : "bg-primary-soft text-primary",
            )}
          >
            @{s.name}
          </span>
        );
      })}
    </>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn("relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl", wide ? "sm:max-w-lg" : "sm:max-w-md")}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ErrorNote({ error, onClose }: { error: string | null; onClose?: () => void }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      <span>{error}</span>
      {onClose && (
        <button onClick={onClose} aria-label="إخفاء" className="shrink-0">
          <X size={14} />
        </button>
      )}
    </p>
  );
}
