"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth/dal";
import { getOpenSession } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import type { ActionState } from "./types";

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

function done(): ActionState {
  revalidatePath("/me");
  revalidatePath("/admin");
  return null;
}

/** Check-in من الموقع: بيسجل الوقت بس من غير تتبع نشاط أو سكرين شوت */
export async function checkIn(): Promise<ActionState> {
  const user = await requireEmployee();
  const settings = await getSettings();
  const profile = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { workMode: true } });
  if (profile?.workMode === "TASKS") return { error: "حسابك بنظام التاسكات — مفيش تسجيل حضور" };
  if (!settings.attendance.allowWebCheckIn) return { error: "تسجيل الحضور من الموقع متوقف. استخدم برنامج الديسكتوب." };
  if (await getOpenSession(user.id)) return { error: "انت مسجل حضور بالفعل" };
  try {
    await db.workSession.create({ data: { userId: user.id, source: "WEB", startedAt: new Date() } });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "انت مسجل حضور بالفعل" };
    throw e;
  }
  return done();
}

export async function checkOut(): Promise<ActionState> {
  const user = await requireEmployee();
  const open = await getOpenSession(user.id);
  if (!open) return { error: "انت مش مسجل حضور" };
  const now = new Date();
  await db.$transaction([
    db.break.updateMany({ where: { sessionId: open.id, endedAt: null }, data: { endedAt: now } }),
    db.workSession.update({ where: { id: open.id }, data: { endedAt: now, endReason: "MANUAL" } }),
  ]);
  return done();
}

export async function startBreak(): Promise<ActionState> {
  const user = await requireEmployee();
  const open = await getOpenSession(user.id);
  if (!open) return { error: "سجل حضور الأول" };
  if (open.breaks.length) return { error: "انت في استراحة بالفعل" };
  try {
    await db.break.create({ data: { sessionId: open.id, startedAt: new Date() } });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "انت في استراحة بالفعل" };
    throw e;
  }
  return done();
}

export async function endBreak(): Promise<ActionState> {
  const user = await requireEmployee();
  const open = await getOpenSession(user.id);
  if (!open?.breaks.length) return { error: "انت مش في استراحة" };
  await db.break.updateMany({ where: { sessionId: open.id, endedAt: null }, data: { endedAt: new Date() } });
  return done();
}
