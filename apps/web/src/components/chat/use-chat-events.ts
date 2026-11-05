"use client";

import { useEffect, useRef } from "react";
import type { ChatEvent, PresenceStatus } from "@/lib/chat/types";

/**
 * اتصال SSE واحد بس لكل الصفحة (/api/chat/stream) — مشترك بين صفحة الشات وعلامة القائمة الجانبية.
 * بيتفتح مع أول مشترك وبيتقفل مع آخر واحد. EventSource بيعيد الاتصال لوحده، وبعد كل اتصال بيوصل hello.
 */
type Listener = (event: ChatEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let snapshot: { userId: string; presence: Record<string, PresenceStatus> } | null = null;

function dispatch(event: ChatEvent) {
  if (event.type === "hello") snapshot = { userId: event.userId, presence: { ...event.presence } };
  else if (event.type === "presence" && snapshot) snapshot.presence[event.userId] = event.status;
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.error("chat event handler failed", err);
    }
  }
}

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/chat/stream");
  source.addEventListener("chat", (e) => {
    try {
      dispatch(JSON.parse((e as MessageEvent<string>).data) as ChatEvent);
    } catch {
      // حدث بايظ — نتجاهله
    }
  });
}

export function subscribeChatEvents(listener: Listener): () => void {
  listeners.add(listener);
  open();
  // المشترك المتأخر ياخد آخر حالة معروفة كأنها hello
  if (snapshot) {
    const s = snapshot;
    queueMicrotask(() => listeners.has(listener) && listener({ type: "hello", userId: s.userId, presence: { ...s.presence } }));
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
      snapshot = null;
    }
  };
}

/** يسمع أحداث الشات. الـ handler ممكن يتغير كل render من غير ما الاتصال يتقفل */
export function useChatEvents(handler: Listener) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribeChatEvents((e) => ref.current(e)), []);
}
