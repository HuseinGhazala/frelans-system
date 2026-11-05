"use client";

import { useEffect, useState } from "react";
import { Hash, Loader2, Search, SquarePen, X } from "lucide-react";
import { searchMessagesAction } from "@/app/actions/chat";
import type { ChatMessage, ConversationSummary, PresenceStatus } from "@/lib/chat/types";
import { plainText } from "@/lib/chat/mentions";
import { cn } from "@/lib/utils";
import { ConversationAvatar } from "./parts";
import { formatDateTime, highlightParts, listTime, snippetAround } from "./utils";

export type SearchHit = { message: ChatMessage; conversationTitle: string };

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-warning-soft px-0.5 text-warning">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** نتايج البحث (في كل المحادثات أو في محادثة واحدة) */
export function SearchResults({
  hits,
  query,
  tz,
  senderName,
  showConversation,
  onPick,
}: {
  hits: SearchHit[];
  query: string;
  tz: string;
  senderName: (id: string) => string;
  showConversation: boolean;
  onPick: (hit: SearchHit) => void;
}) {
  if (hits.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted">مفيش رسايل فيها &quot;{query}&quot;</p>;
  return (
    <ul className="divide-y divide-border">
      {hits.map((h) => (
        <li key={h.message.id}>
          <button type="button" onClick={() => onPick(h)} className="block w-full px-4 py-2.5 text-right hover:bg-surface-2">
            <span className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="truncate font-medium text-text">
                {showConversation ? `${h.conversationTitle} • ` : ""}
                {senderName(h.message.senderId)}
              </span>
              <span className="shrink-0">{formatDateTime(h.message.createdAt, tz)}</span>
            </span>
            <span className={cn("mt-0.5 line-clamp-2 text-sm", h.message.deletedAt && "text-muted line-through")} dir="auto">
              <Highlighted text={snippetAround(plainText(h.message.body), query)} query={query} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** بحث مع تأخير بسيط وهو بيكتب */
export function useMessageSearch(opts: { conversationId?: string | null; all?: boolean }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; error: string | null } | null>(null);
  const q = query.trim();
  const { conversationId, all } = opts;
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchMessagesAction(q, { conversationId, all });
      if (!cancelled) setResult({ q, hits: r.ok ? r.data : [], error: r.ok ? null : r.error });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, conversationId, all]);
  const active = q.length >= 2;
  return { query, setQuery, active, loading: active && result?.q !== q, hits: active && result?.q === q ? result.hits : [], error: result?.q === q ? result.error : null };
}

export function ConversationList({
  conversations,
  activeId,
  myId,
  presence,
  typing,
  tz,
  now,
  senderName,
  onSelect,
  onNew,
  onSearchPick,
  searchAll,
  emptyText,
  header,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  myId: string;
  presence: Record<string, PresenceStatus>;
  typing: Record<string, Record<string, { name: string; at: number }> | undefined>;
  tz: string;
  now: Date;
  senderName: (id: string) => string;
  onSelect: (id: string) => void;
  onNew?: () => void;
  onSearchPick: (hit: SearchHit) => void;
  /** الأدمن في المراقبة: البحث في كل المحادثات */
  searchAll?: boolean;
  emptyText?: string;
  header?: React.ReactNode;
}) {
  const search = useMessageSearch({ all: searchAll });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-semibold">{searchAll ? "كل المحادثات" : "المحادثات"}</h2>
          {onNew && (
            <button onClick={onNew} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-hover" title="محادثة جديدة">
              <SquarePen size={14} /> جديدة
            </button>
          )}
        </div>
        {header}
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            placeholder={searchAll ? "دوّر في كل الرسايل..." : "دوّر في رسايلك..."}
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-9 pl-8 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="بحث في الرسايل"
          />
          {search.query && (
            <button onClick={() => search.setQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-text" aria-label="مسح البحث">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {search.active ? (
          search.loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> بيدوّر...
            </p>
          ) : search.error ? (
            <p className="px-4 py-8 text-center text-sm text-danger">{search.error}</p>
          ) : (
            <SearchResults hits={search.hits} query={search.query.trim()} tz={tz} senderName={senderName} showConversation onPick={onSearchPick} />
          )
        ) : conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">{emptyText ?? "مفيش محادثات لسه"}</p>
        ) : (
          <ul>
            {conversations.map((c) => {
              const typers = Object.values(typing[c.id] ?? {});
              const lastSender = c.lastMessage && c.type !== "DIRECT" ? (c.lastMessage.senderId === myId ? "انت: " : `${senderName(c.lastMessage.senderId).split(" ")[0]}: `) : c.lastMessage?.senderId === myId ? "انت: " : "";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors", c.id === activeId ? "bg-primary-soft/70" : "hover:bg-surface-2")}
                    aria-current={c.id === activeId ? "true" : undefined}
                  >
                    {c.type === "GENERAL" ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                        <Hash size={18} />
                      </span>
                    ) : (
                      <ConversationAvatar conversation={c} myId={myId} presence={presence} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.title}</span>
                        {c.lastMessage && <span className={cn("shrink-0 text-[11px]", c.unread ? "font-semibold text-primary" : "text-muted")}>{listTime(c.lastMessage.createdAt, tz, now)}</span>}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn("truncate text-xs", typers.length ? "text-primary" : c.unread ? "text-text" : "text-muted")}>
                          {typers.length ? `${typers.length === 1 && c.type !== "DIRECT" ? `${typers[0].name.split(" ")[0]} ` : ""}بيكتب...` : c.lastMessage ? `${lastSender}${c.lastMessage.preview}` : "مفيش رسايل لسه"}
                        </span>
                        {c.unread > 0 && (
                          <span className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-on-primary tabular-nums">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
