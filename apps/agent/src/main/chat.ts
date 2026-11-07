import { app, dialog, ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";
import { ApiError, type Session } from "../core/controller";
import {
  applyChatEvent,
  emptyChatState,
  isUnknownConversation,
  notificationText,
  setConversations,
  shouldNotify,
  unreadTotal,
  upsertConversation,
  type ChatListState,
} from "../core/chat-state";
import { ChatStream, type StreamStatus } from "../core/chat-stream";
import type {
  AttachmentKind,
  ChatAttachment,
  ChatEvent,
  ChatMessage,
  ChatUser,
  ConversationSummary,
  SearchResult,
} from "../core/chat-types";
import { request } from "./api";

/** أقصى حجم ملف بنقبله من الواجهة قبل ما نبعته (السيرفر عنده حده الحقيقي من الإعدادات) */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export type ChatSnapshot = { status: StreamStatus; state: ChatListState; unread: number };

type Deps = {
  session: Session;
  window: () => BrowserWindow | null;
  /** يفتح الشباك على المحادثة دي (ضغطة على إشعار) */
  openConversation: (conversationId: string) => void;
  onUnread: (n: number) => void;
  icon: string;
};

/**
 * الشات في الـ main process: الاتصال اللحظي (SSE)، قايمة المحادثات وعدد غير المقروء،
 * إشعارات Windows، وكل طلبات الـ API (التوكن بيفضل هنا وما بيروحش للواجهة).
 */
export class ChatMain {
  private state: ChatListState = emptyChatState();
  private stream: ChatStream;
  private running = false;
  private refreshing: Promise<void> | null = null;
  private lastUnread = -1;
  /** لازم نحتفظ بالإشعارات عشان الـ GC ما يمسحهاش قبل الضغط عليها (Windows) */
  private notifications = new Set<Notification>();

  constructor(private deps: Deps) {
    this.stream = new ChatStream({
      url: () => this.url("/stream"),
      token: () => deps.session.token,
      fetch: (url, init) => fetch(url, init),
      onEvent: (ev) => this.handleEvent(ev),
      onStatus: (s) => this.send("chat:status", s),
    });
  }

  private url(p: string) {
    return `${this.deps.session.serverUrl.replace(/\/$/, "")}/api/agent/v1/chat${p}`;
  }

  private call<T>(method: string, p: string, body?: unknown): Promise<T> {
    return request<T>(this.url(p), { method, token: this.deps.session.token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  private send(channel: string, payload: unknown) {
    const win = this.deps.window();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.stream.start();
  }

  /** بعد تسجيل الخروج: نقفل الاتصال ونمسح كل حاجة */
  stop() {
    if (!this.running) return;
    this.running = false;
    this.stream.stop();
    this.state = emptyChatState();
    for (const n of this.notifications) n.close();
    this.notifications.clear();
    this.emitUnread();
    this.send("chat:snapshot", this.snapshot());
  }

  reconnectNow() {
    this.stream.reconnectNow();
  }

  snapshot(): ChatSnapshot {
    return { status: this.stream.state, state: this.state, unread: unreadTotal(this.state) };
  }

  private emitUnread() {
    const n = unreadTotal(this.state);
    if (n === this.lastUnread) return;
    this.lastUnread = n;
    this.deps.onUnread(n);
  }

  /** نجيب القايمة من السيرفر (بعد كل اتصال، أو لو جه حدث عن محادثة مش عندنا) */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const { conversations } = await this.call<{ conversations: ConversationSummary[] }>("GET", "/conversations");
        if (!this.running) return;
        this.state = setConversations(this.state, conversations);
        this.emitUnread();
        this.send("chat:snapshot", this.snapshot());
      } catch (e) {
        console.error("chat refresh failed", e);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private handleEvent(ev: ChatEvent) {
    if (!this.running) return;
    const unknown = isUnknownConversation(this.state, ev);
    this.state = applyChatEvent(this.state, ev);
    this.send("chat:event", ev);
    if (ev.type === "hello" || unknown) void this.refresh();
    if (ev.type === "message.created") this.maybeNotify(ev.message);
    this.emitUnread();
  }

  private windowFocused() {
    const win = this.deps.window();
    return Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused());
  }

  private maybeNotify(message: ChatMessage) {
    const conversation = this.state.conversations.find((c) => c.id === message.conversationId);
    if (!shouldNotify(message, { me: this.state.me, conversation, windowFocused: this.windowFocused() })) return;
    const win = this.deps.window();
    if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
    if (!Notification.isSupported()) return;
    const { title, body } = notificationText(message, conversation, this.state.me);
    const n = new Notification({ title, body, icon: this.deps.icon });
    this.notifications.add(n);
    const forget = () => this.notifications.delete(n);
    n.on("click", () => {
      forget();
      this.deps.openConversation(message.conversationId);
    });
    n.on("close", forget);
    n.show();
  }

  // ───────────── طلبات الواجهة ─────────────

  async conversations() {
    await this.refresh();
    return this.state.conversations;
  }

  async conversation(id: string) {
    const { conversation } = await this.call<{ conversation: ConversationSummary }>("GET", `/conversations/${enc(id)}`);
    this.upsert(conversation);
    return conversation;
  }

  private upsert(conversation: ConversationSummary) {
    this.state = upsertConversation(this.state, conversation);
    this.emitUnread();
  }

  messages(id: string, before: string | null) {
    const q = before ? `?before=${enc(before)}` : "";
    return this.call<{ messages: ChatMessage[]; hasMore: boolean }>("GET", `/conversations/${enc(id)}/messages${q}`);
  }

  async sendMessage(id: string, input: { body: string; replyToId: string | null; attachmentIds: string[] }) {
    const { message } = await this.call<{ message: ChatMessage }>("POST", `/conversations/${enc(id)}/messages`, input);
    return message;
  }

  async editMessage(id: string, body: string) {
    const { message } = await this.call<{ message: ChatMessage }>("PATCH", `/messages/${enc(id)}`, { body });
    return message;
  }

  async deleteMessage(id: string) {
    await this.call("DELETE", `/messages/${enc(id)}`);
  }

  async markRead(id: string) {
    await this.call("POST", `/conversations/${enc(id)}/read`, {});
  }

  async typing(id: string) {
    await this.call("POST", `/conversations/${enc(id)}/typing`, {});
  }

  async openDirect(userId: string) {
    const { conversation } = await this.call<{ conversation: ConversationSummary }>("POST", "/direct", { userId });
    this.upsert(conversation);
    return conversation;
  }

  async createGroup(name: string, memberIds: string[]) {
    const { conversation } = await this.call<{ conversation: ConversationSummary }>("POST", "/groups", { name, memberIds });
    this.upsert(conversation);
    return conversation;
  }

  async renameGroup(id: string, name: string) {
    const { conversation } = await this.call<{ conversation: ConversationSummary }>("PATCH", `/conversations/${enc(id)}`, { name });
    this.upsert(conversation);
    return conversation;
  }

  async addMembers(id: string, userIds: string[]) {
    const { conversation } = await this.call<{ conversation: ConversationSummary }>("POST", `/conversations/${enc(id)}/members`, { userIds });
    this.upsert(conversation);
    return conversation;
  }

  async removeMember(id: string, userId: string) {
    await this.call("DELETE", `/conversations/${enc(id)}/members/${enc(userId)}`);
    if (userId === this.state.me) {
      this.state = { ...this.state, conversations: this.state.conversations.filter((c) => c.id !== id) };
      this.emitUnread();
    }
  }

  /** مدة التعديل والحذف من السيرفر (null لو سيرفر قديم مفيهوش الـ endpoint) */
  async config(): Promise<{ editWindowMin: number | null }> {
    try {
      const { editWindowMin } = await this.call<{ editWindowMin: number }>("GET", "/config");
      return { editWindowMin: typeof editWindowMin === "number" ? editWindowMin : null };
    } catch {
      return { editWindowMin: null };
    }
  }

  async users() {
    const { users } = await this.call<{ users: ChatUser[] }>("GET", "/users");
    return users;
  }

  async search(q: string, conversationId: string | null) {
    const params = new URLSearchParams({ q });
    if (conversationId) params.set("conversationId", conversationId);
    const { results } = await this.call<{ results: SearchResult[] }>("GET", `/search?${params}`);
    return results;
  }

  async upload(file: { name: string; mime: string; data: Uint8Array; kind: AttachmentKind | null; durationSec: number | null }) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(file.data)], { type: file.mime || "application/octet-stream" }), file.name);
    if (file.kind) form.set("kind", file.kind);
    if (file.durationSec) form.set("durationSec", String(file.durationSec));
    const res = await fetch(this.url("/attachments"), {
      method: "POST",
      headers: { authorization: `Bearer ${this.deps.session.token}` },
      body: form,
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; attachment?: ChatAttachment };
    if (!res.ok || !data.attachment) throw new ApiError(data.error ?? `خطأ من السيرفر (${res.status})`, res.status);
    return data.attachment;
  }

  /** بيجيب الملف بالتوكن ويرجّع البايتات — الواجهة بتعمل منها blob: URL */
  async attachment(id: string, download = false) {
    const res = await fetch(this.url(`/attachments/${enc(id)}${download ? "?download=1" : ""}`), {
      headers: { authorization: `Bearer ${this.deps.session.token}` },
      signal: AbortSignal.timeout(5 * 60_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(data.error ?? (res.status === 404 || res.status === 410 ? "الملف مش موجود أو اتمسح" : `خطأ من السيرفر (${res.status})`), res.status);
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) throw new ApiError("الملف كبير جدًا", 413);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > MAX_DOWNLOAD_BYTES) throw new ApiError("الملف كبير جدًا", 413);
    return { mime: res.headers.get("content-type") ?? "application/octet-stream", data };
  }

  /** حفظ مرفق على الجهاز (بيسأل الموظف فين) */
  async saveAttachment(id: string, name: string) {
    const win = this.deps.window();
    const safe = safeFileName(name);
    const opts = { defaultPath: path.join(app.getPath("downloads"), safe) };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return false;
    const { data } = await this.attachment(id, true);
    await fs.promises.writeFile(res.filePath, data);
    return true;
  }
}

const enc = encodeURIComponent;

export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 150);
  return cleaned || "file";
}

// ───────────── IPC ─────────────

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

const str = (v: unknown, max = 64) => {
  if (typeof v !== "string" || !v || v.length > max) throw new ApiError("بيانات غير صالحة", 400);
  return v;
};
const optStr = (v: unknown, max = 64) => (v == null || v === "" ? null : str(v, max));
const ids = (v: unknown) => {
  if (!Array.isArray(v) || v.length > 200) throw new ApiError("بيانات غير صالحة", 400);
  return v.map((x) => str(x));
};
const text = (v: unknown, max: number) => {
  if (typeof v !== "string" || v.length > max) throw new ApiError("بيانات غير صالحة", 400);
  return v;
};

/** كل قنوات الشات بين الواجهة والـ main. الرد دايمًا {ok, data} أو {ok:false, error} عشان رسالة الخطأ توصل نضيفة */
export function registerChatIpc(chat: ChatMain, isOurWindow: (e: IpcMainInvokeEvent) => boolean) {
  const handle = <T>(channel: string, fn: (...args: unknown[]) => Promise<T> | T) => {
    ipcMain.handle(channel, async (e, ...args): Promise<Result<T>> => {
      if (!isOurWindow(e)) return { ok: false, error: "مش مسموح", status: 403 };
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, error: err.message, status: err.status };
        console.error(`chat ipc ${channel} failed`, err);
        const offline = err instanceof TypeError || (err as Error)?.name === "TimeoutError";
        return { ok: false, error: offline ? "مفيش اتصال بالسيرفر" : "حصلت مشكلة، حاول تاني", status: 0 };
      }
    });
  };

  handle("chat:snapshot", () => chat.snapshot());
  handle("chat:conversations", () => chat.conversations());
  handle("chat:conversation", (id) => chat.conversation(str(id)));
  handle("chat:messages", (id, before) => chat.messages(str(id), optStr(before)));
  handle("chat:send", (id, input) => {
    const i = (input ?? {}) as Record<string, unknown>;
    return chat.sendMessage(str(id), { body: text(i.body ?? "", 5000), replyToId: optStr(i.replyToId), attachmentIds: i.attachmentIds == null ? [] : ids(i.attachmentIds) });
  });
  handle("chat:edit", (id, body) => chat.editMessage(str(id), text(body, 5000)));
  handle("chat:delete", (id) => chat.deleteMessage(str(id)));
  handle("chat:read", (id) => chat.markRead(str(id)));
  handle("chat:typing", (id) => chat.typing(str(id)));
  handle("chat:openDirect", (userId) => chat.openDirect(str(userId)));
  handle("chat:createGroup", (name, memberIds) => chat.createGroup(text(name, 200), ids(memberIds)));
  handle("chat:renameGroup", (id, name) => chat.renameGroup(str(id), text(name, 200)));
  handle("chat:addMembers", (id, userIds) => chat.addMembers(str(id), ids(userIds)));
  handle("chat:removeMember", (id, userId) => chat.removeMember(str(id), str(userId)));
  handle("chat:users", () => chat.users());
  handle("chat:config", () => chat.config());
  handle("chat:search", (q, conversationId) => chat.search(text(q, 200), optStr(conversationId)));
  handle("chat:upload", (file) => {
    const f = (file ?? {}) as Record<string, unknown>;
    if (!(f.data instanceof Uint8Array)) throw new ApiError("مفيش ملف", 400);
    if (f.data.byteLength === 0) throw new ApiError("الملف فاضي", 400);
    if (f.data.byteLength > MAX_UPLOAD_BYTES) throw new ApiError("الملف كبير جدًا", 413);
    const kind = f.kind === "IMAGE" || f.kind === "FILE" || f.kind === "VOICE" ? f.kind : null;
    const durationSec = typeof f.durationSec === "number" && Number.isFinite(f.durationSec) && f.durationSec > 0 ? Math.round(f.durationSec) : null;
    return chat.upload({ name: text(f.name || "file", 255) || "file", mime: text(f.mime ?? "", 200), data: f.data, kind, durationSec });
  });
  handle("chat:attachment", (id) => chat.attachment(str(id)));
  handle("chat:saveAttachment", (id, name) => chat.saveAttachment(str(id), text(name, 255)));
}
