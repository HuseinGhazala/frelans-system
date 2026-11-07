import { messagePreview, type ChatEvent, type ChatMessage, type ConversationSummary, type PresenceStatus } from "./chat-types";

/**
 * حالة قائمة المحادثات (من غير Electron ولا React) — بيستخدمها البرنامج (main) عشان عدد غير المقروء
 * والإشعارات، والواجهة عشان القائمة. كل الدوال بترجع نسخة جديدة (immutable).
 */
export type ChatListState = {
  me: string | null;
  conversations: ConversationSummary[];
  presence: Record<string, PresenceStatus>;
};

export const emptyChatState = (): ChatListState => ({ me: null, conversations: [], presence: {} });

function sorted(list: ConversationSummary[]) {
  return [...list].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

function patch(state: ChatListState, id: string, fn: (c: ConversationSummary) => ConversationSummary, resort = false): ChatListState {
  let hit = false;
  const list = state.conversations.map((c) => {
    if (c.id !== id) return c;
    hit = true;
    return fn(c);
  });
  if (!hit) return state;
  return { ...state, conversations: resort ? sorted(list) : list };
}

export function setConversations(state: ChatListState, list: ConversationSummary[]): ChatListState {
  return { ...state, conversations: sorted(list) };
}

export function upsertConversation(state: ChatListState, conv: ConversationSummary): ChatListState {
  const rest = state.conversations.filter((c) => c.id !== conv.id);
  return { ...state, conversations: sorted([...rest, conv]) };
}

/** بيطبّق حدث SSE على الحالة */
export function applyChatEvent(state: ChatListState, ev: ChatEvent): ChatListState {
  switch (ev.type) {
    case "hello":
      return { ...state, me: ev.userId, presence: { ...ev.presence } };
    case "presence":
      return { ...state, presence: { ...state.presence, [ev.userId]: ev.status } };
    case "conversation.updated":
      return upsertConversation(state, ev.conversation);
    case "conversation.removed":
      return { ...state, conversations: state.conversations.filter((c) => c.id !== ev.conversationId) };
    case "message.created": {
      const m = ev.message;
      const mine = m.senderId === state.me;
      return patch(
        state,
        m.conversationId,
        (c) => ({
          ...c,
          lastMessage: { id: m.id, senderId: m.senderId, preview: messagePreview(m), createdAt: m.createdAt },
          lastMessageAt: Date.parse(m.createdAt) > Date.parse(c.lastMessageAt) ? m.createdAt : c.lastMessageAt,
          // اللي بعت قرا المحادثة لحد رسالته (السيرفر بيعمل كده)
          unread: mine ? 0 : m.deletedAt ? c.unread : c.unread + 1,
          members: mine ? c.members.map((x) => (x.id === state.me ? { ...x, lastReadAt: m.createdAt } : x)) : c.members,
        }),
        true,
      );
    }
    case "message.updated":
      return patch(state, ev.message.conversationId, (c) =>
        c.lastMessage?.id === ev.message.id ? { ...c, lastMessage: { ...c.lastMessage, preview: messagePreview(ev.message) } } : c,
      );
    case "message.deleted":
      return patch(state, ev.conversationId, (c) =>
        c.lastMessage?.id === ev.messageId ? { ...c, lastMessage: { ...c.lastMessage, preview: "الرسالة اتمسحت" } } : c,
      );
    case "read":
      return patch(state, ev.conversationId, (c) => ({
        ...c,
        unread: ev.userId === state.me ? 0 : c.unread,
        members: c.members.map((x) => (x.id === ev.userId ? { ...x, lastReadAt: ev.lastReadAt } : x)),
      }));
    case "typing":
      return state;
  }
}

/** الحدث ده عن محادثة لسه مش عندنا؟ (لازم نجيب القائمة من السيرفر تاني) */
export function isUnknownConversation(state: ChatListState, ev: ChatEvent): boolean {
  if (ev.type !== "message.created") return false;
  return !state.conversations.some((c) => c.id === ev.message.conversationId);
}

export function unreadTotal(state: ChatListState): number {
  return state.conversations.reduce((sum, c) => sum + (c.isMember ? Math.max(0, c.unread) : 0), 0);
}

export function badgeLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/**
 * نبعت إشعار Windows للرسالة دي؟
 * - مش رسالتي ولا محذوفة، والشباك مش قدام الموظف.
 * - القناة العامة: بس لو اتعمله منشن.
 */
export function shouldNotify(message: ChatMessage, ctx: { me: string | null; conversation: ConversationSummary | undefined; windowFocused: boolean }): boolean {
  if (!ctx.me || message.senderId === ctx.me) return false;
  if (message.deletedAt) return false;
  if (ctx.windowFocused) return false;
  if (ctx.conversation?.type === "GENERAL") return message.mentionIds.includes(ctx.me);
  return true;
}

export function notificationText(message: ChatMessage, conversation: ConversationSummary | undefined, me: string | null): { title: string; body: string } {
  const sender = conversation?.members.find((m) => m.id === message.senderId)?.name ?? "رسالة جديدة";
  const mentioned = me != null && message.mentionIds.includes(me);
  let title = sender;
  if (conversation && conversation.type !== "DIRECT") title = `${sender} • ${conversation.title}`;
  if (mentioned) title = `${title} (منشن)`;
  return { title, body: messagePreview(message) || "رسالة جديدة" };
}

/** مين قرا رسالتي (للعلامة ✓✓): الأعضاء غيري اللي آخر قراءة ليهم بعد وقت الرسالة */
export function readersOf(message: Pick<ChatMessage, "senderId" | "createdAt">, conversation: Pick<ConversationSummary, "members">): { read: number; total: number } {
  const others = conversation.members.filter((m) => m.id !== message.senderId);
  const at = Date.parse(message.createdAt);
  const read = others.filter((m) => m.lastReadAt && Date.parse(m.lastReadAt) >= at).length;
  return { read, total: others.length };
}

/**
 * صاحب الرسالة يقدر يعدّل أو يمسح لحد ما مدة التعديل تخلص (من إعدادات الشات على السيرفر).
 * editWindowMin = null يعني السيرفر ما قالش (نسخة قديمة) → نسيب الزراير والسيرفر هو اللي يرفض.
 */
export function withinEditWindow(createdAt: string, now: number, editWindowMin: number | null): boolean {
  if (editWindowMin == null) return true;
  return now - Date.parse(createdAt) < editWindowMin * 60_000;
}
