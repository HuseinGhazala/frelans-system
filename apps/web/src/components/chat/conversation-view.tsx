"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Hash, Info, Loader2, Search, X } from "lucide-react";
import type { ConversationSummary, PresenceStatus } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { Composer, type SendInput } from "./composer";
import { SearchResults, useMessageSearch, type SearchHit } from "./conversation-list";
import { MessageItem } from "./message-item";
import { ConversationAvatar } from "./parts";
import type { ConvMessages, UIMessage } from "./reducer";
import { canEditMessage, groupMessages, PRESENCE_META } from "./utils";

type Me = { id: string; name: string; role: "ADMIN" | "EMPLOYEE" };

function typingText(names: string[]): string {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length === 1) return `${first[0]} بيكتب...`;
  if (first.length === 2) return `${first[0]} و${first[1]} بيكتبوا...`;
  return `${first.length} بيكتبوا...`;
}

export function ConversationView({
  conversation,
  data,
  me,
  readOnly,
  tz,
  editWindowMin,
  now,
  presence,
  typingNames,
  senderName,
  highlightId,
  loadingOlder,
  error,
  banner,
  onBack,
  onLoadOlder,
  onSend,
  onEdit,
  onDelete,
  onTyping,
  onJump,
  onOpenInfo,
}: {
  conversation: ConversationSummary;
  data: ConvMessages | undefined;
  me: Me;
  readOnly: boolean;
  tz: string;
  editWindowMin: number;
  now: Date;
  presence: Record<string, PresenceStatus>;
  typingNames: string[];
  senderName: (id: string) => string;
  highlightId: string | null;
  loadingOlder: boolean;
  error: string | null;
  banner?: React.ReactNode;
  onBack: () => void;
  onLoadOlder: () => void;
  onSend: (input: SendInput) => Promise<boolean>;
  onEdit: (messageId: string, body: string) => Promise<boolean>;
  onDelete: (m: UIMessage) => void;
  onTyping: () => void;
  onJump: (messageId: string) => void;
  onOpenInfo: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const prevFirst = useRef<string | null>(null);
  const prevLast = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [replyTo, setReplyTo] = useState<UIMessage | null>(null);
  const [editing, setEditing] = useState<UIMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const search = useMessageSearch({ conversationId: searchOpen ? conversation.id : null });

  const items = data?.items ?? [];
  const firstId = items[0]?.id ?? null;
  const last = items[items.length - 1];
  const lastId = last?.id ?? null;
  const isAdmin = me.role === "ADMIN";
  const canWrite = !readOnly && conversation.isMember;
  const nowMs = now.getTime();
  const rows = groupMessages(items, tz, now);
  const lastMineId = [...items].reverse().find((m) => m.senderId === me.id && !m.deletedAt)?.id ?? null;
  const realMembers = conversation.members;

  // ترتيب الاسكرول: أول تحميل → تحت، رسايل أقدم → نفس المكان، رسالة جديدة → تحت لو كان تحت أو هي بتاعتي
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current && firstId !== prevFirst.current) {
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    } else if (lastId !== prevLast.current) {
      const initial = prevLast.current === null;
      if (initial || atBottom.current || last?.senderId === me.id) {
        el.scrollTop = el.scrollHeight;
        atBottom.current = true;
      }
    }
    prevFirst.current = firstId;
    prevLast.current = lastId;
  }, [firstId, lastId, last?.senderId, me.id]);

  // الرسالة اللي اتطلبت (رد/بحث)
  useLayoutEffect(() => {
    if (!highlightId) return;
    document.getElementById(`msg-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, items.length]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottom.current = bottom;
    if (showJump === bottom) setShowJump(!bottom);
    if (el.scrollTop < 120 && data?.hasMore && !loadingOlder) {
      anchor.current = { height: el.scrollHeight, top: el.scrollTop };
      onLoadOlder();
    }
  };

  const other = conversation.type === "DIRECT" ? conversation.members.find((m) => m.id !== me.id) : undefined;
  const subtitle = typingNames.length
    ? typingText(typingNames)
    : conversation.type === "DIRECT"
      ? other && conversation.isMember
        ? PRESENCE_META[presence[other.id] ?? "OFFLINE"].label
        : `${conversation.members.length} أعضاء`
      : `${conversation.members.length} عضو`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2 sm:px-3">
        <button onClick={onBack} className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden" aria-label="رجوع للمحادثات">
          <ArrowRight size={18} />
        </button>
        <button type="button" onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-right hover:bg-surface-2">
          {conversation.type === "GENERAL" ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
              <Hash size={16} />
            </span>
          ) : (
            <ConversationAvatar conversation={conversation} myId={me.id} presence={presence} size={36} />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{conversation.title}</span>
            <span className={cn("block truncate text-xs", typingNames.length ? "text-primary" : "text-muted")}>{subtitle}</span>
          </span>
        </button>
        <button onClick={() => setSearchOpen((v) => !v)} className={cn("rounded-lg p-2 hover:bg-surface-2", searchOpen ? "text-primary" : "text-muted")} aria-label="بحث في المحادثة" title="بحث في المحادثة">
          <Search size={18} />
        </button>
        <button onClick={onOpenInfo} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="تفاصيل المحادثة" title="التفاصيل">
          <Info size={18} />
        </button>
      </header>

      {banner}

      {searchOpen && (
        <div className="border-b border-border bg-surface">
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              autoFocus
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="دوّر في المحادثة دي..."
              className="h-9 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="بحث في المحادثة"
            />
            <button
              onClick={() => {
                search.setQuery("");
                setSearchOpen(false);
              }}
              className="rounded-lg p-2 text-muted hover:bg-surface-2"
              aria-label="قفل البحث"
            >
              <X size={16} />
            </button>
          </div>
          {search.active && (
            <div className="max-h-64 overflow-y-auto border-t border-border">
              {search.loading ? (
                <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin" /> بيدوّر...
                </p>
              ) : search.error ? (
                <p className="px-4 py-4 text-center text-sm text-danger">{search.error}</p>
              ) : (
                <SearchResults
                  hits={search.hits}
                  query={search.query.trim()}
                  tz={tz}
                  senderName={senderName}
                  showConversation={false}
                  onPick={(h: SearchHit) => onJump(h.message.id)}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain bg-bg pb-3" aria-live="polite">
          {!data ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> بيحمّل الرسايل...
            </p>
          ) : (
            <>
              {data.hasMore ? (
                <p className="flex items-center justify-center py-3 text-xs text-muted">{loadingOlder ? <Loader2 size={14} className="animate-spin" /> : "اطلع لفوق عشان تشوف رسايل أقدم"}</p>
              ) : (
                <p className="py-4 text-center text-xs text-muted">{items.length ? "دي أول المحادثة" : "مفيش رسايل لسه — ابدأ انت 👋"}</p>
              )}
              {rows.map((r) =>
                r.kind === "day" ? (
                  <div key={`d-${r.key}`} className="sticky top-1 z-10 my-3 flex justify-center">
                    <span className="rounded-full bg-surface px-3 py-0.5 text-[11px] font-medium text-muted shadow-sm ring-1 ring-border">{r.label}</span>
                  </div>
                ) : (
                  <MessageItem
                    key={r.message.id}
                    message={r.message}
                    myId={me.id}
                    isAdmin={isAdmin}
                    showHeader={r.showHeader}
                    senderName={senderName(r.message.senderId)}
                    replySenderName={r.message.replyTo ? senderName(r.message.replyTo.senderId) : null}
                    members={realMembers}
                    conversationType={conversation.type}
                    isLastMine={r.message.id === lastMineId}
                    tz={tz}
                    canEdit={canWrite && canEditMessage(r.message, me.id, editWindowMin, nowMs)}
                    canDelete={!readOnly && !r.message.pending && (isAdmin || canEditMessage(r.message, me.id, editWindowMin, nowMs))}
                    canReply={canWrite}
                    highlighted={r.message.id === highlightId}
                    onReply={(m) => {
                      setEditing(null);
                      setReplyTo(m);
                    }}
                    onEdit={(m) => {
                      setReplyTo(null);
                      setEditing(m);
                    }}
                    onDelete={onDelete}
                    onJump={onJump}
                  />
                ),
              )}
            </>
          )}
        </div>
        {showJump && (
          <button
            onClick={() => {
              const el = scroller.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="absolute bottom-3 left-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-md hover:text-text"
            aria-label="انزل لآخر رسالة"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      {error && <p className="border-t border-border bg-danger-soft px-4 py-1.5 text-xs text-danger">{error}</p>}

      {canWrite ? (
        <Composer
          key={conversation.id}
          members={conversation.members}
          myId={me.id}
          replyTo={replyTo}
          editing={editing}
          senderName={senderName}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={onSend}
          onEdit={onEdit}
          onTyping={onTyping}
        />
      ) : (
        !readOnly && <p className="border-t border-border bg-surface px-4 py-3 text-center text-sm text-muted">انت مش عضو في المحادثة دي</p>
      )}
    </div>
  );
}
