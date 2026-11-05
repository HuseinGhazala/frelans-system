import "server-only";
import type { ChatEvent } from "./types";

/**
 * موزّع الأحداث اللحظية للشات. راصد بيشتغل process واحد (next start في Docker)،
 * فالاشتراكات في الذاكرة كفاية. لو اتعمل أكتر من نسخة في يوم، نبدّل publish/subscribe بـ Postgres LISTEN/NOTIFY هنا بس.
 */
type Listener = (event: ChatEvent) => void;

type Hub = {
  listeners: Map<string, Set<Listener>>;
  /** بيتنادى لما أول اتصال لمستخدم يفتح أو آخر اتصال يتقفل */
  onPresenceChange?: (userId: string, online: boolean) => void;
};

const globalForHub = globalThis as unknown as { rasedChatHub?: Hub };
const hub: Hub = (globalForHub.rasedChatHub ??= { listeners: new Map() });

export function subscribe(userId: string, listener: Listener): () => void {
  let set = hub.listeners.get(userId);
  const first = !set || set.size === 0;
  if (!set) hub.listeners.set(userId, (set = new Set()));
  set.add(listener);
  if (first) hub.onPresenceChange?.(userId, true);
  return () => {
    const s = hub.listeners.get(userId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) {
      hub.listeners.delete(userId);
      hub.onPresenceChange?.(userId, false);
    }
  };
}

/** يبعت الحدث لكل اتصالات المستخدمين دول */
export function publish(userIds: Iterable<string>, event: ChatEvent) {
  for (const id of new Set(userIds)) {
    const set = hub.listeners.get(id);
    if (!set) continue;
    for (const l of set) {
      try {
        l(event);
      } catch (err) {
        console.error("chat listener failed", err);
      }
    }
  }
}

/** يبعت لكل المتصلين دلوقتي */
export function broadcast(event: ChatEvent) {
  publish(hub.listeners.keys(), event);
}

export function isConnected(userId: string): boolean {
  return (hub.listeners.get(userId)?.size ?? 0) > 0;
}

export function connectedUserIds(): string[] {
  return [...hub.listeners.keys()];
}

export function setPresenceHandler(fn: (userId: string, online: boolean) => void) {
  hub.onPresenceChange = fn;
}
