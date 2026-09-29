/** نسخة من AgentState في apps/web/src/lib/agent/protocol.ts */
export type ServerState = {
  serverTime: string;
  companyName: string;
  user: { id: string; name: string; email: string; jobTitle: string | null };
  consentRequired: boolean;
  config: {
    dailyHours: number;
    idleThresholdMin: number;
    autoCheckoutIdleMin: number;
    screenshotIntervalMin: number;
    blurScreenshots: boolean;
  };
  status: "WORKING" | "ON_BREAK" | "OFFLINE";
  session: { id: string; source: "AGENT" | "WEB"; startedAt: string; breakStartedAt: string | null } | null;
  todayWorkedMs: number;
};

/** اللي الواجهة بتعرضه */
export type ViewModel =
  | { screen: "loading" }
  | { screen: "login"; serverUrl: string; error: string | null; busy: boolean }
  | {
      screen: "consent";
      companyName: string;
      userName: string;
      idleThresholdMin: number;
      screenshotIntervalMin: number;
      busy: boolean;
      error: string | null;
    }
  | {
      screen: "main";
      companyName: string;
      user: ServerState["user"];
      status: "WORKING" | "ON_BREAK" | "OFFLINE";
      /** الجلسة مفتوحة من الموقع (من غير تتبع) */
      webSession: boolean;
      sessionStartedAt: number | null;
      breakStartedAt: number | null;
      /** ساعات اليوم لحد baseAt، والواجهة بتزود عليها لو شغال */
      workedBaseMs: number;
      baseAt: number;
      /** بفرق ساعة السيرفر عن الجهاز — عشان العداد */
      clockOffsetMs: number;
      dailyMs: number;
      idleSince: number | null;
      online: boolean;
      pending: number;
      lastSyncAt: number | null;
      error: string | null;
      dashboardUrl: string;
      task: TaskRef | null;
    };

export type TaskRef = { id: string; name: string; boardName: string };
export type TaskCard = TaskRef & { url: string; listName: string; due: string | null };
