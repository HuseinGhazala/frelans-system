"use client";

import { useEffect, useRef, useState } from "react";
import { unreadTotalAction } from "@/app/actions/chat";
import { useChatEvents } from "./use-chat-events";

/** عدد رسايل الشات غير المقروءة في القائمة الجانبية — بيتحدث لحظيًا من غير ما الصفحة تتعمل refresh */
export function ChatUnreadBadge({ initial }: { initial: number }) {
  const [state, setState] = useState({ initial, count: initial });
  // لو السيرفر بعت رقم جديد (navigation)، ناخده
  if (state.initial !== initial) setState({ initial, count: initial });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myId = useRef<string | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const refresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await unreadTotalAction().catch(() => null);
      if (r?.ok) setState((s) => ({ ...s, count: r.data }));
    }, 700);
  };

  useChatEvents((e) => {
    if (e.type === "hello") {
      // بعد إعادة الاتصال ممكن يكون فاتنا حاجة
      if (myId.current) refresh();
      myId.current = e.userId;
      return;
    }
    if (e.type === "message.created" && e.message.senderId !== myId.current) refresh();
    else if (e.type === "message.deleted" || e.type === "conversation.removed") refresh();
    else if (e.type === "read" && e.userId === myId.current) refresh();
  });

  if (!state.count) return null;
  return (
    <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums" aria-label={`${state.count} رسالة جديدة`}>
      {state.count > 99 ? "99+" : state.count}
    </span>
  );
}
