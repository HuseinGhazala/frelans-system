"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * زرار تفعيل إشعارات المتصفح (Web Push). بيتحط في رأس صفحة الشات.
 * لو المتصفح مش بيدعم أو المفاتيح مش متظبطة على السيرفر بيرجع null.
 */

const SW_URL = "/chat-sw.js";
const API = "/api/chat/push";

type State = "loading" | "hidden" | "denied" | "off" | "on";

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error("subscribe failed");
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) return setState("hidden");
      try {
        const res = await fetch(API, { cache: "no-store" });
        const { publicKey } = (await res.json()) as { publicKey: string | null };
        if (cancelled) return;
        if (!publicKey) return setState("hidden");
        setKey(publicKey);
        if (Notification.permission === "denied") return setState("denied");
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          // نتأكد إن السيرفر عارفه (ممكن يكون اتمسح أو المستخدم اتغير على نفس المتصفح)
          await saveSubscription(sub).catch(() => {});
          setState("on");
        } else setState("off");
      } catch {
        if (!cancelled) setState("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      // لو المفتاح اتغير على السيرفر الاشتراك القديم مش هينفع
      if (sub && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        const wanted = urlBase64ToUint8Array(key);
        if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await saveSubscription(sub);
      setState("on");
    } catch {
      setError("مقدرناش نفعّل الإشعارات، جرب تاني");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(API, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("حصلت مشكلة، جرب تاني");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "hidden") return null;

  if (state === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="فعّلها من إعدادات الموقع في المتصفح (علامة القفل جنب الرابط)">
        <BellOff size={16} aria-hidden />
        الإشعارات مقفولة من المتصفح
      </span>
    );
  }

  const on = state === "on";
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={on ? "secondary" : "primary"}
        disabled={busy}
        aria-pressed={on}
        onClick={on ? disable : enable}
        title={on ? "اضغط عشان تقفل إشعارات المتصفح" : "يوصلك إشعار بالرسايل الجديدة وانت مش فاتح الشات"}
      >
        {on ? <BellRing size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
        {on ? "الإشعارات شغالة" : "فعّل الإشعارات"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
