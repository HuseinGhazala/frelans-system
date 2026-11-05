/* Service Worker بتاع إشعارات الشات (Web Push) — راصد.
 * بيتسجل من components/chat/push-toggle.tsx بالـ scope "/".
 * الـ payload جاي من lib/chat/push.ts: { title, body, url, tag, conversationId }
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "راصد";
  const url = data.url || "/";
  // السيرفر بيبعت بس للي مش فاتحين الشات، فبنعرض دايمًا (كروم بيشترط إشعار ظاهر لكل push)
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      dir: "rtl",
      lang: "ar",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // تبويب مفتوح على نفس الصفحة، وإلا أي تبويب من الموقع
      const same = windows.find((c) => new URL(c.url).pathname === target.pathname);
      const any = same || windows.find((c) => new URL(c.url).origin === target.origin);
      if (any) {
        await any.focus();
        if (any.url !== target.href && "navigate" in any) {
          try {
            await any.navigate(target.href);
          } catch {
            // التبويب مش متحكم فيه من الـ SW — نبعتله رسالة
            any.postMessage({ type: "chat-open", url: target.pathname + target.search });
          }
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// المتصفح غيّر الاشتراك (انتهى) — نسجّل الجديد
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/chat/push", { credentials: "include" });
        const { publicKey } = await res.json();
        if (!publicKey) return;
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await fetch("/api/chat/push", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      } catch {
        // هيتسجل تاني لما المستخدم يفتح الموقع
      }
    })(),
  );
});

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
