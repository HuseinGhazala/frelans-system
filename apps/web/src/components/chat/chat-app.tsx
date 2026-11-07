"use client";

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, MessageCircle, RefreshCw } from "lucide-react";
import {
  deleteMessageAction,
  editMessageAction,
  getConversationAction,
  getMessagesAction,
  listAllConversationsAction,
  listConversationsAction,
  markReadAction,
  sendMessageAction,
  setTypingAction,
} from "@/app/actions/chat";
import { Select } from "@/components/ui/field";
import { plainText } from "@/lib/chat/mentions";
import type { ChatEvent, ChatMessage, ChatUser, ConversationSummary } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import type { SendInput } from "./composer";
import { ConversationList, type SearchHit } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { ConversationInfo } from "./group-info";
import { NewChatDialog } from "./new-chat-dialog";
import { PushToggle } from "./push-toggle";
import { chatReducer, initialChatState, type ChatState, type UIMessage } from "./reducer";
import { useChatEvents } from "./use-chat-events";

export type ChatMe = { id: string; name: string; role: "ADMIN" | "EMPLOYEE" };

export type ChatAppProps = {
  /** chat = محادثاتي، monitor = الأدمن بيشوف كل المحادثات (قراءة بس) */
  mode: "chat" | "monitor";
  me: ChatMe;
  initialConversations: ConversationSummary[];
  /** كل المستخدمين النشطين ما عدا أنا (للمحادثات الجديدة وفلتر المراقبة) */
  users: ChatUser[];
  timezone: string;
  editWindowMin: number;
  /** فلتر الموظف في المراقبة */
  initialUserFilter?: string | null;
  /** تابات فوق الشات (للأدمن: محادثاتي / المراقبة) */
  toolbar?: React.ReactNode;
};

const tempId = () => `tmp-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
const MAX_JUMP_PAGES = 20;

export function ChatApp(props: ChatAppProps) {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-7.5rem)] animate-pulse rounded-xl border border-border bg-surface lg:h-[calc(100dvh-4rem)]" />}>
      <ChatAppInner {...props} />
    </Suspense>
  );
}

/** المراقبة: كل قد إيه نحدّث المحادثة المفتوحة وقايمة المحادثات */
const MONITOR_POLL_MS = 10_000;
const MONITOR_LIST_POLL_MS = 60_000;

function ChatAppInner({ mode, me, initialConversations, users, timezone: tz, editWindowMin, initialUserFilter, toolbar }: ChatAppProps) {
  const monitor = mode === "monitor";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const activeId = searchParams.get("c");

  const [state, dispatch] = useReducer(chatReducer, undefined, () => initialChatState(me.id, initialConversations));
  const stateRef = useRef<ChatState>(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [userFilter, setUserFilter] = useState(initialUserFilter ?? "");
  const [focusTick, setFocusTick] = useState(0);
  const jumping = useRef<string | null>(null);
  const seenHello = useRef(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = state.conversations.find((c) => c.id === activeId) ?? null;
  const activeData = activeId ? state.messages[activeId] : undefined;

  // ───── الأسماء ─────
  const names = useMemo(() => {
    const map = new Map<string, string>([[me.id, me.name]]);
    for (const u of users) map.set(u.id, u.name);
    for (const c of state.conversations) for (const m of c.members) if (!map.has(m.id)) map.set(m.id, m.name);
    return map;
  }, [users, me.id, me.name, state.conversations]);
  const senderName = useCallback((id: string) => names.get(id) ?? "مستخدم", [names]);

  // ───── الوقت و"بيكتب" ─────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const hasTyping = Object.keys(state.typing).length > 0;
  useEffect(() => {
    if (!hasTyping) return;
    const t = setInterval(() => dispatch({ type: "typing.prune", now: Date.now() }), 1000);
    return () => clearInterval(t);
  }, [hasTyping]);

  useEffect(() => {
    const bump = () => setFocusTick((n) => n + 1);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  // الضغط على إشعار المتصفح وهو فاتح الصفحة: الـ service worker بيبعت {type:"chat-open", url}
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === "chat-open" && typeof d.url === "string" && d.url.startsWith("/")) router.push(d.url);
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [router]);

  // ───── التنقل (?c=) ─────
  const navigate = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (id) params.set("c", id);
      else params.delete("c");
      const qs = params.toString();
      window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
      setInfoOpen(false);
      setError(null);
    },
    [pathname],
  );

  const flash = (id: string) => {
    setHighlight(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2500);
  };

  // ───── تحميل المحادثة المفتوحة ─────
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      if (!stateRef.current.conversations.some((c) => c.id === activeId)) {
        const r = await getConversationAction(activeId);
        if (cancelled) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        dispatch({ type: "conversation.upsert", conversation: r.data });
      }
      if (stateRef.current.messages[activeId] || jumping.current === activeId) return;
      const r = await getMessagesAction(activeId);
      if (cancelled || jumping.current === activeId) return;
      if (r.ok) dispatch({ type: "messages.loaded", conversationId: activeId, messages: r.data.messages, hasMore: r.data.hasMore, older: false });
      else setError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // ───── علامة القراءة: المحادثة مفتوحة والشباك قدامه ─────
  const activeUnread = active?.unread ?? 0;
  const activeIsMember = active?.isMember ?? false;
  useEffect(() => {
    if (monitor || !activeId || !activeIsMember || activeUnread === 0) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    const t = setTimeout(async () => {
      const r = await markReadAction(activeId);
      if (r.ok) dispatch({ type: "conversation.readLocal", conversationId: activeId });
    }, 300);
    return () => clearTimeout(t);
  }, [monitor, activeId, activeIsMember, activeUnread, focusTick]);

  // ───── المراقبة: المحادثات اللي الأدمن مش عضو فيها ما بيوصلهاش أحداث لحظية، فبنحدّثها كل شوية ─────
  const monitorPollId = monitor && activeId && !activeIsMember ? activeId : null;
  useEffect(() => {
    if (!monitorPollId) return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await getMessagesAction(monitorPollId);
      if (!r.ok) return;
      const cur = stateRef.current.messages[monitorPollId];
      // دمج مع الموجود (عشان الصفحات القديمة اللي اتحمّلت ما تضيعش) + تحديث التعديلات والحذف
      dispatch({ type: "messages.loaded", conversationId: monitorPollId, messages: r.data.messages, hasMore: cur ? cur.hasMore : r.data.hasMore, older: Boolean(cur) });
    };
    const t = setInterval(() => void tick(), MONITOR_POLL_MS);
    return () => clearInterval(t);
  }, [monitorPollId]);

  // ───── إعادة المزامنة بعد انقطاع الاتصال ─────
  const reloadList = useCallback(
    async (filter: string) => {
      const r = monitor ? await listAllConversationsAction(filter || null) : await listConversationsAction();
      if (r.ok) dispatch({ type: "conversations.set", list: r.data });
      else setError(r.error);
    },
    [monitor],
  );


  // قايمة المحادثات في المراقبة (آخر رسالة والترتيب) بتتحدث كل دقيقة
  useEffect(() => {
    if (!monitor) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reloadList(userFilter);
    }, MONITOR_LIST_POLL_MS);
    return () => clearInterval(t);
  }, [monitor, reloadList, userFilter]);

  const resync = async () => {
    await reloadList(userFilter);
    const id = new URLSearchParams(window.location.search).get("c");
    if (!id) return;
    const r = await getMessagesAction(id);
    if (r.ok) dispatch({ type: "messages.loaded", conversationId: id, messages: r.data.messages, hasMore: r.data.hasMore, older: false });
  };

  // ───── الأحداث اللحظية ─────
  useChatEvents((event: ChatEvent) => {
    const s = stateRef.current;
    if (monitor) {
      if (event.type === "conversation.removed") return; // الأدمن لسه يقدر يشوفها
      if (event.type === "conversation.updated" && !s.conversations.some((c) => c.id === event.conversation.id)) return;
    }
    dispatch({ type: "event", event, at: Date.now() });

    if (event.type === "hello") {
      if (seenHello.current) void resync();
      seenHello.current = true;
    } else if (event.type === "message.created" && !monitor && !s.conversations.some((c) => c.id === event.message.conversationId)) {
      void getConversationAction(event.message.conversationId).then((r) => r.ok && dispatch({ type: "conversation.upsert", conversation: r.data }));
    } else if (event.type === "conversation.removed" && event.conversationId === new URLSearchParams(window.location.search).get("c")) {
      navigate(null);
      setError("خرجت من المحادثة دي");
    }
  });

  // ───── الإرسال والتعديل والحذف ─────
  const send = async ({ body, attachments, replyTo }: SendInput): Promise<boolean> => {
    if (!active) return false;
    const id = tempId();
    const optimistic: UIMessage = {
      id,
      conversationId: active.id,
      senderId: me.id,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyTo: replyTo
        ? { id: replyTo.id, senderId: replyTo.senderId, body: plainText(replyTo.body).slice(0, 200), deleted: Boolean(replyTo.deletedAt), hasAttachments: replyTo.attachments.length > 0 }
        : null,
      attachments,
      mentionIds: [],
      pending: true,
    };
    dispatch({ type: "message.optimistic", message: optimistic });
    setError(null);
    const r = await sendMessageAction({ conversationId: active.id, body, replyToId: replyTo?.id ?? null, attachmentIds: attachments.map((a) => a.id) });
    if (r.ok) {
      dispatch({ type: "message.confirmed", tempId: id, message: r.data });
      return true;
    }
    dispatch({ type: "message.failed", tempId: id, conversationId: active.id });
    setError(r.error);
    const c = await getConversationAction(active.id);
    if (c.ok) dispatch({ type: "conversation.upsert", conversation: c.data });
    return false;
  };

  const edit = async (messageId: string, body: string): Promise<boolean> => {
    const r = await editMessageAction(messageId, body);
    if (r.ok) {
      dispatch({ type: "message.upsert", message: r.data });
      setError(null);
      return true;
    }
    setError(r.error);
    return false;
  };

  const remove = async (m: UIMessage) => {
    if (!confirm(m.senderId === me.id ? "تمسح الرسالة دي؟" : `تمسح رسالة ${senderName(m.senderId)}؟`)) return;
    const r = await deleteMessageAction(m.id);
    if (!r.ok) return setError(r.error);
    // الأدمن بيوصله message.updated من السيرفر (عشان يفضل شايف الأصل)
    if (me.role !== "ADMIN") dispatch({ type: "event", event: { type: "message.deleted", conversationId: m.conversationId, messageId: m.id }, at: Date.now() });
  };

  const loadOlder = async () => {
    if (!activeId || !activeData?.hasMore || loadingOlder) return;
    const first = activeData.items.find((m) => !m.pending);
    if (!first) return;
    setLoadingOlder(true);
    const r = await getMessagesAction(activeId, first.id);
    setLoadingOlder(false);
    if (r.ok) dispatch({ type: "messages.loaded", conversationId: activeId, messages: r.data.messages, hasMore: r.data.hasMore, older: true });
    else setError(r.error);
  };

  /** يروح لرسالة (رد أو نتيجة بحث): يحمّل صفحات أقدم لحد ما يلاقيها */
  const jumpTo = async (conversationId: string, messageId: string) => {
    if (conversationId !== new URLSearchParams(window.location.search).get("c")) {
      jumping.current = conversationId;
      navigate(conversationId);
    }
    const cur = stateRef.current.messages[conversationId];
    if (cur?.items.some((m) => m.id === messageId)) {
      jumping.current = null;
      flash(messageId);
      return;
    }
    let collected: ChatMessage[] = cur?.items.filter((m) => !m.pending) ?? [];
    let hasMore = cur ? cur.hasMore : true;
    let before: string | undefined = collected[0]?.id;
    let found = false;
    for (let i = 0; i < MAX_JUMP_PAGES && hasMore && !found; i++) {
      const r = await getMessagesAction(conversationId, before ?? null);
      if (!r.ok) {
        setError(r.error);
        break;
      }
      collected = [...r.data.messages, ...collected];
      hasMore = r.data.hasMore;
      before = r.data.messages[0]?.id;
      found = r.data.messages.some((m) => m.id === messageId);
      if (!before) break;
    }
    dispatch({ type: "messages.loaded", conversationId, messages: collected, hasMore, older: Boolean(cur) });
    jumping.current = null;
    if (found) flash(messageId);
    else setError("الرسالة دي مش موجودة أو قديمة جدًا");
  };

  const onSearchPick = (hit: SearchHit) => void jumpTo(hit.message.conversationId, hit.message.id);

  const typingNames = activeId ? Object.values(state.typing[activeId] ?? {}).map((t) => t.name) : [];

  const filterUI = monitor ? (
    <div className="flex gap-2">
      <Select
        value={userFilter}
        onChange={(e) => {
          setUserFilter(e.target.value);
          void reloadList(e.target.value);
        }}
        className="h-9"
        aria-label="فلتر بموظف"
      >
        <option value="">كل الموظفين</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <button onClick={() => void reloadList(userFilter)} className="rounded-lg border border-border px-2.5 text-muted hover:bg-surface-2" aria-label="تحديث" title="تحديث">
        <RefreshCw size={15} />
      </button>
    </div>
  ) : null;

  const monitorBanner = monitor ? (
    <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-xs font-medium text-warning">
      <Eye size={14} /> مراقبة — بتشوف المحادثة كمدير (قراءة بس)، والموظفين مش بيظهرلهم إنك فتحتها
    </div>
  ) : null;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[460px] flex-col gap-3 lg:h-[calc(100dvh-4rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {monitor ? <Eye size={20} className="text-warning" /> : <MessageCircle size={20} className="text-primary" />}
            {monitor ? "مراقبة الشات" : "الشات"}
          </h1>
          {toolbar}
        </div>
        {!monitor && <PushToggle />}
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className={cn("w-full shrink-0 flex-col border-border md:flex md:w-80 md:border-l", activeId ? "hidden" : "flex")}>
          <ConversationList
            conversations={state.conversations}
            activeId={activeId}
            myId={me.id}
            presence={state.presence}
            typing={state.typing}
            tz={tz}
            now={now}
            senderName={senderName}
            onSelect={(id) => id !== activeId && navigate(id)}
            onNew={monitor ? undefined : () => setNewOpen(true)}
            onSearchPick={onSearchPick}
            searchAll={monitor}
            header={filterUI}
            emptyText={monitor ? "مفيش محادثات" : "مفيش محادثات لسه — ابدأ واحدة جديدة"}
          />
        </div>

        <div className={cn("min-w-0 flex-1 flex-col md:flex", activeId ? "flex" : "hidden")}>
          {active ? (
            <ConversationView
              key={active.id}
              conversation={active}
              data={activeData}
              me={me}
              readOnly={monitor}
              tz={tz}
              editWindowMin={editWindowMin}
              now={now}
              presence={state.presence}
              typingNames={typingNames}
              senderName={senderName}
              highlightId={highlight}
              loadingOlder={loadingOlder}
              error={error}
              banner={monitorBanner}
              onBack={() => navigate(null)}
              onLoadOlder={() => void loadOlder()}
              onSend={send}
              onEdit={edit}
              onDelete={(m) => void remove(m)}
              onTyping={() => void setTypingAction(active.id).catch(() => {})}
              onJump={(messageId) => void jumpTo(active.id, messageId)}
              onOpenInfo={() => setInfoOpen(true)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted">
              {error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : activeId ? (
                <p className="text-sm">بيحمّل...</p>
              ) : (
                <>
                  <MessageCircle size={40} className="opacity-30" />
                  <p className="text-sm">{monitor ? "اختار محادثة عشان تشوفها" : "اختار محادثة أو ابدأ واحدة جديدة"}</p>
                </>
              )}
            </div>
          )}
        </div>

        {infoOpen && active && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setInfoOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm border-r border-border shadow-xl lg:static lg:z-auto lg:w-80 lg:max-w-none lg:shrink-0 lg:shadow-none">
              <ConversationInfo conversation={active} me={me} users={users} presence={state.presence} readOnly={monitor} onClose={() => setInfoOpen(false)} />
            </div>
          </>
        )}
      </div>

      {newOpen && (
        <NewChatDialog
          users={users}
          presence={state.presence}
          onClose={() => setNewOpen(false)}
          onOpened={(c) => {
            dispatch({ type: "conversation.upsert", conversation: c });
            setNewOpen(false);
            navigate(c.id);
          }}
        />
      )}
    </div>
  );
}
