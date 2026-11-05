import { app, Notification, powerMonitor } from "electron";
import { autoUpdater } from "electron-updater";
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, shouldCheck, type UpdateState } from "../core/update-policy";

/**
 * التحديث التلقائي من GitHub Releases.
 * electron-builder بيحط رابط التحديث (publish → generic) جوه البرنامج، و workflow البناء بيرفع latest.yml
 * مع ملف التسطيب، فالبرنامج بيقرا: https://github.com/<repo>/releases/latest/download/latest.yml
 * بيشتغل بس في النسخة المتسطبة على Windows (مش وقت التطوير).
 */
export class Updater {
  state: UpdateState = { phase: "idle" };
  private lastCheckAt: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  private notified = false;

  constructor(
    private opts: {
      icon: string;
      onChange: (s: UpdateState) => void;
      /** الموظف ضغط على الإشعار */
      onNotificationClick: () => void;
    },
  ) {}

  get enabled() {
    return app.isPackaged && process.platform === "win32";
  }

  start() {
    if (!this.enabled) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
      info: (m: unknown) => console.log("[updater]", m),
      warn: (m: unknown) => console.warn("[updater]", m),
      error: (m: unknown) => console.error("[updater]", m),
      debug: () => {},
    };

    autoUpdater.on("checking-for-update", () => this.set({ phase: "checking" }));
    autoUpdater.on("update-not-available", () => this.set({ phase: "idle" }));
    autoUpdater.on("update-available", (info) => this.set({ phase: "downloading", version: info.version, percent: 0 }));
    autoUpdater.on("download-progress", (p) => {
      if (this.state.phase === "downloading") this.set({ ...this.state, percent: p.percent });
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.set({ phase: "ready", version: info.version });
      this.notify(info.version);
    });
    autoUpdater.on("error", (err) => {
      // مشكلة نت أو GitHub — نحاول تاني في الميعاد الجاي من غير ما نزعج الموظف
      console.error("[updater] error", err);
      if (this.state.phase !== "ready") this.set({ phase: "error", message: String(err?.message ?? err) });
    });

    this.timers.push(setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS));
    this.timers.push(setInterval(() => this.check(), CHECK_INTERVAL_MS));
    powerMonitor.on("resume", () => this.check());
  }

  check() {
    if (!this.enabled || this.state.phase === "ready" || this.state.phase === "downloading") return;
    const now = Date.now();
    if (!shouldCheck(this.lastCheckAt, now)) return;
    this.lastCheckAt = now;
    autoUpdater.checkForUpdates().catch((err) => console.error("[updater] check failed", err));
  }

  /** يقفل البرنامج ويسطّب التحديث ويفتحه تاني (من غير أسئلة من الـ installer) */
  install() {
    if (this.state.phase !== "ready") return;
    autoUpdater.quitAndInstall(true, true);
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private set(s: UpdateState) {
    this.state = s;
    this.opts.onChange(s);
  }

  private notify(version: string) {
    if (this.notified || !Notification.isSupported()) return;
    this.notified = true;
    const n = new Notification({
      title: "تحديث جديد لراصد",
      body: `النسخة ${version} جاهزة. هتتسطب لوحدها لما تقفل البرنامج، أو اضغط هنا وحدّث دلوقتي.`,
      icon: this.opts.icon,
      silent: true,
    });
    n.on("click", () => this.opts.onNotificationClick());
    n.show();
  }
}
