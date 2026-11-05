import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, session as electronSession, shell, Tray, type NativeImage, type WebContents } from "electron";
import path from "node:path";
import { Controller } from "../core/controller";
import { SyncQueue } from "../core/queue";
import { badgeCircle, drawBadgeDot } from "../core/badge";
import { badgeLabel } from "../core/chat-state";
import type { ViewModel } from "../core/types";
import { createApi } from "./api";
import { ChatMain, registerChatIpc } from "./chat";
import { createPlatform } from "./platform";
import { createSession, createShotStore, queueStorage } from "./store";

const assets = (name: string) => path.join(__dirname, "..", "assets", name);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: Controller;
let quitting = false;
let chat: ChatMain;
let chatUnread = 0;
let lastView: ViewModel = { screen: "loading" };

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(boot);
}

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 680,
    // الشات محتاج مساحة أكتر — الشباك بيكبر، والواجهة بتقسم الشاشة لو العرض كفاية
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: "راصد",
    icon: assets("icon.png"),
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => win?.show());
  // قفل الشباك = إخفاء بس؛ البرنامج يفضل شغال في شريط المهام
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  // الروابط الخارجية تفتح في المتصفح (http/https بس)، والشباك نفسه ما بيروحش لأي صفحة تانية
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });
  win.on("focus", () => win?.flashFrame(false));
  win.webContents.once("did-finish-load", applyTaskbarBadge);
}

function openExternalSafe(url: string) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

/** الميكروفون (للرسايل الصوتية) بس لشباكنا، وصوت بس من غير كاميرا. أي صلاحية تانية مرفوضة */
function setupPermissions() {
  const ours = (wc: WebContents | null) => Boolean(win && wc && !win.isDestroyed() && wc.id === win.webContents.id);
  const fromApp = (url: string | undefined) => (url ?? "").startsWith("file://");
  electronSession.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission === "media" && ours(wc) && fromApp(details.requestingUrl)) {
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
      return callback(types.length > 0 && types.every((t) => t === "audio"));
    }
    callback(false);
  });
  electronSession.defaultSession.setPermissionCheckHandler((wc, permission, origin, details) => {
    if (permission === "media") return ours(wc) && fromApp(details.requestingUrl ?? origin) && details.mediaType !== "video";
    return ours(wc);
  });
}

// ───────────── علامة الرسايل الجديدة (شريط المهام + الأيقونة اللي جنب الساعة) ─────────────

const trayImages = new Map<string, NativeImage>();
function trayImage(name: string, dot: boolean): NativeImage {
  const key = `${name}:${dot}`;
  let img = trayImages.get(key);
  if (!img) {
    const base = nativeImage.createFromPath(assets(`${name}.png`));
    if (dot && !base.isEmpty()) {
      const { width, height } = base.getSize();
      img = nativeImage.createFromBitmap(Buffer.from(drawBadgeDot(new Uint8Array(base.toBitmap()), width, height)), { width, height });
    } else img = base;
    trayImages.set(key, img);
  }
  return img;
}

let overlay: NativeImage | null = null;
function applyTaskbarBadge() {
  if (process.platform !== "win32") {
    app.setBadgeCount(chatUnread);
    return;
  }
  if (!win || win.isDestroyed()) return;
  overlay ??= nativeImage.createFromBitmap(Buffer.from(badgeCircle(16)), { width: 16, height: 16 });
  win.setOverlayIcon(chatUnread > 0 ? overlay : null, chatUnread > 0 ? `${badgeLabel(chatUnread)} رسالة جديدة` : "");
}

/** يفتح الشباك على تبويب الشات (ولو الشباك لسه بيتحمّل نستنى، والـ preload بيحتفظ بالطلب لحد ما الواجهة تسمع) */
function openChat(conversationId: string | null = null) {
  showWindow();
  const wc = win?.webContents;
  if (!wc) return;
  if (wc.isLoading()) wc.once("did-finish-load", () => wc.send("chat:open", conversationId));
  else wc.send("chat:open", conversationId);
}

function showWindow() {
  if (!win) createWindow();
  win!.show();
  win!.focus();
}

const STATUS_LABEL = { WORKING: "يعمل الآن", ON_BREAK: "في استراحة", OFFLINE: "غير مسجل حضور" } as const;

function updateTray(v: ViewModel) {
  if (!tray) return;
  const status = v.screen === "main" ? v.status : "OFFLINE";
  const main = v.screen === "main";
  const unread = main ? chatUnread : 0;
  tray.setImage(trayImage(`tray-${status === "WORKING" ? "working" : status === "ON_BREAK" ? "break" : "off"}`, unread > 0));
  tray.setToolTip(`راصد — ${STATUS_LABEL[status]}${unread > 0 ? ` • ${badgeLabel(unread)} رسالة جديدة` : ""}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `الحالة: ${STATUS_LABEL[status]}`, enabled: false },
      { type: "separator" },
      { label: "تسجيل حضور", visible: main && status === "OFFLINE", click: () => void controller.checkIn() },
      { label: "استراحة", visible: main && status === "WORKING", click: () => void controller.startBreak() },
      { label: "استئناف العمل", visible: main && status === "ON_BREAK", click: () => void controller.endBreak() },
      { label: "تسجيل انصراف", visible: main && status !== "OFFLINE", click: () => void controller.checkOut() },
      { type: "separator" },
      { label: "فتح البرنامج", click: showWindow },
      { label: unread > 0 ? `الشات (${badgeLabel(unread)} جديد)` : "الشات", visible: main, click: () => openChat() },
      { label: "فتح لوحتي على الموقع", visible: main, click: () => main && void shell.openExternal(v.dashboardUrl) },
      { type: "separator" },
      { label: "خروج", click: () => void quit() },
    ]),
  );
}

/** الخروج بيسجل انصراف الأول، عشان الوقت بعد القفل ما يتحسبش */
async function quit() {
  quitting = true;
  if (controller.status !== "OFFLINE") {
    await Promise.race([controller.checkOut(), new Promise((r) => setTimeout(r, 5000))]);
  }
  controller.stop();
  chat?.stop();
  app.quit();
}

async function boot() {
  app.setAppUserModelId("com.rased.agent");
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });

  const session = createSession();
  controller = new Controller(createApi(session), new SyncQueue(queueStorage), createPlatform(), session, createShotStore());

  tray = new Tray(nativeImage.createFromPath(assets("tray-off.png")));
  tray.on("click", showWindow);
  setupPermissions();

  chat = new ChatMain({
    session,
    window: () => win,
    openConversation: (id) => openChat(id),
    icon: assets("icon.png"),
    onUnread: (n) => {
      chatUnread = n;
      updateTray(lastView);
      applyTaskbarBadge();
    },
  });
  registerChatIpc(chat, (e) => Boolean(win && !win.isDestroyed() && e.sender.id === win.webContents.id));

  controller.onChange((v) => {
    lastView = v;
    // الشات شغال بس والموظف داخل (بعد الموافقة)
    if (v.screen === "main") chat.start();
    else if (v.screen === "login") chat.stop();
    updateTray(v);
    win?.webContents.send("view", v);
  });

  for (const ev of ["lock-screen", "unlock-screen", "suspend", "resume"] as const) {
    powerMonitor.on(ev as "lock-screen", () => controller.onPowerChange());
  }
  powerMonitor.on("resume", () => chat.reconnectNow());
  powerMonitor.on("shutdown", () => void quit());

  ipcMain.handle("view", () => controller.view());
  ipcMain.handle("login", (_e, serverUrl: string, email: string, password: string) => controller.login(String(serverUrl), String(email), String(password)));
  ipcMain.handle("consent", () => controller.consent());
  ipcMain.handle("checkIn", () => controller.checkIn());
  ipcMain.handle("checkOut", () => controller.checkOut());
  ipcMain.handle("startBreak", () => controller.startBreak());
  ipcMain.handle("endBreak", () => controller.endBreak());
  ipcMain.handle("logout", () => controller.logout());
  ipcMain.handle("tasks", () => controller.listTasks());
  ipcMain.handle("setTask", (_e, task: { id: string; name: string; boardName: string } | null) =>
    controller.setTask(task ? { id: String(task.id), name: String(task.name), boardName: String(task.boardName) } : null),
  );
  ipcMain.handle("openDashboard", () => {
    const v = controller.view();
    if (v.screen === "main") void shell.openExternal(v.dashboardUrl);
  });

  // لو البرنامج اتفتح تلقائي مع Windows يفضل في شريط المهام
  if (!process.argv.includes("--hidden")) createWindow();
  await controller.start();
  lastView = controller.view();
  if (lastView.screen === "main") chat.start();
  updateTray(lastView);
}

app.on("window-all-closed", () => {
  // ما نقفلش البرنامج — يفضل شغال في شريط المهام
});

app.on("before-quit", () => {
  quitting = true;
});
