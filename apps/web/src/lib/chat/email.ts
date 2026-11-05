import "server-only";
import { db } from "@/lib/db";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { escapeHtml } from "@/lib/utils";
import { isConnected } from "./hub";
import { chatUrlFor } from "./links";
import { selectDigests, type Digest, type UnreadRow } from "./notify-format";

/** الرسايل اللي ماتقرتش أقدم من كده ما بتطلعش إيميل (عشان الاستعلام يفضل خفيف) */
const HORIZON_DAYS = 7;

/**
 * إيميل للرسايل اللي ماتقرتش: لو العضو عنده رسايل (من غيره، مش ممسوحة) أقدم من chat.unreadEmailAfterMin
 * ومش متصل، وآخر إيميل له (أحدث ConversationMember.lastEmailedAt في كل محادثاته) أقدم من chat.unreadEmailEveryMin.
 * إيميل واحد لكل شخص فيه المحادثات وعدد الرسايل وآخر رسالة. الرسايل اللي اتبعت عنها إيميل قبل كده ما بتتحسبش تاني.
 * القناة العامة: الرسايل اللي فيها منشن للشخص بس (زي إشعارات المتصفح).
 * بيتنادى من lib/jobs.ts كل دقيقة.
 */
export async function sendUnreadChatEmails(now: Date): Promise<void> {
  const { chat, general } = await getSettings();
  if (!chat.unreadEmail) return;
  if (!(await isMailConfigured())) return;

  const oldEnough = new Date(now.getTime() - chat.unreadEmailAfterMin * 60_000);
  const throttle = new Date(now.getTime() - chat.unreadEmailEveryMin * 60_000);
  const horizon = new Date(now.getTime() - HORIZON_DAYS * 86_400_000);

  const rows = await db.$queryRaw<UnreadRow[]>`
    WITH emailed AS (
      SELECT "userId", MAX("lastEmailedAt") AS last
      FROM "ConversationMember"
      GROUP BY "userId"
    )
    SELECT cm."userId", u.email, u.name AS "userName", u.role::text AS role,
      c.id AS "conversationId", c.type::text AS "conversationType", c.name AS "conversationName",
      COUNT(m.id)::int AS count,
      MIN(m."createdAt") AS "oldestAt",
      (ARRAY_AGG(m.body ORDER BY m."createdAt" DESC))[1] AS "lastBody",
      (ARRAY_AGG(s.name ORDER BY m."createdAt" DESC))[1] AS "lastSenderName",
      e.last AS "userLastEmailedAt"
    FROM "ConversationMember" cm
    JOIN emailed e ON e."userId" = cm."userId"
    JOIN "User" u ON u.id = cm."userId" AND u.active = true
    JOIN "Conversation" c ON c.id = cm."conversationId" AND c."lastMessageAt" > GREATEST(COALESCE(cm."lastReadAt", cm."joinedAt"), cm."lastEmailedAt")
    JOIN "Message" m ON m."conversationId" = cm."conversationId"
      AND m."senderId" <> cm."userId"
      AND m."deletedAt" IS NULL
      AND m."createdAt" > ${horizon}
      AND m."createdAt" > GREATEST(COALESCE(cm."lastReadAt", cm."joinedAt"), cm."lastEmailedAt")
      AND (c.type <> 'GENERAL' OR EXISTS (
        SELECT 1 FROM "MessageMention" mm WHERE mm."messageId" = m.id AND mm."userId" = cm."userId"))
    JOIN "User" s ON s.id = m."senderId"
    WHERE e.last IS NULL OR e.last <= ${throttle}
    GROUP BY cm."userId", u.email, u.name, u.role, c.id, c.type, c.name, e.last
    HAVING MIN(m."createdAt") <= ${oldEnough}`;

  const digests = selectDigests(rows, { now, afterMin: chat.unreadEmailAfterMin, everyMin: chat.unreadEmailEveryMin, isConnected });
  for (const d of digests) {
    const ok = await sendMail(d.email, digestSubject(d), digestHtml(d, general.companyName));
    if (!ok) continue; // يتجرب تاني الدقيقة الجاية
    await db.conversationMember.updateMany({
      where: { userId: d.userId, conversationId: { in: d.items.map((i) => i.conversationId) } },
      data: { lastEmailedAt: now },
    });
  }
}

function appUrl(path: string) {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

function digestSubject(d: Digest) {
  return `عندك ${d.total} ${d.total === 1 ? "رسالة" : "رسايل"} ماتقرتش في الشات — راصد`;
}

function digestHtml(d: Digest, companyName: string) {
  const td = 'style="border:1px solid #ddd;padding:8px;text-align:right;vertical-align:top"';
  const rows = d.items
    .map(
      (i) =>
        `<tr><td ${td}><a href="${escapeHtml(appUrl(i.url))}"><b>${escapeHtml(i.title)}</b></a></td><td ${td}>${i.count}</td>` +
        `<td ${td}><span style="color:#666">${escapeHtml(i.lastSenderName)}:</span> ${escapeHtml(i.preview)}</td></tr>`,
    )
    .join("");
  return `<p>أهلاً ${escapeHtml(d.userName)}،</p>
<p>عندك رسايل ماتقرتش في شات ${escapeHtml(companyName)}:</p>
<table style="border-collapse:collapse;font-size:14px"><thead><tr><th ${td}>المحادثة</th><th ${td}>العدد</th><th ${td}>آخر رسالة</th></tr></thead>
<tbody>${rows}</tbody></table>
<p><a href="${escapeHtml(appUrl(chatUrlFor(d.role)))}">افتح الشات</a></p>
<p style="color:#888;font-size:12px">الإيميل ده بيوصل لما يكون في رسايل ماتقرتش بقالها شوية وانت مش فاتح الشات.</p>`;
}
