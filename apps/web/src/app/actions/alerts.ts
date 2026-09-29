"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export async function markAlertsRead(ids?: string[]) {
  await requireAdmin();
  await db.alert.updateMany({ where: { readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
  revalidatePath("/admin", "layout");
}
