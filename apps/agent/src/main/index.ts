import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, shell, Tray } from "electron";
import path from "node:path";
import { Controller } from "../core/controller";
import { SyncQueue } from "../core/queue";
import type { ViewModel } from "../core/types";
import { createApi } from "./api";
import { createPlatform } from "./platform";
import { createSession, queueStorage } from "./store";

const assets = (name: string) => path.join(__dirname, "..", "assets", name);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: Controller;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(boot);
}

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 640,
    resizable: false,
    maximizable: false,
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
  // الروابط الخارجية تفتح في المتصفح
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
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
  tray.setImage(assets(`tray-${status === "WORKING" ? "working" : status === "ON_BREAK" ? "break" : "off"}.png`));
  tray.setToolTip(`راصد — ${STATUS_LABEL[status]}`);
  const main = v.screen === "main";
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
  app.quit();
}

async function boot() {
  app.setAppUserModelId("com.rased.agent");
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });

  const session = createSession();
  controller = new Controller(createApi(session), new SyncQueue(queueStorage), createPlatform(), session);

  tray = new Tray(nativeImage.createFromPath(assets("tray-off.png")));
  tray.on("click", showWindow);

  controller.onChange((v) => {
    updateTray(v);
    win?.webContents.send("view", v);
  });

  for (const ev of ["lock-screen", "unlock-screen", "suspend", "resume"] as const) {
    powerMonitor.on(ev as "lock-screen", () => controller.onPowerChange());
  }
  powerMonitor.on("shutdown", () => void quit());

  ipcMain.handle("view", () => controller.view());
  ipcMain.handle("login", (_e, serverUrl: string, email: string, password: string) => controller.login(String(serverUrl), String(email), String(password)));
  ipcMain.handle("consent", () => controller.consent());
  ipcMain.handle("checkIn", () => controller.checkIn());
  ipcMain.handle("checkOut", () => controller.checkOut());
  ipcMain.handle("startBreak", () => controller.startBreak());
  ipcMain.handle("endBreak", () => controller.endBreak());
  ipcMain.handle("logout", () => controller.logout());
  ipcMain.handle("openDashboard", () => {
    const v = controller.view();
    if (v.screen === "main") void shell.openExternal(v.dashboardUrl);
  });

  // لو البرنامج اتفتح تلقائي مع Windows يفضل في شريط المهام
  if (!process.argv.includes("--hidden")) createWindow();
  await controller.start();
  updateTray(controller.view());
}

app.on("window-all-closed", () => {
  // ما نقفلش البرنامج — يفضل شغال في شريط المهام
});

app.on("before-quit", () => {
  quitting = true;
});
