import * as z from "zod";

/**
 * بروتوكول برنامج الديسكتوب (v1). البرنامج بيبعت الأحداث بالترتيب في طابور،
 * وكل حدث له id عشان لو اتبعت مرتين (بعد قطع نت) ما يتكررش.
 * كل الأوقات ISO وبتوقيت السيرفر (البرنامج بيصحح فرق ساعة الجهاز).
 */
const iso = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1).max(64), type: z.literal("check_in"), at: iso }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("check_out"), at: iso, reason: z.enum(["MANUAL", "AUTO_IDLE"]).default("MANUAL") }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("break_start"), at: iso }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("break_end"), at: iso }),
  z.object({ id: z.string().min(1).max(64), type: z.literal("idle"), at: iso, endAt: iso }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

export const activityMinuteSchema = z.object({
  minute: iso,
  keyboard: z.number().int().min(0).max(100_000),
  mouse: z.number().int().min(0).max(100_000),
  app: z.string().max(200).nullish(),
  title: z.string().max(300).nullish(),
  domain: z.string().max(200).nullish(),
  idle: z.boolean().default(false),
});
export type ActivityMinuteInput = z.infer<typeof activityMinuteSchema>;

export const syncSchema = z.object({
  events: z.array(agentEventSchema).max(500).default([]),
  minutes: z.array(activityMinuteSchema).max(2000).default([]),
  /** لو الموظف خامل دلوقتي: من إمتى (للمتابعة المباشرة) */
  idleSince: iso.nullish(),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
  deviceName: z.string().trim().min(1).max(100),
  os: z.string().trim().min(1).max(50),
  appVersion: z.string().trim().max(30).optional(),
});

export type AgentStatus = "WORKING" | "ON_BREAK" | "OFFLINE";

export type AgentState = {
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
  status: AgentStatus;
  session: { id: string; source: "AGENT" | "WEB"; startedAt: string; breakStartedAt: string | null } | null;
  todayWorkedMs: number;
};
