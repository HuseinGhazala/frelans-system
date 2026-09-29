import "server-only";
import type { AlertType } from "@/generated/prisma/enums";
import { db } from "./db";
import { LEAVE_LABEL } from "./leaves";
import { sendMail } from "./mail";
import { getSettings } from "./settings";
import { escapeHtml } from "./utils";

export const ALERT_LABEL: Record<AlertType, string> = {
  ABSENCE: "غياب",
  MISSING_HOURS: "ساعات ناقصة",
  LONG_IDLE: "خمول طويل",
  LOW_PRODUCTIVITY: "إنتاجية منخفضة",
  LEAVE_REQUEST: "طلب إجازة",
};

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** بيعمل تنبيه لو ما اتعملش قبل كده. بيرجع true لو اتعمل جديد. */
export async function createAlert(a: { type: AlertType; userId: string; day: string; dedupeKey: string; message: string; link?: string }) {
  try {
    await db.alert.create({ data: a });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

/** إيميل فوري للمسؤولين (لو الإيميل متظبط) */
export async function emailAdmins(subject: string, html: string) {
  const { alerts } = await getSettings();
  const recipients = alerts.recipients.length
    ? alerts.recipients
    : (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } })).map((u) => u.email);
  for (const to of recipients) await sendMail(to, subject, html);
}

function appUrl(path: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

export async function notifyLeaveRequest(leaveId: string) {
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId }, include: { user: true } });
  if (!leave) return;
  const range = `${leave.startDate.toISOString().slice(0, 10)} → ${leave.endDate.toISOString().slice(0, 10)}`;
  const message = `${leave.user.name} طلب إجازة ${LEAVE_LABEL[leave.type]} (${range}، ${leave.days} يوم)`;
  const created = await createAlert({
    type: "LEAVE_REQUEST",
    userId: leave.userId,
    day: leave.createdAt.toISOString().slice(0, 10),
    dedupeKey: `LEAVE_REQUEST:${leave.id}`,
    message,
    link: "/admin/leaves",
  });
  if (created) await emailAdmins("طلب إجازة جديد — راصد", `<p>${escapeHtml(message)}</p><p><a href="${appUrl("/admin/leaves")}">مراجعة الطلب</a></p>`);
}

export async function unreadAlertCount() {
  return db.alert.count({ where: { readAt: null } });
}
