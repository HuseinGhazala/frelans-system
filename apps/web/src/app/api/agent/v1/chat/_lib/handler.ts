import "server-only";
import { z } from "zod";
import { authenticateDevice, jsonError, UNAUTHORIZED } from "@/lib/agent/auth";
import { ChatError, type Viewer } from "@/lib/chat/service";

/**
 * مساعد مشترك لكل مسارات شات البرنامج (/api/agent/v1/chat/*):
 * بيتأكد من توكن الجهاز، ويبني Viewer من صاحب الجهاز، ويحوّل ChatError لـ JSON.
 * كل المنطق في lib/chat/service — المسارات رفيعة.
 */
export async function chatRoute(request: Request, handler: (viewer: Viewer) => Promise<unknown>): Promise<Response> {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  const viewer: Viewer = { id: device.user.id, role: device.user.role, name: device.user.name };
  try {
    const out = await handler(viewer);
    return out instanceof Response ? out : Response.json(out ?? { ok: true });
  } catch (err) {
    return chatErrorResponse(err);
  }
}

/** ChatError → {error} بالـ status بتاعه. أي خطأ تاني بيترمي (500 + يتسجل) */
export function chatErrorResponse(err: unknown): Response {
  if (err instanceof ChatError) return jsonError(err.message, err.status);
  throw err;
}

/** بيقرا body الطلب ويتأكد منه بـ zod، ولو غلط يرمي ChatError 400 */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ChatError("بيانات غير صالحة", 400);
  return parsed.data;
}

export const idSchema = z.string().trim().min(1).max(64);
export const idListSchema = z.array(idSchema).max(200);
