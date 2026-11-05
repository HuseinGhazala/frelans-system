import "server-only";
import { subscribe } from "./hub";
import { presenceFor } from "./presence";
import type { ChatEvent } from "./types";

const HEARTBEAT_MS = 25_000;

/**
 * Response بتاع SSE لمستخدم: بيبعت hello بالحالات، وبعدين كل أحداثه، و ping كل 25 ثانية.
 * بيستخدمه /api/chat/stream (كوكي الموقع) و /api/agent/v1/chat/stream (توكن البرنامج).
 * ملحوظة للنشر: nginx لازم يكون فيه proxy_buffering off للمسارات دي.
 */
export function chatEventStream(request: Request, userId: string): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const sendEvent = (event: ChatEvent) => send(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);

      const unsubscribe = subscribe(userId, sendEvent);
      const ping = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);

      send(`retry: 3000\n\n`);
      sendEvent({ type: "hello", userId, presence: await presenceFor() });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
