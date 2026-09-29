import { app, desktopCapturer, Notification, powerMonitor, screen } from "electron";
import crypto from "node:crypto";
import os from "node:os";
import type { Platform } from "../core/controller";
import type { WindowSample } from "../core/minutes";
import { siteOf } from "../core/site";

// uiohook بيسمع أحداث الكيبورد والماوس على مستوى النظام — بنعدّها بس، من غير ما نسجل أي حرف
type UIOhook = typeof import("uiohook-napi").uIOhook;
let hook: UIOhook | null = null;
let locked = false;

function loadHook(): UIOhook | null {
  if (hook) return hook;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hook = (require("uiohook-napi") as typeof import("uiohook-napi")).uIOhook;
  } catch (e) {
    console.error("uiohook unavailable", e);
  }
  return hook;
}

type GetWindows = typeof import("get-windows");
let getWindows: Promise<GetWindows | null> | null = null;

function loadGetWindows() {
  getWindows ??= import("get-windows").catch((e) => {
    console.error("get-windows unavailable", e);
    return null;
  });
  return getWindows;
}

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 60;

/**
 * لقطة لكل شاشة. التشويش بيحصل هنا على جهاز الموظف: بنصغّر الصورة جدًا وبعدين نكبّرها،
 * فالشكل العام يبان لكن الكلام ما يتقريش — والصورة الواضحة عمرها ما بتخرج من الجهاز.
 */
async function captureScreens(blur: boolean) {
  const displays = screen.getAllDisplays();
  const maxW = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
  const maxH = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: maxW, height: maxH } });
  return sources
    .filter((s) => !s.thumbnail.isEmpty())
    .map((s, i) => {
      let img = s.thumbnail;
      const size = img.getSize();
      if (size.width > MAX_WIDTH) img = img.resize({ width: MAX_WIDTH, quality: "good" });
      if (blur) {
        const { width } = img.getSize();
        img = img.resize({ width: Math.max(16, Math.round(width / 14)), quality: "good" }).resize({ width, quality: "good" });
      }
      const idx = displays.findIndex((d) => String(d.id) === s.display_id);
      const out = img.getSize();
      return { display: idx >= 0 ? idx : i, jpeg: new Uint8Array(img.toJPEG(JPEG_QUALITY)), width: out.width, height: out.height };
    });
}

export function createPlatform(): Platform {
  powerMonitor.on("lock-screen", () => (locked = true));
  powerMonitor.on("unlock-screen", () => (locked = false));
  powerMonitor.on("suspend", () => (locked = true));
  powerMonitor.on("resume", () => (locked = false));

  let lastMouse = 0;
  let listeners: { key: () => void; mouse: () => void } | null = null;

  return {
    now: () => Date.now(),
    systemIdleMs: () => powerMonitor.getSystemIdleTime() * 1000,
    isLocked: () => locked || powerMonitor.getSystemIdleState(1) === "locked",
    async activeWindow(): Promise<WindowSample | null> {
      const gw = await loadGetWindows();
      const w = await gw?.activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
      if (!w) return null;
      const app = w.owner.name || w.owner.path?.split(/[\\/]/).pop() || "غير معروف";
      const url = "url" in w ? (w.url as string | undefined) : undefined;
      return { app, title: w.title ?? "", site: siteOf(app, w.title ?? "", url) };
    },
    captureScreens,
    notify(title, body) {
      if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
    },
    startInput(onKey, onMouse) {
      const h = loadHook();
      if (!h) return;
      listeners = {
        key: onKey,
        // حركة الماوس بتطلع أحداث كتير جدًا، فبنعد حركة واحدة كل 250ms بالكتير
        mouse: () => {
          const t = Date.now();
          if (t - lastMouse >= 250) {
            lastMouse = t;
            onMouse();
          }
        },
      };
      h.removeAllListeners();
      h.on("keydown", () => listeners?.key());
      h.on("mousedown", () => listeners?.mouse());
      h.on("wheel", () => listeners?.mouse());
      h.on("mousemove", () => listeners?.mouse());
      h.start();
    },
    stopInput() {
      listeners = null;
      if (hook) {
        hook.removeAllListeners();
        try {
          hook.stop();
        } catch {
          // مش شغال أصلاً
        }
      }
    },
    newId: () => crypto.randomUUID(),
    device: { name: os.hostname(), os: `${os.type()} ${os.release()}`, appVersion: app.getVersion() },
  };
}
