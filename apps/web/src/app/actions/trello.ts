"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings, saveSettingsSection } from "@/lib/settings";
import { listBoards, saveTrelloBoards, syncTrello, TrelloError } from "@/lib/trello";
import type { ActionState } from "./types";

/** حفظ مفتاح وتوكن Trello بعد التأكد إنهم شغالين */
export async function connectTrello(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const { trello } = await getSettings();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  // لو التوكن فاضي نستخدم القديم
  const token = String(formData.get("token") ?? "").trim() || trello.token;
  if (!apiKey || !token) return { error: "اكتب الـ API Key والتوكن" };
  try {
    await listBoards({ apiKey, token });
  } catch (e) {
    return { error: e instanceof TrelloError ? e.message : "مش قادر يوصل لـ Trello" };
  }
  await saveSettingsSection("trello", { ...trello, apiKey, token });
  await audit(admin.id, "trello.connected");
  revalidatePath("/admin/settings");
  return { success: "تم الربط — اختار البوردات تحت" };
}

export async function chooseTrelloBoards(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const ids = formData.getAll("boardIds").map(String).filter(Boolean);
  await saveTrelloBoards(ids);
  await audit(admin.id, "trello.boards_selected", undefined, { count: ids.length });
  try {
    const r = await syncTrello();
    revalidatePath("/admin", "layout");
    return { success: `تم الحفظ والمزامنة: ${r.cards} كارت من ${r.boards} بورد` };
  } catch (e) {
    return { error: e instanceof TrelloError ? e.message : "فشلت المزامنة" };
  }
}

export async function syncTrelloNow(): Promise<ActionState> {
  await requireAdmin();
  try {
    const r = await syncTrello();
    revalidatePath("/admin", "layout");
    return { success: `تمت المزامنة: ${r.cards} كارت` };
  } catch (e) {
    return { error: e instanceof TrelloError ? e.message : "فشلت المزامنة" };
  }
}

export async function disconnectTrello() {
  const admin = await requireAdmin();
  await saveSettingsSection("trello", { apiKey: "", token: "", boardIds: [] });
  await audit(admin.id, "trello.disconnected");
  revalidatePath("/admin/settings");
}
