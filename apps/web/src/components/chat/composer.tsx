"use client";

import { useRef, useState } from "react";
import { Pencil, Reply, SendHorizontal, X } from "lucide-react";
import type { ChatAttachment, ConversationMemberInfo } from "@/lib/chat/types";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH } from "@/lib/chat/types";
import { plainText } from "@/lib/chat/mentions";
import { cn } from "@/lib/utils";
import { AttachmentButton, PendingAttachments, VoiceRecorderButton } from "./attachments";
import { ChatAvatar } from "./parts";
import type { UIMessage } from "./reducer";
import { activeMentionQuery, applyMention, decodeMentions, encodeMentions, filterMentionCandidates, type PickedMention } from "./utils";

const TYPING_EVERY_MS = 3000;

export type SendInput = { body: string; attachments: ChatAttachment[]; replyTo: UIMessage | null };

/**
 * خانة الكتابة: Enter يبعت، Shift+Enter سطر جديد، @ تفتح قائمة الأعضاء،
 * وزراير الملفات والصوت (من attachments.tsx). بتستخدم كمان لتعديل رسالة.
 */
export function Composer({
  members,
  myId,
  replyTo,
  editing,
  senderName,
  onCancelReply,
  onCancelEdit,
  onSend,
  onEdit,
  onTyping,
}: {
  members: ConversationMemberInfo[];
  myId: string;
  replyTo: UIMessage | null;
  editing: UIMessage | null;
  senderName: (id: string) => string;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  /** بيرجع false لو الإرسال فشل (النص يفضل زي ما هو) */
  onSend: (input: SendInput) => Promise<boolean>;
  onEdit: (messageId: string, body: string) => Promise<boolean>;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<PickedMention[]>([]);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [popup, setPopup] = useState<{ start: number; query: string; index: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState<{ text: string; mentions: PickedMention[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  // بدأ تعديل رسالة: نحط نصها في الخانة (ونرجع المسودة بعد ما يخلص)
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    if (editing) {
      const d = decodeMentions(editing.body);
      if (!editingId) setDraftBeforeEdit({ text, mentions });
      setText(d.text);
      setMentions(d.mentions);
    } else if (draftBeforeEdit) {
      setText(draftBeforeEdit.text);
      setMentions(draftBeforeEdit.mentions);
      setDraftBeforeEdit(null);
    }
    setPopup(null);
  }

  const candidates = popup ? filterMentionCandidates(members, popup.query, myId) : [];

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const updatePopup = (value: string, caret: number) => {
    const m = activeMentionQuery(value, caret);
    setPopup(m ? { ...m, index: 0 } : null);
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    updatePopup(e.target.value, e.target.selectionStart);
    resize();
    const now = e.timeStamp; // ms من فتح الصفحة — كفاية لحساب الفترة
    if (!editing && e.target.value.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      onTyping();
    }
  };

  const pickMention = (m: ConversationMemberInfo) => {
    const el = ref.current;
    if (!popup || !el) return;
    const next = applyMention(text, popup.start, el.selectionStart, m.name);
    setText(next.text);
    setMentions((list) => [...list.filter((x) => x.id !== m.id), { id: m.id, name: m.name }]);
    setPopup(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async () => {
    if (busy) return;
    const body = encodeMentions(text, mentions).trim();
    if (editing) {
      if (!body && editing.attachments.length === 0) return;
      setBusy(true);
      const ok = await onEdit(editing.id, body);
      setBusy(false);
      if (ok) onCancelEdit();
      return;
    }
    if (!body && pending.length === 0) return;
    const sent = { body, attachments: pending, replyTo };
    // بنفضّي فورًا (الإرسال متفائل) ونرجّع لو فشل
    const before = { text, mentions, pending };
    setText("");
    setMentions([]);
    setPending([]);
    setPopup(null);
    onCancelReply();
    requestAnimationFrame(resize);
    lastTyping.current = 0;
    setBusy(true);
    const ok = await onSend(sent);
    setBusy(false);
    if (!ok) {
      setText(before.text);
      setMentions(before.mentions);
      setPending(before.pending);
    }
    ref.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popup && candidates.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setPopup({ ...popup, index: (popup.index + d + candidates.length) % candidates.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(candidates[popup.index] ?? candidates[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPopup(null);
        return;
      }
    }
    if (e.key === "Escape") {
      if (editing) onCancelEdit();
      else if (replyTo) onCancelReply();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const tooLong = encodeMentions(text, mentions).length > MAX_MESSAGE_LENGTH;
  const canSend = !busy && !tooLong && (text.trim().length > 0 || (!editing && pending.length > 0));

  return (
    <div className="relative border-t border-border bg-surface px-3 py-2 sm:px-4">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-r-4 border-primary bg-surface-2 px-3 py-2 text-sm">
          {editing ? <Pencil size={14} className="mt-0.5 shrink-0 text-primary" /> : <Reply size={14} className="mt-0.5 shrink-0 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">{editing ? "تعديل الرسالة" : `رد على ${senderName(replyTo!.senderId)}`}</p>
            {replyTo && !editing && (
              <p className="truncate text-muted">{replyTo.deletedAt ? "الرسالة اتمسحت" : plainText(replyTo.body) || (replyTo.attachments.length ? "📎 مرفق" : "")}</p>
            )}
          </div>
          <button onClick={editing ? onCancelEdit : onCancelReply} className="rounded p-1 text-muted hover:bg-surface" aria-label="إلغاء">
            <X size={14} />
          </button>
        </div>
      )}

      {!editing && (
        <PendingAttachments items={pending} onRemove={(id) => setPending((list) => list.filter((a) => a.id !== id))} />
      )}

      {popup && candidates.length > 0 && (
        <ul className="absolute bottom-full right-3 left-3 z-20 mb-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg sm:left-auto sm:w-72" role="listbox" aria-label="اختار شخص">
          {candidates.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === popup.index}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(m);
                }}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm", i === popup.index ? "bg-primary-soft" : "hover:bg-surface-2")}
              >
                <ChatAvatar name={m.name} size={28} />
                <span className="truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5 pb-1">
            <AttachmentButton
              disabled={pending.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              onUploaded={(a) => setPending((list) => (list.some((x) => x.id === a.id) ? list : [...list, a]))}
            />
            <VoiceRecorderButton
              disabled={pending.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              onUploaded={(a) => setPending((list) => (list.some((x) => x.id === a.id) ? list : [...list, a]))}
            />
          </div>
        )}
        <textarea
          ref={ref}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onClick={(e) => updatePopup(text, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setPopup(null), 150)}
          rows={1}
          placeholder={editing ? "عدّل الرسالة..." : "اكتب رسالة... (@ عشان تعمل منشن)"}
          className="max-h-[180px] min-h-10 flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm leading-6 placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="الرسالة"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40"
          aria-label={editing ? "حفظ التعديل" : "ابعت"}
          title={editing ? "حفظ التعديل" : "ابعت (Enter)"}
        >
          <SendHorizontal size={18} className="rotate-180" />
        </button>
      </div>
      {tooLong && <p className="mt-1 text-xs text-danger">الرسالة طويلة جدًا (أقصى {MAX_MESSAGE_LENGTH} حرف)</p>}
    </div>
  );
}
