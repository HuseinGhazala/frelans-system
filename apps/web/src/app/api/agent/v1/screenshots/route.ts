import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { authenticateDevice, jsonError, UNAUTHORIZED } from "@/lib/agent/auth";
import { clampTime } from "@/lib/agent/service";
import { putObject } from "@/lib/storage";

const MAX_BYTES = 3 * 1024 * 1024;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** رفع لقطة شاشة (multipart): file + takenAt + display + blurred + width + height + app + domain */
export async function POST(request: Request) {
  const device = await authenticateDevice(request);
  if (!device) return UNAUTHORIZED();
  if (!device.user.monitoringConsentAt) return jsonError("لازم توافق على شروط المراقبة الأول", 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return jsonError("مفيش صورة", 400);
  if (file.size > MAX_BYTES) return jsonError("الصورة كبيرة", 413);
  const body = Buffer.from(await file.arrayBuffer());
  if (!isJpeg(body)) return jsonError("نوع الصورة غير مدعوم", 415);

  const now = new Date();
  const rawAt = new Date(String(form.get("takenAt") ?? ""));
  const takenAt = Number.isNaN(rawAt.getTime()) ? null : clampTime(rawAt, now);
  if (!takenAt) return jsonError("وقت غير صالح", 400);
  const display = Math.max(0, Math.min(9, Number(form.get("display")) || 0));
  const int = (k: string) => Math.max(0, Math.min(20000, Number(form.get(k)) || 0));
  const str = (k: string, max: number) => {
    const v = form.get(k);
    return typeof v === "string" && v ? v.slice(0, max) : null;
  };

  // اللقطة لازم تكون جوه جلسة عمل (مش في استراحة)
  const session = await db.workSession.findFirst({
    where: { userId: device.userId, startedAt: { lte: takenAt }, OR: [{ endedAt: null }, { endedAt: { gte: takenAt } }] },
    include: { breaks: true },
  });
  if (!session) return Response.json({ ok: true, skipped: "no-session" });
  const onBreak = session.breaks.some((b) => b.startedAt <= takenAt && (!b.endedAt || b.endedAt >= takenAt));
  if (onBreak) return Response.json({ ok: true, skipped: "break" });

  const existing = await db.screenshot.findUnique({ where: { userId_takenAt_display: { userId: device.userId, takenAt, display } } });
  if (existing) return Response.json({ ok: true, id: existing.id });

  const d = takenAt.toISOString();
  const storageKey = `screenshots/${device.userId}/${d.slice(0, 10)}/${d.slice(11, 19).replaceAll(":", "")}-${display}-${randomUUID().slice(0, 8)}.jpg`;
  await putObject(storageKey, body, "image/jpeg");
  try {
    const shot = await db.screenshot.create({
      data: {
        userId: device.userId,
        sessionId: session.id,
        takenAt,
        display,
        storageKey,
        width: int("width"),
        height: int("height"),
        bytes: body.length,
        blurred: form.get("blurred") === "true",
        app: str("app", 200),
        domain: str("domain", 200),
      },
    });
    return Response.json({ ok: true, id: shot.id });
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ ok: true });
    throw e;
  }
}
