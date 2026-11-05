import { useSyncExternalStore } from "react";
import { applyChatEvent, emptyChatState, unreadTotal, upsertConversation, type ChatListState } from "../core/chat-state";
import type { StreamStatus } from "../core/chat-stream";
import type { ChatEvent, ChatMessage, ChatUser, ConversationSummary } from "../core/chat-types";
import type { RasedApi } from "../preload";

/**
 * حالة الشات في الواجهة. القايمة جاية من الـ main (snapshot + نفس الأحداث بنفس الـ reducer)،
 * والرسايل لكل محادثة بتتحمّل هنا لما الموظف يفتحها.
 */
export type Thread = { items: ChatMessage[]; hasMore: boolean; loading: boolean; loaded: boolean; error: string | null };
export type ChatStoreState = {
  status: StreamStatus;
  list: ChatListState;
  loaded: boolean;
  threads: Record<string, Thread>;
  /** conversationId → userId → {name, until} */
  typing: Record<string, Record<string, { name: string; until: number }>>;
  users: ChatUser[] | null;
};

const TYPING_MS = 5000;
const emptyThread = (): Thread => ({ items: [], hasMore: false, loading: false, loaded: false, error: null });

export class ChatStore {
  private s: ChatStoreState = { status: "closed", list: emptyChatState(), loaded: false, threads: {}, typing: {}, users: null };
  private listeners = new Set<() => void>();
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: RasedApi["chat"]) {
    api.onSnapshot((snap) => {
      // snapshot فاضي = تسجيل خروج
      if (!snap.state.me && snap.state.conversations.length === 0) this.set({ status: snap.status, list: snap.state, loaded: false, threads: {}, typing: {}, users: null });
      else this.set({ ...this.s, status: snap.status, list: snap.state, loaded: true });
    });
    api.onStatus((status) => this.set({ ...this.s, status }));
    api.onEvent((ev) => this.apply(ev));
    void api.snapshot().then((snap) => this.set({ ...this.s, status: snap.status, list: snap.state, loaded: snap.state.conversations.length > 0 }));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.s;

  private set(next: ChatStoreState) {
    this.s = next;
    for (const fn of this.listeners) fn();
  }

  get unread() {
    return unreadTotal(this.s.list);
  }

  conversation(id: string | null): ConversationSummary | undefined {
    return id ? this.s.list.conversations.find((c) => c.id === id) : undefined;
  }

  upsert(conv: ConversationSummary) {
    this.set({ ...this.s, list: upsertConversation(this.s.list, conv) });
  }

  remove(conversationId: string) {
    this.set({ ...this.s, list: { ...this.s.list, conversations: this.s.list.conversations.filter((c) => c.id !== conversationId) } });
  }

  private patchThread(id: string, fn: (t: Thread) => Thread) {
    const t = this.s.threads[id];
    if (!t) return;
    this.set({ ...this.s, threads: { ...this.s.threads, [id]: fn(t) } });
  }

  /** رسالة جديدة أو متعدلة: تتحط مكانها (أو في الآخر) */
  upsertMessage(m: ChatMessage) {
    this.patchThread(m.conversationId, (t) => {
      const i = t.items.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const items = [...t.items];
        items[i] = m;
        return { ...t, items };
      }
      return { ...t, items: [...t.items, m].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) };
    });
  }

  private apply(ev: ChatEvent) {
    const list = applyChatEvent(this.s.list, ev);
    this.s = { ...this.s, list, loaded: this.s.loaded || ev.type === "hello" };
    switch (ev.type) {
      case "message.created":
      case "message.updated": {
        this.upsertMessage(ev.message);
        if (ev.type === "message.created") this.clearTyping(ev.message.conversationId, ev.message.senderId);
        break;
      }
      case "message.deleted":
        this.patchThread(ev.conversationId, (t) => ({
          ...t,
          items: t.items.map((m) => (m.id === ev.messageId ? { ...m, body: "", attachments: [], deletedAt: new Date().toISOString() } : m)),
        }));
        break;
      case "typing": {
        if (ev.userId === list.me) break;
        const conv = { ...(this.s.typing[ev.conversationId] ?? {}), [ev.userId]: { name: ev.name, until: Date.now() + TYPING_MS } };
        this.s = { ...this.s, typing: { ...this.s.typing, [ev.conversationId]: conv } };
        this.scheduleTypingCleanup();
        break;
      }
      case "conversation.removed": {
        const threads = { ...this.s.threads };
        delete threads[ev.conversationId];
        this.s = { ...this.s, threads };
        break;
      }
    }
    this.set({ ...this.s });
  }

  private clearTyping(conversationId: string, userId: string) {
    const conv = this.s.typing[conversationId];
    if (!conv?.[userId]) return;
    const next = { ...conv };
    delete next[userId];
    this.s = { ...this.s, typing: { ...this.s.typing, [conversationId]: next } };
  }

  private scheduleTypingCleanup() {
    if (this.typingTimer) return;
    this.typingTimer = setTimeout(() => {
      this.typingTimer = null;
      const now = Date.now();
      let left = false;
      const typing: ChatStoreState["typing"] = {};
      for (const [cid, users] of Object.entries(this.s.typing)) {
        const keep = Object.fromEntries(Object.entries(users).filter(([, u]) => u.until > now));
        if (Object.keys(keep).length) {
          typing[cid] = keep;
          left = true;
        }
      }
      this.set({ ...this.s, typing });
      if (left) this.scheduleTypingCleanup();
    }, 1000);
  }

  // ───────────── التحميل ─────────────

  async loadList() {
    try {
      const conversations = await this.api.conversations();
      this.set({ ...this.s, list: { ...this.s.list, conversations }, loaded: true });
    } catch {
      this.set({ ...this.s, loaded: true });
    }
  }

  async loadUsers(force = false) {
    if (this.s.users && !force) return this.s.users;
    const users = await this.api.users();
    this.set({ ...this.s, users });
    return users;
  }

  /** أول تحميل لمحادثة (أو تحديث بعد ما الاتصال رجع) */
  async openThread(id: string, refresh = false) {
    const existing = this.s.threads[id];
    if (existing?.loading || (existing?.loaded && !refresh)) return;
    this.set({ ...this.s, threads: { ...this.s.threads, [id]: { ...(existing ?? emptyThread()), loading: true, error: null } } });
    try {
      const r = await this.api.messages(id, null);
      this.patchThread(id, (t) => {
        // دمج: رسايل وصلت بالـ SSE أثناء التحميل (أو أقدم كانت متحمّلة) تفضل، ونسخة السيرفر هي الأحدث
        const merged = new Map([...t.items, ...r.messages].map((m) => [m.id, m]));
        const items = [...merged.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        return { items, hasMore: t.loaded ? t.hasMore : r.hasMore, loading: false, loaded: true, error: null };
      });
    } catch (e) {
      this.patchThread(id, (t) => ({ ...t, loading: false, error: (e as Error).message }));
    }
  }

  async loadOlder(id: string) {
    const t = this.s.threads[id];
    if (!t || t.loading || !t.hasMore || t.items.length === 0) return;
    this.patchThread(id, (x) => ({ ...x, loading: true }));
    try {
      const r = await this.api.messages(id, t.items[0].id);
      this.patchThread(id, (x) => {
        const ids = new Set(x.items.map((m) => m.id));
        return { ...x, items: [...r.messages.filter((m) => !ids.has(m.id)), ...x.items], hasMore: r.hasMore, loading: false };
      });
    } catch (e) {
      this.patchThread(id, (x) => ({ ...x, loading: false, error: (e as Error).message }));
    }
  }

  /** بعد ما الاتصال يرجع: المحادثات المفتوحة تتحدث عشان أي رسايل فاتت */
  refreshLoadedThreads() {
    for (const id of Object.keys(this.s.threads)) void this.openThread(id, true);
  }
}

export function useChatStore(store: ChatStore): ChatStoreState {
  return useSyncExternalStore(store.subscribe, store.get);
}
