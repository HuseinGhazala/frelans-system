/**
 * حالة الشات في المتصفح: المحادثات والرسايل والحالة و"بيكتب".
 * كل الأحداث اللحظية (SSE) والإرسال المتفائل بيعدوا من هنا. صافي ومتغطي بتستات في reducer.test.ts.
 */
import { plainText } from "../../lib/chat/mentions";
import { messagePreview, type ChatEvent, type ChatMessage, type ConversationSummary, type PresenceStatus } from "../../lib/chat/types";
import { sortConversations } from "./utils";

/** رسالة في المتصفح: ممكن تكون لسه بتتبعت (id بيبدأ بـ tmp-) */
export type UIMessage = ChatMessage & { pending?: boolean };

export type ConvMessages = { items: UIMessage[]; hasMore: boolean };

export type ChatState = {
  myId: string;
  conversations: ConversationSummary[];
  messages: Record<string, ConvMessages | undefined>;
  presence: Record<string, PresenceStatus>;
  /** conversationId → userId → آخر مرة وصل "بيكتب" */
  typing: Record<string, Record<string, { name: string; at: number }> | undefined>;
};

export type ChatAction =
  | { type: "event"; event: ChatEvent; at: number }
  | { type: "conversations.set"; list: ConversationSummary[] }
  | { type: "conversation.upsert"; conversation: ConversationSummary }
  | { type: "conversation.remove"; conversationId: string }
  | { type: "conversation.readLocal"; conversationId: string }
  | { type: "messages.loaded"; conversationId: string; messages: ChatMessage[]; hasMore: boolean; older: boolean }
  | { type: "message.optimistic"; message: UIMessage }
  | { type: "message.confirmed"; tempId: string; message: ChatMessage }
  | { type: "message.failed"; tempId: string; conversationId: string }
  | { type: "message.upsert"; message: ChatMessage }
  | { type: "typing.prune"; now: number };

export const TYPING_TTL_MS = 5000;

export function initialChatState(myId: string, conversations: ConversationSummary[]): ChatState {
  return { myId, conversations: sortConversations(conversations), messages: {}, presence: {}, typing: {} };
}

const byTime = (a: ChatMessage, b: ChatMessage) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** يضيف أو يبدّل رسالة (dedupe بالـ id) ويحافظ على الترتيب */
export function upsertMessage(items: UIMessage[], m: UIMessage): UIMessage[] {
  const i = items.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = items.slice();
    next[i] = m;
    return next;
  }
  const last = items[items.length - 1];
  if (!last || byTime(last, m) <= 0) return [...items, m];
  return [...items, m].sort(byTime);
}

/** يدمج صفحة رسايل (أقدم أو جديدة) من غير تكرار */
export function mergeMessages(items: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const map = new Map(items.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(byTime);
}

function lastMessageOf(m: ChatMessage): NonNullable<ConversationSummary["lastMessage"]> {
  return { id: m.id, senderId: m.senderId, preview: plainText(messagePreview(m)), createdAt: m.createdAt };
}

function mapConv(state: ChatState, id: string, fn: (c: ConversationSummary) => ConversationSummary): ConversationSummary[] {
  let changed = false;
  const list = state.conversations.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  return changed ? list : state.conversations;
}

function mapItems(state: ChatState, conversationId: string, fn: (items: UIMessage[]) => UIMessage[]): ChatState["messages"] {
  const cur = state.messages[conversationId];
  if (!cur) return state.messages;
  return { ...state.messages, [conversationId]: { ...cur, items: fn(cur.items) } };
}

/** رسالة جديدة: في القائمة + آخر رسالة في المحادثة + غير المقروء */
function addMessage(state: ChatState, m: UIMessage): ChatState {
  const messages = mapItems(state, m.conversationId, (items) => upsertMessage(items, m));
  const mine = m.senderId === state.myId;
  const isNewer = (c: ConversationSummary) => !c.lastMessage || Date.parse(c.lastMessage.createdAt) <= Date.parse(m.createdAt);
  const conversations = sortConversations(
    mapConv(state, m.conversationId, (c) => {
      const alreadyCounted = c.lastMessage?.id === m.id;
      return {
        ...c,
        lastMessage: isNewer(c) ? lastMessageOf(m) : c.lastMessage,
        lastMessageAt: Date.parse(m.createdAt) > Date.parse(c.lastMessageAt) ? m.createdAt : c.lastMessageAt,
        unread: !mine && c.isMember && !alreadyCounted && !m.pending ? c.unread + 1 : mine ? 0 : c.unread,
        members: mine && !m.pending ? c.members.map((x) => (x.id === state.myId ? { ...x, lastReadAt: maxIso(x.lastReadAt, m.createdAt) } : x)) : c.members,
      };
    }),
  );
  const typingConv = state.typing[m.conversationId];
  const typing = typingConv?.[m.senderId] ? { ...state.typing, [m.conversationId]: omit(typingConv, m.senderId) } : state.typing;
  return { ...state, messages, conversations, typing };
}

/** رسالة اتعدلت (أو اتمسحت عند الأدمن): نبدّلها، ونحدّث المعاينة لو هي الأخيرة، والردود عليها */
function replaceMessage(state: ChatState, m: ChatMessage): ChatState {
  const messages = mapItems(state, m.conversationId, (items) =>
    items.map((x) => {
      if (x.id === m.id) return m;
      if (x.replyTo?.id === m.id) return { ...x, replyTo: { ...x.replyTo, body: plainText(m.body).slice(0, 200), deleted: Boolean(m.deletedAt) } };
      return x;
    }),
  );
  const conversations = mapConv(state, m.conversationId, (c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: lastMessageOf(m) } : c));
  return { ...state, messages, conversations };
}

function maxIso(a: string | null, b: string): string {
  return a && Date.parse(a) >= Date.parse(b) ? a : b;
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

function applyEvent(state: ChatState, event: ChatEvent, at: number): ChatState {
  switch (event.type) {
    case "message.created":
      return addMessage(state, event.message);
    case "message.updated":
      return replaceMessage(state, event.message);
    case "message.deleted": {
      const deletedAt = new Date(at).toISOString();
      const cur = state.messages[event.conversationId]?.items.find((x) => x.id === event.messageId);
      const conversations = mapConv(state, event.conversationId, (c) =>
        c.lastMessage?.id === event.messageId ? { ...c, lastMessage: { ...c.lastMessage, preview: messagePreview({ body: "", deletedAt, attachments: [] }) } } : c,
      );
      const messages = mapItems(state, event.conversationId, (items) =>
        items.map((x) => {
          if (x.id === event.messageId) return { ...x, body: "", attachments: [], deletedAt, edits: undefined };
          if (x.replyTo?.id === event.messageId) return { ...x, replyTo: { ...x.replyTo, body: "", deleted: true } };
          return x;
        }),
      );
      // رسالة من حد تاني كانت لسه ما اتقرتش واتمسحت → تنقص من غير المقروء
      const unreadFix =
        cur && cur.senderId !== state.myId && !cur.deletedAt
          ? conversations.map((c) => {
              if (c.id !== event.conversationId) return c;
              const me = c.members.find((x) => x.id === state.myId);
              const read = me?.lastReadAt && Date.parse(me.lastReadAt) >= Date.parse(cur.createdAt);
              return !read && c.unread > 0 ? { ...c, unread: c.unread - 1 } : c;
            })
          : conversations;
      return { ...state, messages, conversations: unreadFix };
    }
    case "conversation.updated":
      return upsertConversation(state, event.conversation);
    case "conversation.removed":
      return removeConversation(state, event.conversationId);
    case "read": {
      const conversations = mapConv(state, event.conversationId, (c) => ({
        ...c,
        unread: event.userId === state.myId ? 0 : c.unread,
        members: c.members.map((x) => (x.id === event.userId ? { ...x, lastReadAt: maxIso(x.lastReadAt, event.lastReadAt) } : x)),
      }));
      return conversations === state.conversations ? state : { ...state, conversations };
    }
    case "typing": {
      if (event.userId === state.myId) return state;
      const conv = state.typing[event.conversationId] ?? {};
      return { ...state, typing: { ...state.typing, [event.conversationId]: { ...conv, [event.userId]: { name: event.name, at } } } };
    }
    case "presence":
      if (state.presence[event.userId] === event.status) return state;
      return { ...state, presence: { ...state.presence, [event.userId]: event.status } };
    case "hello":
      return { ...state, presence: { ...event.presence } };
  }
}

function upsertConversation(state: ChatState, conversation: ConversationSummary): ChatState {
  const exists = state.conversations.some((c) => c.id === conversation.id);
  const list = exists ? state.conversations.map((c) => (c.id === conversation.id ? conversation : c)) : [...state.conversations, conversation];
  return { ...state, conversations: sortConversations(list) };
}

function removeConversation(state: ChatState, conversationId: string): ChatState {
  const messages = { ...state.messages };
  delete messages[conversationId];
  return { ...state, conversations: state.conversations.filter((c) => c.id !== conversationId), messages };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "event":
      return applyEvent(state, action.event, action.at);
    case "conversations.set":
      return { ...state, conversations: sortConversations(action.list) };
    case "conversation.upsert":
      return upsertConversation(state, action.conversation);
    case "conversation.remove":
      return removeConversation(state, action.conversationId);
    case "conversation.readLocal": {
      const conversations = mapConv(state, action.conversationId, (c) => (c.unread ? { ...c, unread: 0 } : c));
      return conversations === state.conversations ? state : { ...state, conversations };
    }
    case "messages.loaded": {
      const cur = state.messages[action.conversationId];
      let items: UIMessage[];
      if (action.older && cur) items = mergeMessages(cur.items, action.messages);
      else {
        // تحميل من الأول: نحتفظ باللي لسه بيتبعت
        const pending = cur?.items.filter((m) => m.pending) ?? [];
        items = mergeMessages(action.messages, pending);
      }
      return { ...state, messages: { ...state.messages, [action.conversationId]: { items, hasMore: action.hasMore } } };
    }
    case "message.optimistic":
      return addMessage(state, action.message);
    case "message.confirmed": {
      const m = action.message;
      const without: ChatState = {
        ...state,
        messages: mapItems(state, m.conversationId, (items) => items.filter((x) => x.id !== action.tempId)),
        conversations: mapConv(state, m.conversationId, (c) => (c.lastMessage?.id === action.tempId ? { ...c, lastMessage: lastMessageOf(m) } : c)),
      };
      return addMessage(without, m);
    }
    case "message.failed": {
      const messages = mapItems(state, action.conversationId, (items) => items.filter((m) => m.id !== action.tempId));
      return { ...state, messages };
    }
    case "message.upsert":
      return replaceMessage(state, action.message);
    case "typing.prune": {
      let changed = false;
      const typing: ChatState["typing"] = {};
      for (const [convId, users] of Object.entries(state.typing)) {
        if (!users) continue;
        const kept: Record<string, { name: string; at: number }> = {};
        for (const [uid, t] of Object.entries(users)) {
          if (action.now - t.at < TYPING_TTL_MS) kept[uid] = t;
          else changed = true;
        }
        if (Object.keys(kept).length) typing[convId] = kept;
        else if (Object.keys(users).length) changed = true;
      }
      return changed ? { ...state, typing } : state;
    }
  }
}
