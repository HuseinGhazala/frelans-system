import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from "react";
import { readersOf } from "../core/chat-state";
import { decodeMentions, encodeMentions, formatBytes, formatDuration, mentionQuery, segments, type MentionPick } from "../core/chat-text";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_GROUP_NAME,
  MAX_MESSAGE_LENGTH,
  type AttachmentKind,
  type ChatAttachment,
  type ChatMessage,
  type ChatUser,
  type ConversationSummary,
  type PresenceStatus,
  type SearchResult,
} from "../core/chat-types";
import type { RasedApi } from "../preload";
import { useAttachmentUrl, useVoiceRecorder } from "./chat-media";
import { useChatStore, type ChatStore } from "./chat-store";

type Api = RasedApi["chat"];

// ───────────── أدوات صغيرة ─────────────

const PRESENCE: Record<PresenceStatus, { label: string; cls: string }> = {
  WORKING: { label: "بيشتغل دلوقتي", cls: "p-working" },
  IDLE: { label: "خامل", cls: "p-idle" },
  ON_BREAK: { label: "في استراحة", cls: "p-break" },
  ONLINE: { label: "متصل", cls: "p-online" },
  OFFLINE: { label: "غير متصل", cls: "p-offline" },
};

const LOCALE = "ar-EG-u-nu-latn";
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "النهارده";
  if (d.toDateString() === y.toDateString()) return "امبارح";
  return d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
}
function shortWhen(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeOf(iso) : d.toLocaleDateString(LOCALE, { day: "numeric", month: "numeric" });
}
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 720px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 720px)");
    const fn = () => setWide(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return wide;
}

function otherMember(c: ConversationSummary, me: string | null) {
  return c.type === "DIRECT" ? c.members.find((m) => m.id !== me) : undefined;
}

function Avatar({ name, presence, group }: { name: string; presence?: PresenceStatus; group?: boolean }) {
  return (
    <span className={`avatar ${group ? "avatar-group" : ""}`}>
      {group ? "#" : initials(name)}
      {presence && <span className={`pdot ${PRESENCE[presence].cls}`} title={PRESENCE[presence].label} />}
    </span>
  );
}

function Body({ body, me }: { body: string; me: string | null }) {
  return (
    <>
      {segments(body).map((s, i) =>
        s.type === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : s.type === "mention" ? (
          <span key={i} className={`mention ${s.userId === me ? "mention-me" : ""}`}>
            @{s.name}
          </span>
        ) : (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" dir="ltr">
            {s.url}
          </a>
        ),
      )}
    </>
  );
}

// ───────────── الشاشة الرئيسية للشات ─────────────

export function ChatTab({ store, api, visible, openRequest }: { store: ChatStore; api: Api; visible: boolean; openRequest: { id: string | null; n: number } }) {
  const s = useChatStore(store);
  const wide = useWide();
  const [active, setActive] = useState<string | null>(null);
  const [focusMessage, setFocusMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | "direct" | "group">(null);

  // أول ما التبويب يتفتح نجيب القايمة لو لسه
  useEffect(() => {
    if (visible && !s.loaded) void store.loadList();
  }, [visible, s.loaded, store]);

  // إشعار اتضغط عليه
  useEffect(() => {
    if (openRequest.n && openRequest.id) setActive(openRequest.id);
  }, [openRequest]);

  // المحادثة اتشالت (اتشلت من الجروب)
  useEffect(() => {
    if (active && s.loaded && !s.list.conversations.some((c) => c.id === active)) setActive(null);
  }, [active, s.list.conversations, s.loaded]);

  // الاتصال رجع: نحدّث المحادثات المفتوحة
  const prevStatus = useRef(s.status);
  useEffect(() => {
    if (prevStatus.current !== "open" && s.status === "open") store.refreshLoadedThreads();
    prevStatus.current = s.status;
  }, [s.status, store]);

  const open = (id: string, messageId: string | null = null) => {
    setActive(id);
    setFocusMessage(messageId);
  };

  const conv = active ? s.list.conversations.find((c) => c.id === active) : undefined;
  const showList = wide || !conv;

  return (
    <div className={`chat ${wide ? "chat-wide" : ""}`}>
      {showList && (
        <ConversationList
          store={store}
          api={api}
          activeId={active}
          onOpen={open}
          onNew={setCreating}
        />
      )}
      {conv ? (
        <ConversationView
          key={conv.id}
          store={store}
          api={api}
          conv={conv}
          visible={visible}
          focusMessageId={focusMessage}
          onBack={wide ? null : () => setActive(null)}
        />
      ) : (
        wide && (
          <div className="chat-empty">
            <p className="muted">اختار محادثة من القايمة</p>
          </div>
        )
      )}
      {creating && (
        <NewChat
          store={store}
          api={api}
          mode={creating}
          onClose={() => setCreating(null)}
          onCreated={(c) => {
            setCreating(null);
            open(c.id);
          }}
        />
      )}
    </div>
  );
}

// ───────────── قايمة المحادثات + البحث ─────────────

function ConversationList({
  store,
  api,
  activeId,
  onOpen,
  onNew,
}: {
  store: ChatStore;
  api: Api;
  activeId: string | null;
  onOpen: (id: string, messageId?: string | null) => void;
  onNew: (mode: "direct" | "group") => void;
}) {
  const s = useChatStore(store);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const me = s.list.me;

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api.search(query).then(
        (r) => alive && (setResults(r), setSearchError(null)),
        (e: Error) => alive && setSearchError(e.message),
      );
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, api]);

  const query = q.trim().toLowerCase();
  const convs = query ? s.list.conversations.filter((c) => c.title.toLowerCase().includes(query)) : s.list.conversations;
  const nameOf = (c: ConversationSummary | undefined, id: string) => c?.members.find((m) => m.id === id)?.name ?? s.users?.find((u) => u.id === id)?.name ?? "";

  return (
    <div className="chat-list">
      <div className="chat-list-head">
        <input type="text" placeholder="دوّر في المحادثات والرسايل..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={() => onNew("direct")}>
            + محادثة
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => onNew("group")}>
            + جروب
          </button>
        </div>
        {s.status !== "open" && s.loaded && <div className="conn-note">بيتصل بالسيرفر...</div>}
      </div>
      <div className="chat-list-body">
        {!s.loaded && (
          <div className="center" style={{ display: "flex", padding: 24 }}>
            <div className="spin" />
          </div>
        )}
        {convs.map((c) => {
          const other = otherMember(c, me);
          const last = c.lastMessage;
          return (
            <button key={c.id} className={`conv ${c.id === activeId ? "conv-active" : ""}`} onClick={() => onOpen(c.id)}>
              <Avatar name={c.title} group={c.type !== "DIRECT"} presence={other ? (s.list.presence[other.id] ?? "OFFLINE") : undefined} />
              <span className="conv-main">
                <span className="conv-top">
                  <b className="conv-title" dir="auto">
                    {c.title}
                  </b>
                  {last && <span className="muted small">{shortWhen(last.createdAt)}</span>}
                </span>
                <span className="conv-bottom">
                  <span className={`conv-preview ${c.unread ? "conv-preview-unread" : ""}`} dir="auto">
                    {s.typing[c.id] && Object.keys(s.typing[c.id]).length ? (
                      <i className="typing-text">بيكتب...</i>
                    ) : last ? (
                      `${last.senderId === me ? "انت: " : c.type !== "DIRECT" ? `${nameOf(c, last.senderId).split(" ")[0]}: ` : ""}${last.preview}`
                    ) : (
                      <span className="muted">لسه مفيش رسايل</span>
                    )}
                  </span>
                  {c.unread > 0 && <span className="badge">{c.unread > 99 ? "99+" : c.unread}</span>}
                </span>
              </span>
            </button>
          );
        })}
        {s.loaded && convs.length === 0 && !results && <p className="muted small" style={{ padding: 12 }}>مفيش محادثات</p>}
        {searchError && <div className="alert alert-error" style={{ margin: 8 }}>{searchError}</div>}
        {results && (
          <div className="search-results">
            <p className="muted small section-label">نتايج البحث في الرسايل ({results.length})</p>
            {results.length === 0 && <p className="muted small" style={{ padding: "0 12px 12px" }}>مفيش نتايج</p>}
            {results.map((r) => {
              const c = s.list.conversations.find((x) => x.id === r.message.conversationId);
              return (
                <button key={r.message.id} className="conv" onClick={() => onOpen(r.message.conversationId, r.message.id)}>
                  <span className="conv-main">
                    <span className="conv-top">
                      <b className="conv-title" dir="auto">
                        {r.conversationTitle}
                      </b>
                      <span className="muted small">{shortWhen(r.message.createdAt)}</span>
                    </span>
                    <span className="conv-preview" dir="auto">
                      {nameOf(c, r.message.senderId) && `${nameOf(c, r.message.senderId)}: `}
                      <Body body={r.message.body} me={me} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────── محادثة جديدة / جروب جديد ─────────────

function UserPicker({
  users,
  presence,
  selected,
  onToggle,
  exclude = [],
}: {
  users: ChatUser[] | null;
  presence: Record<string, PresenceStatus>;
  selected?: Set<string>;
  onToggle: (u: ChatUser) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const list = (users ?? []).filter((u) => !exclude.includes(u.id) && (!q || `${u.name} ${u.jobTitle ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <input type="text" placeholder="بحث بالاسم..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="picker">
        {users === null && (
          <div className="center" style={{ display: "flex", padding: 20 }}>
            <div className="spin" />
          </div>
        )}
        {users && list.length === 0 && <p className="muted small" style={{ padding: 8 }}>مفيش حد</p>}
        {list.map((u) => (
          <button key={u.id} className={`pick ${selected?.has(u.id) ? "pick-on" : ""}`} onClick={() => onToggle(u)}>
            {selected && <input type="checkbox" readOnly checked={selected.has(u.id)} tabIndex={-1} />}
            <Avatar name={u.name} presence={presence[u.id] ?? "OFFLINE"} />
            <span className="conv-main">
              <b dir="auto">{u.name}</b>
              <span className="muted small">
                {u.role === "ADMIN" ? "مدير" : (u.jobTitle ?? "موظف")} • {PRESENCE[presence[u.id] ?? "OFFLINE"].label}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function NewChat({ store, api, mode, onClose, onCreated }: { store: ChatStore; api: Api; mode: "direct" | "group"; onClose: () => void; onCreated: (c: ConversationSummary) => void }) {
  const s = useChatStore(store);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    store.loadUsers().catch((e: Error) => setError(e.message));
  }, [store]);

  const run = async (fn: () => Promise<ConversationSummary>) => {
    setBusy(true);
    setError(null);
    try {
      const c = await fn();
      store.upsert(c);
      onCreated(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="screen" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <h1 style={{ flex: 1 }}>{mode === "direct" ? "محادثة جديدة" : "جروب جديد"}</h1>
          <button className="btn-link" style={{ flex: "none" }} onClick={onClose}>
            إغلاق
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {mode === "group" && (
          <div className="field">
            <label htmlFor="gname">اسم الجروب</label>
            <input id="gname" type="text" maxLength={MAX_GROUP_NAME} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <UserPicker
          users={s.users}
          presence={s.list.presence}
          selected={mode === "group" ? selected : undefined}
          onToggle={(u) => {
            if (busy) return;
            if (mode === "direct") return void run(() => api.openDirect(u.id));
            const next = new Set(selected);
            if (next.has(u.id)) next.delete(u.id);
            else next.add(u.id);
            setSelected(next);
          }}
        />
        {mode === "group" && (
          <button className="btn btn-primary btn-lg" disabled={busy || !name.trim() || selected.size === 0} onClick={() => void run(() => api.createGroup(name.trim(), [...selected]))}>
            {busy ? "جاري الإنشاء..." : `إنشاء الجروب (${selected.size})`}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────── إدارة الجروب ─────────────

function GroupPanel({ store, api, conv, onClose }: { store: ChatStore; api: Api; conv: ConversationSummary; onClose: () => void }) {
  const s = useChatStore(store);
  const me = s.list.me;
  const owner = conv.myRole === "OWNER";
  const [name, setName] = useState(conv.title);
  const [adding, setAdding] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upsert = (c: ConversationSummary) => store.upsert(c);

  if (adding) {
    return (
      <div className="overlay">
        <div className="screen" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <h1 style={{ flex: 1 }}>إضافة أعضاء</h1>
            <button className="btn-link" style={{ flex: "none" }} onClick={() => setAdding(null)}>
              رجوع
            </button>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <UserPicker
            users={s.users}
            presence={s.list.presence}
            selected={adding}
            exclude={conv.members.map((m) => m.id)}
            onToggle={(u) => {
              const next = new Set(adding);
              if (next.has(u.id)) next.delete(u.id);
              else next.add(u.id);
              setAdding(next);
            }}
          />
          <button
            className="btn btn-primary btn-lg"
            disabled={busy || adding.size === 0}
            onClick={() =>
              void run(async () => {
                upsert(await api.addMembers(conv.id, [...adding]));
                setAdding(null);
              })
            }
          >
            إضافة ({adding.size})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="screen" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <h1 style={{ flex: 1 }} dir="auto">
            {conv.title}
          </h1>
          <button className="btn-link" style={{ flex: "none" }} onClick={onClose}>
            إغلاق
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {owner && (
          <div className="row">
            <input type="text" maxLength={MAX_GROUP_NAME} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-outline" style={{ flex: "none" }} disabled={busy || !name.trim() || name.trim() === conv.title} onClick={() => void run(async () => upsert(await api.renameGroup(conv.id, name.trim())))}>
              حفظ الاسم
            </button>
          </div>
        )}
        <p className="muted small">{conv.members.length} أعضاء</p>
        <div className="picker">
          {conv.members.map((m) => (
            <div key={m.id} className="pick">
              <Avatar name={m.name} presence={s.list.presence[m.id] ?? "OFFLINE"} />
              <span className="conv-main">
                <b dir="auto">
                  {m.name}
                  {m.id === me ? " (انت)" : ""}
                </b>
                <span className="muted small">{m.memberRole === "OWNER" ? "صاحب الجروب" : m.role === "ADMIN" ? "مدير" : (m.jobTitle ?? "عضو")}</span>
              </span>
              {owner && m.id !== me && (
                <button
                  className="btn-link small"
                  style={{ color: "var(--danger)" }}
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`شيل ${m.name} من الجروب؟`)) void run(() => api.removeMember(conv.id, m.id));
                  }}
                >
                  شيل
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="btn btn-outline"
          disabled={busy}
          onClick={() => {
            setAdding(new Set());
            store.loadUsers().catch((e: Error) => setError(e.message));
          }}
        >
          + إضافة أعضاء
        </button>
        <button
          className="btn btn-danger-outline"
          disabled={busy}
          onClick={() => {
            if (confirm("تخرج من الجروب؟")) void run(async () => {
              await api.removeMember(conv.id, me ?? "");
              store.remove(conv.id);
              onClose();
            });
          }}
        >
          الخروج من الجروب
        </button>
      </div>
    </div>
  );
}

// ───────────── المرفقات ─────────────

function ImageAttachment({ api, a, onOpen }: { api: Api; a: ChatAttachment; onOpen: (url: string) => void }) {
  const { url, error } = useAttachmentUrl(api, a.id, !a.expired);
  if (a.expired) return <div className="att-file muted small">الصورة اتمسحت بعد مدة الحفظ</div>;
  if (error) return <div className="att-file muted small">{error}</div>;
  const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
  return (
    <button className="att-img" style={{ aspectRatio: String(Math.min(2.5, Math.max(0.5, ratio))) }} onClick={() => url && onOpen(url)} title={a.name}>
      {url ? <img src={url} alt={a.name} /> : <span className="spin" style={{ width: 20, height: 20 }} />}
    </button>
  );
}

function VoiceAttachment({ api, a }: { api: Api; a: ChatAttachment }) {
  const [load, setLoad] = useState(false);
  const { url, error } = useAttachmentUrl(api, a.id, load && !a.expired);
  if (a.expired) return <div className="att-file muted small">الرسالة الصوتية اتمسحت بعد مدة الحفظ</div>;
  if (error) return <div className="att-file muted small">{error}</div>;
  if (!load || !url)
    return (
      <button className="att-voice" onClick={() => setLoad(true)} disabled={load}>
        <span className="play">{load ? "…" : "▶"}</span>
        <span>رسالة صوتية</span>
        {a.durationSec != null && <span className="muted small">{formatDuration(a.durationSec)}</span>}
      </button>
    );
  return <audio className="att-audio" src={url} controls autoPlay preload="auto" />;
}

function FileAttachment({ api, a }: { api: Api; a: ChatAttachment }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  return (
    <div className="att-file">
      <span className="file-ico">📎</span>
      <span className="conv-main">
        <b dir="auto" className="ellipsis">
          {a.name}
        </b>
        <span className="muted small">{a.expired ? "الملف اتمسح بعد مدة الحفظ" : formatBytes(a.bytes)}</span>
      </span>
      {!a.expired && (
        <button
          className="btn-link small"
          disabled={state === "saving"}
          onClick={() => {
            setState("saving");
            api.saveAttachment(a.id, a.name).then(
              (ok) => setState(ok ? "saved" : "idle"),
              (e: Error) => setState(e.message),
            );
          }}
        >
          {state === "saving" ? "..." : state === "saved" ? "اتحفظ ✓" : state === "idle" ? "حفظ" : "حاول تاني"}
        </button>
      )}
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={url} alt="" />
    </div>
  );
}

// ───────────── المحادثة ─────────────

type Pending = { key: string; name: string; kind: AttachmentKind; status: "uploading" | "done" | "error"; attachment?: ChatAttachment; error?: string };

function ConversationView({
  store,
  api,
  conv,
  visible,
  focusMessageId,
  onBack,
}: {
  store: ChatStore;
  api: Api;
  conv: ConversationSummary;
  visible: boolean;
  focusMessageId: string | null;
  onBack: (() => void) | null;
}) {
  const s = useChatStore(store);
  const me = s.list.me;
  const thread = s.threads[conv.id];
  const items = useMemo(() => thread?.items ?? [], [thread?.items]);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [panel, setPanel] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(focusMessageId);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<ComposerHandle | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const lastCount = useRef(0);
  const lastReadReq = useRef(0);

  useEffect(() => {
    void store.openThread(conv.id);
  }, [conv.id, store]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ── السكرول: تحت على طول، إلا لو الموظف طالع يقرا القديم ──
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderAnchor.current) {
      el.scrollTop = el.scrollHeight - olderAnchor.current.height + olderAnchor.current.top;
      olderAnchor.current = null;
    } else if (items.length !== lastCount.current) {
      const last = items.at(-1);
      if (atBottom.current || last?.senderId === me || lastCount.current === 0) el.scrollTop = el.scrollHeight;
    }
    lastCount.current = items.length;
  }, [items, me]);

  // ── رسالة من البحث ──
  useEffect(() => {
    if (!highlight || !thread?.loaded) return;
    const el = document.getElementById(`m-${highlight}`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      const t = setTimeout(() => setHighlight(null), 2500);
      return () => clearTimeout(t);
    }
  }, [highlight, thread?.loaded]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 80 && thread?.hasMore && !thread.loading) {
      olderAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
      void store.loadOlder(conv.id);
    }
  };

  // ── علامة القراءة: لما المحادثة قدام الموظف فعلًا ──
  const myRead = conv.members.find((m) => m.id === me)?.lastReadAt ?? null;
  const lastOther = [...items].reverse().find((m) => m.senderId !== me);
  const needsRead = conv.isMember && (conv.unread > 0 || Boolean(lastOther && (!myRead || Date.parse(lastOther.createdAt) > Date.parse(myRead))));
  useEffect(() => {
    if (!visible || !needsRead) return;
    const tryRead = () => {
      if (!document.hasFocus() || document.visibilityState !== "visible") return;
      if (Date.now() - lastReadReq.current < 1500) return;
      lastReadReq.current = Date.now();
      api.read(conv.id).catch(() => {});
    };
    tryRead();
    window.addEventListener("focus", tryRead);
    document.addEventListener("visibilitychange", tryRead);
    return () => {
      window.removeEventListener("focus", tryRead);
      document.removeEventListener("visibilitychange", tryRead);
    };
  }, [visible, needsRead, conv.id, api, items.length]);

  const other = otherMember(conv, me);
  const typingNames = Object.values(s.typing[conv.id] ?? {}).map((t) => t.name.split(" ")[0]);
  const nameOf = (id: string) => conv.members.find((m) => m.id === id)?.name ?? s.users?.find((u) => u.id === id)?.name ?? "مستخدم سابق";
  const subtitle = typingNames.length ? (
    <span className="typing-text">{typingNames.join(" و ")} بيكتب...</span>
  ) : other ? (
    PRESENCE[s.list.presence[other.id] ?? "OFFLINE"].label
  ) : (
    `${conv.members.length} أعضاء`
  );

  const remove = async (m: ChatMessage) => {
    if (!confirm("تمسح الرسالة دي؟")) return;
    try {
      await api.remove(m.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div
      className="convo"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) composerRef.current?.addFiles(e.dataTransfer.files);
      }}
    >
      <div className="convo-head">
        {onBack && (
          <button className="icon-btn" onClick={onBack} title="رجوع">
            →
          </button>
        )}
        <Avatar name={conv.title} group={conv.type !== "DIRECT"} presence={other ? (s.list.presence[other.id] ?? "OFFLINE") : undefined} />
        <span className="conv-main">
          <b className="ellipsis" dir="auto">
            {conv.title}
          </b>
          <span className="muted small">{subtitle}</span>
        </span>
        {conv.type === "GROUP" && (
          <button className="btn-link small" style={{ flex: "none" }} onClick={() => setPanel(true)}>
            الأعضاء
          </button>
        )}
      </div>

      <div className="msgs" ref={scroller} onScroll={onScroll}>
        {thread?.loading && <div className="center" style={{ display: "flex", padding: 10 }}><div className="spin" style={{ width: 20, height: 20 }} /></div>}
        {thread?.loaded && !thread.hasMore && items.length > 0 && <p className="muted small center-text">بداية المحادثة</p>}
        {thread?.loaded && items.length === 0 && <p className="muted small center-text" style={{ marginTop: 40 }}>ابدأ المحادثة — اكتب أول رسالة</p>}
        {thread?.error && <div className="alert alert-error">{thread.error}</div>}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev && prev.senderId === m.senderId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day-sep"><span>{dayLabel(m.createdAt)}</span></div>}
              <MessageBubble
                api={api}
                m={m}
                me={me}
                conv={conv}
                showName={conv.type !== "DIRECT" && m.senderId !== me && !grouped}
                senderName={nameOf(m.senderId)}
                replyName={m.replyTo ? nameOf(m.replyTo.senderId) : ""}
                highlight={highlight === m.id}
                onReply={() => {
                  setEditing(null);
                  setReplyTo(m);
                  composerRef.current?.focus();
                }}
                onEdit={() => {
                  setReplyTo(null);
                  setEditing(m);
                }}
                onDelete={() => void remove(m)}
                onJump={(id) => setHighlight(id)}
                onImage={setLightbox}
              />
            </Fragment>
          );
        })}
      </div>

      {error && <div className="alert alert-error convo-error">{error}</div>}
      {dragging && <div className="drop-hint">سيب الملفات هنا عشان تبعتها</div>}

      {conv.isMember ? (
        <Composer
          handleRef={composerRef}
          api={api}
          store={store}
          conv={conv}
          me={me}
          replyTo={replyTo}
          editing={editing}
          replyName={replyTo ? nameOf(replyTo.senderId) : ""}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onError={setError}
          onSent={() => {
            setReplyTo(null);
            setEditing(null);
            atBottom.current = true;
          }}
        />
      ) : (
        <p className="muted small center-text" style={{ padding: 12 }}>انت مش عضو في المحادثة دي</p>
      )}

      {panel && conv.type === "GROUP" && <GroupPanel store={store} api={api} conv={conv} onClose={() => setPanel(false)} />}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function MessageBubble({
  api,
  m,
  me,
  conv,
  showName,
  senderName,
  replyName,
  highlight,
  onReply,
  onEdit,
  onDelete,
  onJump,
  onImage,
}: {
  api: Api;
  m: ChatMessage;
  me: string | null;
  conv: ConversationSummary;
  showName: boolean;
  senderName: string;
  replyName: string;
  highlight: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onJump: (id: string) => void;
  onImage: (url: string) => void;
}) {
  const mine = m.senderId === me;
  const deleted = Boolean(m.deletedAt);
  const mentioned = me != null && m.mentionIds.includes(me);
  let receipt: ReactNode = null;
  if (mine && !deleted) {
    const r = readersOf(m, conv);
    const all = r.total > 0 && r.read === r.total;
    receipt = (
      <span className={`receipt ${all ? "receipt-read" : ""}`} title={conv.type === "DIRECT" ? (all ? "اتقرت" : "اتبعتت") : `قراها ${r.read} من ${r.total}`}>
        {r.read > 0 ? "✓✓" : "✓"}
        {conv.type !== "DIRECT" && r.read > 0 && !all ? ` ${r.read}` : ""}
      </span>
    );
  }
  return (
    <div id={`m-${m.id}`} className={`msg ${mine ? "msg-mine" : ""} ${highlight ? "msg-hl" : ""}`}>
      <div className={`bubble ${mentioned ? "bubble-mention" : ""} ${deleted ? "bubble-deleted" : ""}`}>
        {showName && <div className="sender">{senderName}</div>}
        {m.replyTo && (
          <button className="reply-quote" onClick={() => m.replyTo && onJump(m.replyTo.id)}>
            <b>{replyName}</b>
            <span dir="auto" className="ellipsis">
              {m.replyTo.deleted ? "الرسالة اتمسحت" : m.replyTo.body || (m.replyTo.hasAttachments ? "📎 مرفق" : "")}
            </span>
          </button>
        )}
        {deleted ? (
          <i className="muted">الرسالة اتمسحت</i>
        ) : (
          <>
            {m.attachments.length > 0 && (
              <div className="atts">
                {m.attachments.map((a) =>
                  a.kind === "IMAGE" ? (
                    <ImageAttachment key={a.id} api={api} a={a} onOpen={onImage} />
                  ) : a.kind === "VOICE" ? (
                    <VoiceAttachment key={a.id} api={api} a={a} />
                  ) : (
                    <FileAttachment key={a.id} api={api} a={a} />
                  ),
                )}
              </div>
            )}
            {m.body && (
              <div className="text" dir="auto">
                <Body body={m.body} me={me} />
              </div>
            )}
          </>
        )}
        <div className="meta">
          {m.editedAt && !deleted && <span>معدّلة</span>}
          <span>{timeOf(m.createdAt)}</span>
          {receipt}
        </div>
      </div>
      {!deleted && (
        <div className="msg-actions">
          <button title="رد" onClick={onReply}>↩</button>
          {mine && (
            <>
              <button title="تعديل" onClick={onEdit}>✎</button>
              <button title="حذف" onClick={onDelete}>🗑</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────── خانة الكتابة ─────────────

type ComposerHandle = { focus: () => void; addFiles: (files: FileList | File[]) => void };

function Composer({
  handleRef,
  api,
  store,
  conv,
  me,
  replyTo,
  editing,
  replyName,
  onCancelReply,
  onCancelEdit,
  onError,
  onSent,
}: {
  handleRef: RefObject<ComposerHandle | null>;
  api: Api;
  store: ChatStore;
  conv: ConversationSummary;
  me: string | null;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  replyName: string;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onError: (e: string) => void;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [picks, setPicks] = useState<MentionPick[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const draft = useRef<{ text: string; picks: MentionPick[] } | null>(null);
  const voice = useVoiceRecorder();

  // وضع التعديل: النص القديم في الخانة (والمسودة بتترجع لما يلغي)
  useEffect(() => {
    if (editing) {
      draft.current = { text, picks };
      const d = decodeMentions(editing.body);
      setText(d.text);
      setPicks(d.picks);
      setTimeout(() => input.current?.focus(), 0);
    } else if (draft.current) {
      setText(draft.current.text);
      setPicks(draft.current.picks);
      draft.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // الطول
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [text]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (editing) return onError("مينفعش تضيف ملفات وانت بتعدل");
    if (pending.length + list.length > MAX_ATTACHMENTS_PER_MESSAGE) return onError(`أقصى عدد ملفات ${MAX_ATTACHMENTS_PER_MESSAGE}`);
    for (const f of list) {
      const key = `${Date.now()}-${Math.random()}`;
      const kind: AttachmentKind = f.type.startsWith("image/") ? "IMAGE" : "FILE";
      setPending((p) => [...p, { key, name: f.name || "file", kind, status: "uploading" }]);
      void f
        .arrayBuffer()
        .then((buf) => api.upload({ name: f.name || (kind === "IMAGE" ? "image.png" : "file"), mime: f.type, data: new Uint8Array(buf), kind, durationSec: null }))
        .then(
          (attachment) => setPending((p) => p.map((x) => (x.key === key ? { ...x, status: "done", attachment } : x))),
          (e: Error) => setPending((p) => p.map((x) => (x.key === key ? { ...x, status: "error", error: e.message } : x))),
        );
    }
  };

  // المحادثة بتستخدمه للسحب والإفلات وزرار "رد"
  useEffect(() => {
    handleRef.current = { focus: () => input.current?.focus(), addFiles };
  });

  const mq = mentionQuery(text, caret);
  const candidates = mq
    ? conv.members.filter((m) => m.id !== me && m.name.toLowerCase().includes(mq.query.toLowerCase())).slice(0, 6)
    : [];

  const pickMention = (m: { id: string; name: string }) => {
    if (!mq) return;
    const next = `${text.slice(0, mq.start)}@${m.name} ${text.slice(caret)}`;
    const pos = mq.start + m.name.length + 2;
    setText(next);
    setPicks((p) => [...p.filter((x) => x.id !== m.id), { id: m.id, name: m.name }]);
    setCaret(pos);
    setSel(0);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    if (sending) return;
    const body = encodeMentions(text, picks).trim();
    if (body.length > MAX_MESSAGE_LENGTH) return onError("الرسالة طويلة جدًا");
    if (pending.some((p) => p.status === "uploading")) return onError("استنى لحد ما الملفات تترفع");
    const attachmentIds = pending.filter((p) => p.status === "done" && p.attachment).map((p) => p.attachment!.id);
    if (!body && attachmentIds.length === 0) return;
    setSending(true);
    try {
      if (editing) {
        store.upsertMessage(await api.edit(editing.id, body));
        draft.current = null;
      } else {
        store.upsertMessage(await api.send(conv.id, { body, replyToId: replyTo?.id ?? null, attachmentIds }));
      }
      setText("");
      setPicks([]);
      setPending([]);
      onSent();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const sendVoice = async () => {
    const rec = await voice.stop();
    if (!rec) return;
    setSending(true);
    try {
      const ext = rec.blob.type.includes("ogg") ? "ogg" : "webm";
      const attachment = await api.upload({
        name: `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
        mime: rec.blob.type || "audio/webm",
        data: new Uint8Array(await rec.blob.arrayBuffer()),
        kind: "VOICE",
        durationSec: rec.durationSec,
      });
      store.upsertMessage(await api.send(conv.id, { body: "", replyToId: replyTo?.id ?? null, attachmentIds: [attachment.id] }));
      onSent();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startVoice = async () => {
    try {
      await voice.start();
    } catch {
      onError("مقدرناش نفتح الميكروفون — اتأكد إنه متوصل ومسموح لراصد في إعدادات الخصوصية في Windows");
    }
  };

  if (voice.recording) {
    return (
      <div className="composer">
        <div className="recording">
          <span className="rec-dot" />
          <span>بيسجل... {formatDuration(voice.elapsed)}</span>
          <span className="spacer" />
          <button className="btn btn-outline btn-sm" onClick={voice.cancel}>
            إلغاء
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void sendVoice()}>
            إرسال
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composer">
      {(replyTo || editing) && (
        <div className="composer-banner">
          <span className="conv-main">
            <b className="small">{editing ? "تعديل الرسالة" : `رد على ${replyName}`}</b>
            {replyTo && (
              <span className="muted small ellipsis" dir="auto">
                {replyTo.body ? decodeMentions(replyTo.body).text : replyTo.attachments.length ? "📎 مرفق" : ""}
              </span>
            )}
          </span>
          <button className="icon-btn" onClick={editing ? onCancelEdit : onCancelReply} title="إلغاء">
            ✕
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="pending">
          {pending.map((p) => (
            <span key={p.key} className={`chip ${p.status === "error" ? "chip-error" : ""}`} title={p.error ?? p.name}>
              {p.kind === "IMAGE" ? "🖼️" : "📎"} <span className="ellipsis">{p.name}</span>
              {p.status === "uploading" && <span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} />}
              {p.status === "error" && <span>!</span>}
              <button onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>✕</button>
            </span>
          ))}
        </div>
      )}
      {candidates.length > 0 && (
        <div className="mentions-pop">
          {candidates.map((m, i) => (
            <button key={m.id} className={i === sel ? "on" : ""} onMouseDown={(e) => (e.preventDefault(), pickMention(m))}>
              @{m.name}
            </button>
          ))}
        </div>
      )}
      <div className="composer-row">
        {!editing && (
          <button className="icon-btn" title="إرفاق ملف أو صورة" onClick={() => fileInput.current?.click()}>
            📎
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={input}
          rows={1}
          dir="auto"
          placeholder={editing ? "عدّل الرسالة..." : "اكتب رسالة... (@ للمنشن)"}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH + 200}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setSel(0);
            if (!editing && e.target.value.trim() && Date.now() - lastTyping.current > 3000) {
              lastTyping.current = Date.now();
              api.typing(conv.id).catch(() => {});
            }
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (candidates.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSel((x) => (x + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickMention(candidates[sel] ?? candidates[0]);
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
              void send();
            }
          }}
        />
        {!editing && !text.trim() && pending.length === 0 ? (
          <button className="icon-btn" title="رسالة صوتية" disabled={sending} onClick={() => void startVoice()}>
            🎤
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={sending} onClick={() => void send()}>
            {editing ? "حفظ" : "إرسال"}
          </button>
        )}
      </div>
    </div>
  );
}
