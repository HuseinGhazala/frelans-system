import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { readObject } from "@/lib/storage";

/** عرض لقطة: للأدمن بس */
export async function GET(_request: Request, ctx: RouteContext<"/api/screenshots/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const shot = await db.screenshot.findUnique({ where: { id } });
  if (!shot) return new Response("Not found", { status: 404 });

  const obj = await readObject(shot.storageKey).catch(() => null);
  if (!obj) return new Response("Not found", { status: 404 });
  if ("redirect" in obj) return Response.redirect(obj.redirect, 302);
  return new Response(new Uint8Array(obj.body), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
