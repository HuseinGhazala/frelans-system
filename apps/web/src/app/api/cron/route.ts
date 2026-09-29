import { timingSafeEqual } from "node:crypto";
import { runScheduledJobs } from "@/lib/jobs";

/** تشغيل المهام الدورية من برّه (Vercel Cron أو أي scheduler): Authorization: Bearer CRON_SECRET */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  await runScheduledJobs();
  return Response.json({ ok: true });
}
