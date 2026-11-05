import { contextBridge, ipcRenderer } from "electron";
import type { TaskCard, TaskRef, ViewModel } from "../core/types";
import type { ChatSnapshot } from "../main/chat";
import type { StreamStatus } from "../core/chat-stream";
import type { AttachmentKind, ChatAttachment, ChatEvent, ChatMessage, ChatUser, ConversationSummary, SearchResult } from "../core/chat-types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** طلبات الشات بترجع {ok,data}؛ هنا بنحوّل الخطأ لـ Error برسالة السيرفر نفسها */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!r.ok) throw Object.assign(new Error(r.error), { status: r.status });
  return r.data;
}

function on<T>(channel: string, fn: (payload: T) => void) {
  const listener = (_: unknown, payload: T) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

/**
 * "افتح المحادثة دي" (من إشعار) ممكن توصل قبل ما الواجهة تجهز (الشباك لسه اتفتح) —
 * بنحتفظ بآخر طلب لحد ما حد يسمع.
 */
let pendingOpen: { id: string | null } | null = null;
const openListeners = new Set<(id: string | null) => void>();
ipcRenderer.on("chat:open", (_: unknown, id: string | null) => {
  if (openListeners.size === 0) pendingOpen = { id };
  for (const fn of openListeners) fn(id);
});

const chat = {
  snapshot: () => call<ChatSnapshot>("chat:snapshot"),
  conversations: () => call<ConversationSummary[]>("chat:conversations"),
  conversation: (id: string) => call<ConversationSummary>("chat:conversation", id),
  messages: (id: string, before: string | null = null) => call<{ messages: ChatMessage[]; hasMore: boolean }>("chat:messages", id, before),
  send: (id: string, input: { body: string; replyToId: string | null; attachmentIds: string[] }) => call<ChatMessage>("chat:send", id, input),
  edit: (messageId: string, body: string) => call<ChatMessage>("chat:edit", messageId, body),
  remove: (messageId: string) => call<void>("chat:delete", messageId),
  read: (id: string) => call<void>("chat:read", id),
  typing: (id: string) => call<void>("chat:typing", id),
  openDirect: (userId: string) => call<ConversationSummary>("chat:openDirect", userId),
  createGroup: (name: string, memberIds: string[]) => call<ConversationSummary>("chat:createGroup", name, memberIds),
  renameGroup: (id: string, name: string) => call<ConversationSummary>("chat:renameGroup", id, name),
  addMembers: (id: string, userIds: string[]) => call<ConversationSummary>("chat:addMembers", id, userIds),
  removeMember: (id: string, userId: string) => call<void>("chat:removeMember", id, userId),
  users: () => call<ChatUser[]>("chat:users"),
  search: (q: string, conversationId: string | null = null) => call<SearchResult[]>("chat:search", q, conversationId),
  upload: (file: { name: string; mime: string; data: Uint8Array; kind: AttachmentKind | null; durationSec: number | null }) => call<ChatAttachment>("chat:upload", file),
  attachment: (id: string) => call<{ mime: string; data: Uint8Array }>("chat:attachment", id),
  saveAttachment: (id: string, name: string) => call<boolean>("chat:saveAttachment", id, name),
  onEvent: (fn: (ev: ChatEvent) => void) => on("chat:event", fn),
  onSnapshot: (fn: (s: ChatSnapshot) => void) => on("chat:snapshot", fn),
  onStatus: (fn: (s: StreamStatus) => void) => on("chat:status", fn),
  /** الموظف ضغط على إشعار (أو "الشات" من شريط المهام) */
  onOpen: (fn: (conversationId: string | null) => void) => {
    openListeners.add(fn);
    if (pendingOpen) {
      const { id } = pendingOpen;
      pendingOpen = null;
      fn(id);
    }
    return () => {
      openListeners.delete(fn);
    };
  },
};

/** الحاجات الوحيدة اللي الواجهة تقدر تعملها — مفيش أي وصول مباشر للنظام */
const api = {
  view: (): Promise<ViewModel> => ipcRenderer.invoke("view"),
  onView: (fn: (v: ViewModel) => void) => {
    const listener = (_: unknown, v: ViewModel) => fn(v);
    ipcRenderer.on("view", listener);
    return () => {
      ipcRenderer.removeListener("view", listener);
    };
  },
  login: (serverUrl: string, email: string, password: string): Promise<void> => ipcRenderer.invoke("login", serverUrl, email, password),
  consent: (): Promise<void> => ipcRenderer.invoke("consent"),
  checkIn: (): Promise<void> => ipcRenderer.invoke("checkIn"),
  checkOut: (): Promise<void> => ipcRenderer.invoke("checkOut"),
  startBreak: (): Promise<void> => ipcRenderer.invoke("startBreak"),
  endBreak: (): Promise<void> => ipcRenderer.invoke("endBreak"),
  logout: (): Promise<void> => ipcRenderer.invoke("logout"),
  openDashboard: (): Promise<void> => ipcRenderer.invoke("openDashboard"),
  tasks: (): Promise<{ cards: TaskCard[]; error: string | null }> => ipcRenderer.invoke("tasks"),
  setTask: (task: TaskRef | null): Promise<void> => ipcRenderer.invoke("setTask", task),
  chat,
};

export type RasedApi = typeof api;
contextBridge.exposeInMainWorld("rased", api);
