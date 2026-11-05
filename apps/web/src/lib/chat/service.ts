import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { publish } from "./hub";
import { extractMentionIds, plainText } from "./mentions";
import { onMessageCreated } from "./notify";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_GROUP_NAME,
  MAX_MESSAGE_LENGTH,
  messagePreview,
  type ChatMessage,
  type ConversationSummary,
} from "./types";

/**
 * قلب الشات: كل العمليات بتعدي من هنا (Server Actions بتاعة الموقع، و API برنامج الديسكتوب).
 * القواعد:
 * - القراءة: العضو، أو الأدمن (أي محادثة — ولو مش عضو بتتسجل في سجل العمليات).
 * - الكتابة: الأعضاء بس.
 * - التعديل/الحذف: صاحب الرسالة خلال chat.editWindowMin. الأدمن يقدر يمسح أي رسالة في أي وقت.
 * - الرسايل المحذوفة/النسخ القديمة: الأدمن بيشوف الأصل، الباقي لأ.
 */

export type Viewer = { id: string; role: "ADMIN" | "EMPLOYEE"; name: string };

export class ChatError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

const GENERAL_KEY = "GENERAL";
const GENERAL_TITLE = "القناة العامة";
const PAGE_SIZE = 50;

const userSelect = { id: true, name: true, role: true, jobTitle: true, active: true } as const;

const messageInclude = {
  attachments: { orderBy: { createdAt: "asc" } },
  mentions: { select: { userId: true } },
  replyTo: { select: { id: true, senderId: true, body: true, deletedAt: true, _count: { select: { attachments: true } } } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;
type MessageRowWithEdits = MessageRow & { edits?: { body: string; createdAt: Date }[] };

function toChatMessage(m: MessageRowWithEdits, viewer: Viewer): ChatMessage {
  const isAdmin = viewer.role === "ADMIN";
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    body: deleted && !isAdmin ? "" : m.body,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderId: m.replyTo.senderId,
          body: m.replyTo.deletedAt && !isAdmin ? "" : plainText(m.replyTo.body).slice(0, 200),
          deleted: Boolean(m.replyTo.deletedAt),
          hasAttachments: m.replyTo._count.attachments > 0,
        }
      : null,
    attachments:
      deleted && !isAdmin
        ? []
        : m.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            name: a.name,
            mime: a.mime,
            bytes: a.bytes,
            width: a.width,
            height: a.height,
            durationSec: a.durationSec,
            expired: Boolean(a.expiredAt),
          })),
    mentionIds: m.mentions.map((x) => x.userId),
    ...(isAdmin && m.edits ? { edits: m.edits.map((e) => ({ body: e.body, createdAt: e.createdAt.toISOString() })) } : {}),
  };
}

// ───────────── القناة العامة ─────────────

/** بتتأكد إن القناة العامة موجودة وإن كل المستخدمين النشطين أعضاء فيها (والمتوقفين اتشالوا) */
export async function ensureGeneralConversation(): Promise<string> {
  const conv = await db.conversation.upsert({
    where: { uniqueKey: GENERAL_KEY },
    create: { type: "GENERAL", uniqueKey: GENERAL_KEY, name: GENERAL_TITLE },
    update: {},
    select: { id: true },
  });
  const [active, members] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true } }),
    db.conversationMember.findMany({ where: { conversationId: conv.id }, select: { userId: true } }),
  ]);
  const activeIds = new Set(active.map((u) => u.id));
  const memberIds = new Set(members.map((m) => m.userId));
  const toAdd = [...activeIds].filter((id) => !memberIds.has(id));
  const toRemove = [...memberIds].filter((id) => !activeIds.has(id));
  if (toAdd.length) {
    await db.conversationMember.createMany({ data: toAdd.map((userId) => ({ conversationId: conv.id, userId })), skipDuplicates: true });
  }
  if (toRemove.length) {
    await db.conversationMember.deleteMany({ where: { conversationId: conv.id, userId: { in: toRemove } } });
  }
  return conv.id;
}

// ───────────── الصلاحيات ─────────────

async function loadConversation(conversationId: string) {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { include: { user: { select: userSelect } }, orderBy: { joinedAt: "asc" } } },
  });
  if (!conv) throw new ChatError("المحادثة مش موجودة", 404);
  return conv;
}
type LoadedConversation = Awaited<ReturnType<typeof loadConversation>>;

function memberOf(conv: LoadedConversation, userId: string) {
  return conv.members.find((m) => m.userId === userId) ?? null;
}

/** للقراءة: عضو أو أدمن. لو أدمن مش عضو بيتسجل في سجل العمليات (مرة كل ساعة لنفس المحادثة) */
async function assertCanRead(viewer: Viewer, conv: LoadedConversation) {
  if (memberOf(conv, viewer.id)) return;
  if (viewer.role !== "ADMIN") throw new ChatError("المحادثة مش موجودة", 404);
  const recent = await db.auditLog.findFirst({
    where: { actorId: viewer.id, action: "chat.monitor.view", targetId: conv.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    select: { id: true },
  });
  if (!recent) await audit(viewer.id, "chat.monitor.view", { type: "Conversation", id: conv.id });
}

function assertMember(viewer: Viewer, conv: LoadedConversation) {
  const m = memberOf(conv, viewer.id);
  if (!m) throw new ChatError("انت مش عضو في المحادثة دي", 403);
  return m;
}

function memberIdsOf(conv: LoadedConversation) {
  return conv.members.map((m) => m.userId);
}

// ───────────── المحادثات ─────────────

function titleFor(conv: LoadedConversation, viewer: Viewer) {
  if (conv.type === "GENERAL") return GENERAL_TITLE;
  if (conv.type === "GROUP") return conv.name ?? "جروب";
  const others = conv.members.filter((m) => m.userId !== viewer.id);
  // الأدمن من صفحة المراقبة بيشوف الاسمين
  if (!memberOf(conv, viewer.id)) return conv.members.map((m) => m.user.name).join(" ↔ ");
  return others[0]?.user.name ?? "محادثة";
}

async function summarize(convs: LoadedConversation[], viewer: Viewer): Promise<ConversationSummary[]> {
  if (convs.length === 0) return [];
  const ids = convs.map((c) => c.id);
  // DISTINCT ON بدل distinct بتاع Prisma (اللي بيجيب كل رسايل المحادثات ويفلتر في الذاكرة)
  const lastRows = await db.$queryRaw<{ id: string; conversationId: string; senderId: string; body: string; deletedAt: Date | null; createdAt: Date }[]>`
    SELECT DISTINCT ON (m."conversationId") m."id", m."conversationId", m."senderId", m."body", m."deletedAt", m."createdAt"
    FROM "Message" m
    WHERE m."conversationId" IN (${Prisma.join(ids)})
    ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC`;
  const firstAttachments = lastRows.length
    ? await db.attachment.findMany({
        where: { messageId: { in: lastRows.map((r) => r.id) } },
        select: { messageId: true, kind: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const kindsBy = new Map<string, { kind: (typeof firstAttachments)[number]["kind"] }[]>();
  for (const a of firstAttachments) if (a.messageId && !kindsBy.has(a.messageId)) kindsBy.set(a.messageId, [{ kind: a.kind }]);
  const lastBy = new Map(lastRows.map((m) => [m.conversationId, { ...m, attachments: kindsBy.get(m.id) ?? [] }]));
  const unreadRows = await db.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT m."conversationId", COUNT(*)::bigint AS count
    FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${viewer.id}
    WHERE m."conversationId" IN (${Prisma.join(ids)})
      AND m."senderId" <> ${viewer.id}
      AND m."deletedAt" IS NULL
      AND m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")
    GROUP BY m."conversationId"`;
  const unreadBy = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

  return convs.map((c) => {
    const last = lastBy.get(c.id);
    const me = memberOf(c, viewer.id);
    return {
      id: c.id,
      type: c.type,
      title: titleFor(c, viewer),
      members: c.members.map((m) => ({ ...m.user, memberRole: m.role, lastReadAt: m.lastReadAt?.toISOString() ?? null })),
      lastMessage: last
        ? {
            id: last.id,
            senderId: last.senderId,
            preview: plainText(
              messagePreview({ body: last.body, deletedAt: last.deletedAt?.toISOString() ?? null, attachments: last.attachments }),
            ),
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      unread: unreadBy.get(c.id) ?? 0,
      isMember: Boolean(me),
      myRole: me?.role ?? null,
    };
  });
}

async function summaryFor(conversationId: string, viewer: Viewer) {
  const [s] = await summarize([await loadConversation(conversationId)], viewer);
  return s;
}

/** يبعت conversation.updated لكل عضو بالملخص الخاص بيه (العنوان وعدد غير المقروء بيختلفوا) */
async function publishConversation(conversationId: string) {
  const conv = await loadConversation(conversationId);
  for (const m of conv.members) {
    const viewer: Viewer = { id: m.userId, role: m.user.role, name: m.user.name };
    const [s] = await summarize([conv], viewer);
    publish([m.userId], { type: "conversation.updated", conversation: s });
  }
}

/** محادثات المستخدم (اللي هو عضو فيها)، الأحدث الأول */
export async function listConversations(viewer: Viewer): Promise<ConversationSummary[]> {
  await ensureGeneralConversation();
  const convs = await db.conversation.findMany({
    where: { members: { some: { userId: viewer.id } } },
    include: { members: { include: { user: { select: userSelect } }, orderBy: { joinedAt: "asc" } } },
    orderBy: { lastMessageAt: "desc" },
  });
  return summarize(convs, viewer);
}

/** للأدمن (صفحة المراقبة): كل المحادثات، مع فلتر اختياري بموظف */
export async function listAllConversations(viewer: Viewer, opts: { userId?: string } = {}): Promise<ConversationSummary[]> {
  if (viewer.role !== "ADMIN") throw new ChatError("مش مسموح", 403);
  const convs = await db.conversation.findMany({
    where: opts.userId ? { members: { some: { userId: opts.userId } } } : {},
    include: { members: { include: { user: { select: userSelect } }, orderBy: { joinedAt: "asc" } } },
    orderBy: { lastMessageAt: "desc" },
    take: 500,
  });
  return summarize(convs, viewer);
}

export async function getConversation(viewer: Viewer, conversationId: string): Promise<ConversationSummary> {
  const conv = await loadConversation(conversationId);
  await assertCanRead(viewer, conv);
  const [s] = await summarize([conv], viewer);
  return s;
}

/** المستخدمين اللي ينفع تكلمهم (كل النشطين ما عدا نفسك) */
export async function listChatUsers(viewer: Viewer) {
  return db.user.findMany({ where: { active: true, id: { not: viewer.id } }, select: userSelect, orderBy: { name: "asc" } });
}

/** يفتح المحادثة الخاصة مع شخص (أو يعملها لو مش موجودة) */
export async function openDirect(viewer: Viewer, otherUserId: string): Promise<ConversationSummary> {
  if (otherUserId === viewer.id) throw new ChatError("مينفعش تكلم نفسك");
  const other = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true, active: true } });
  if (!other?.active) throw new ChatError("المستخدم مش موجود", 404);
  const key = [viewer.id, otherUserId].sort().join(":");
  let conv = await db.conversation.findUnique({ where: { uniqueKey: key }, select: { id: true } });
  let created = false;
  if (!conv) {
    try {
      conv = await db.conversation.create({
        data: {
          type: "DIRECT",
          uniqueKey: key,
          createdById: viewer.id,
          members: { create: [{ userId: viewer.id }, { userId: otherUserId }] },
        },
        select: { id: true },
      });
      created = true;
    } catch (err) {
      // اتعملت في نفس اللحظة من الطرف التاني
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        conv = await db.conversation.findUniqueOrThrow({ where: { uniqueKey: key }, select: { id: true } });
      } else throw err;
    }
  }
  if (created) await publishConversation(conv.id);
  return summaryFor(conv.id, viewer);
}

function cleanName(name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new ChatError("اكتب اسم الجروب");
  if (n.length > MAX_GROUP_NAME) throw new ChatError("اسم الجروب طويل");
  return n;
}

async function activeUserIds(ids: string[]) {
  const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function createGroup(viewer: Viewer, input: { name: string; memberIds: string[] }): Promise<ConversationSummary> {
  const name = cleanName(input.name);
  const others = (await activeUserIds([...new Set(input.memberIds)])).filter((id) => id !== viewer.id);
  if (others.length === 0) throw new ChatError("اختار عضو واحد على الأقل");
  const conv = await db.conversation.create({
    data: {
      type: "GROUP",
      name,
      createdById: viewer.id,
      members: { create: [{ userId: viewer.id, role: "OWNER" }, ...others.map((userId) => ({ userId }))] },
    },
    select: { id: true },
  });
  await audit(viewer.id, "chat.group.create", { type: "Conversation", id: conv.id }, { name, members: others.length + 1 });
  await publishConversation(conv.id);
  return summaryFor(conv.id, viewer);
}

/** إدارة الجروب: صاحب الجروب أو الأدمن */
function assertCanManage(viewer: Viewer, conv: LoadedConversation) {
  if (conv.type !== "GROUP") throw new ChatError("ده مش جروب");
  if (viewer.role === "ADMIN") return;
  if (memberOf(conv, viewer.id)?.role !== "OWNER") throw new ChatError("صاحب الجروب بس اللي يقدر يعمل كده", 403);
}

export async function renameGroup(viewer: Viewer, conversationId: string, name: string) {
  const conv = await loadConversation(conversationId);
  assertCanManage(viewer, conv);
  await db.conversation.update({ where: { id: conv.id }, data: { name: cleanName(name) } });
  await publishConversation(conv.id);
}

/** إضافة أعضاء: أي عضو في الجروب (أي حد يضيف زمايله) أو الأدمن */
export async function addMembers(viewer: Viewer, conversationId: string, userIds: string[]) {
  const conv = await loadConversation(conversationId);
  if (conv.type !== "GROUP") throw new ChatError("ده مش جروب");
  if (!memberOf(conv, viewer.id) && viewer.role !== "ADMIN") throw new ChatError("انت مش عضو في الجروب", 403);
  const ids = (await activeUserIds([...new Set(userIds)])).filter((id) => !memberOf(conv, id));
  if (ids.length === 0) return;
  await db.conversationMember.createMany({ data: ids.map((userId) => ({ conversationId: conv.id, userId })), skipDuplicates: true });
  await audit(viewer.id, "chat.group.add", { type: "Conversation", id: conv.id }, { userIds: ids });
  await publishConversation(conv.id);
}

/** شيل عضو (صاحب الجروب أو الأدمن)، أو خروج الشخص بنفسه */
export async function removeMember(viewer: Viewer, conversationId: string, userId: string) {
  const conv = await loadConversation(conversationId);
  if (conv.type !== "GROUP") throw new ChatError("ده مش جروب");
  const target = memberOf(conv, userId);
  if (!target) return;
  if (userId !== viewer.id) assertCanManage(viewer, conv);
  await db.conversationMember.delete({ where: { conversationId_userId: { conversationId: conv.id, userId } } });
  // لو صاحب الجروب خرج، أقدم عضو يبقى صاحبه
  if (target.role === "OWNER") {
    const next = conv.members.find((m) => m.userId !== userId);
    if (next) await db.conversationMember.update({ where: { conversationId_userId: { conversationId: conv.id, userId: next.userId } }, data: { role: "OWNER" } });
  }
  await audit(viewer.id, userId === viewer.id ? "chat.group.leave" : "chat.group.remove", { type: "Conversation", id: conv.id }, { userId });
  publish([userId], { type: "conversation.removed", conversationId: conv.id });
  if (conv.members.length > 1) await publishConversation(conv.id);
}

// ───────────── الرسايل ─────────────

/** رسايل المحادثة، الأقدم الأول. before = id رسالة عشان تحمّل اللي قبلها */
export async function getMessages(
  viewer: Viewer,
  conversationId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const conv = await loadConversation(conversationId);
  await assertCanRead(viewer, conv);
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 100);
  let cursor: { id: string; createdAt: Date } | null = null;
  if (opts.before) {
    cursor = await db.message.findFirst({ where: { id: opts.before, conversationId }, select: { id: true, createdAt: true } });
  }
  const rows = await db.message.findMany({
    where: {
      conversationId,
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    include: { ...messageInclude, ...(viewer.role === "ADMIN" ? { edits: { orderBy: { createdAt: "asc" as const } } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map((m) => toChatMessage(m, viewer)), hasMore };
}

async function loadMessage(messageId: string) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: messageInclude });
  if (!m) throw new ChatError("الرسالة مش موجودة", 404);
  return m;
}

/** نسخة الرسالة لكل عضو (الأدمن بيشوف الأصل لو اتمسحت) */
async function publishMessage(type: "message.created" | "message.updated", conv: LoadedConversation, messageId: string) {
  const full = await db.message.findUniqueOrThrow({ where: { id: messageId }, include: { ...messageInclude, edits: { orderBy: { createdAt: "asc" } } } });
  for (const m of conv.members) {
    const viewer: Viewer = { id: m.userId, role: m.user.role, name: m.user.name };
    publish([m.userId], { type, message: toChatMessage(full, viewer) });
  }
}

export async function sendMessage(
  viewer: Viewer,
  input: { conversationId: string; body: string; replyToId?: string | null; attachmentIds?: string[] },
): Promise<ChatMessage> {
  const conv = await loadConversation(input.conversationId);
  assertMember(viewer, conv);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (body.length > MAX_MESSAGE_LENGTH) throw new ChatError("الرسالة طويلة جدًا");
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  if (attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new ChatError(`أقصى عدد ملفات ${MAX_ATTACHMENTS_PER_MESSAGE}`);
  if (!body && attachmentIds.length === 0) throw new ChatError("الرسالة فاضية");

  if (attachmentIds.length) {
    const ok = await db.attachment.count({ where: { id: { in: attachmentIds }, uploaderId: viewer.id, messageId: null, expiredAt: null } });
    if (ok !== attachmentIds.length) throw new ChatError("في ملف مش موجود، ارفعه تاني");
  }
  let replyToId: string | null = null;
  if (input.replyToId) {
    const r = await db.message.findFirst({ where: { id: input.replyToId, conversationId: conv.id }, select: { id: true } });
    replyToId = r?.id ?? null;
  }
  const memberIds = new Set(memberIdsOf(conv));
  const mentionIds = extractMentionIds(body).filter((id) => memberIds.has(id) && id !== viewer.id);

  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        conversationId: conv.id,
        senderId: viewer.id,
        body,
        replyToId,
        createdAt: now,
        mentions: mentionIds.length ? { create: mentionIds.map((userId) => ({ userId })) } : undefined,
      },
      select: { id: true },
    });
    if (attachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: m.id } });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now } });
    // اللي بعت قرا المحادثة لحد رسالته
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId: conv.id, userId: viewer.id } }, data: { lastReadAt: now } });
    return m;
  });

  await publishMessage("message.created", conv, created.id);
  publish(memberIdsOf(conv), { type: "read", conversationId: conv.id, userId: viewer.id, lastReadAt: now.toISOString() });
  const message = toChatMessage(await loadMessage(created.id), viewer);
  const recipients = memberIdsOf(conv).filter((id) => id !== viewer.id);
  void onMessageCreated({ message, conversationId: conv.id, conversationType: conv.type, title: conv.name ?? null, sender: viewer, recipientIds: recipients, mentionIds }).catch(
    (err) => console.error("chat notify failed", err),
  );
  return message;
}

async function editWindowMs() {
  return (await getSettings()).chat.editWindowMin * 60_000;
}

export async function editMessage(viewer: Viewer, messageId: string, body: string): Promise<ChatMessage> {
  const m = await loadMessage(messageId);
  if (m.senderId !== viewer.id) throw new ChatError("مينفعش تعدل رسالة حد تاني", 403);
  if (m.deletedAt) throw new ChatError("الرسالة اتمسحت");
  if (Date.now() - m.createdAt.getTime() > (await editWindowMs())) throw new ChatError("وقت التعديل خلص");
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text && m.attachments.length === 0) throw new ChatError("الرسالة فاضية");
  if (text.length > MAX_MESSAGE_LENGTH) throw new ChatError("الرسالة طويلة جدًا");
  if (text === m.body) return toChatMessage(m, viewer);
  const conv = await loadConversation(m.conversationId);
  assertMember(viewer, conv);
  const memberIds = new Set(memberIdsOf(conv));
  const mentionIds = extractMentionIds(text).filter((id) => memberIds.has(id) && id !== viewer.id);
  await db.$transaction([
    db.messageEdit.create({ data: { messageId: m.id, editorId: viewer.id, body: m.body } }),
    db.messageMention.deleteMany({ where: { messageId: m.id } }),
    db.message.update({
      where: { id: m.id },
      data: { body: text, editedAt: new Date(), mentions: mentionIds.length ? { create: mentionIds.map((userId) => ({ userId })) } : undefined },
    }),
  ]);
  await publishMessage("message.updated", conv, m.id);
  return toChatMessage(await loadMessage(m.id), viewer);
}

export async function deleteMessage(viewer: Viewer, messageId: string) {
  const m = await loadMessage(messageId);
  if (m.deletedAt) return;
  const isAdmin = viewer.role === "ADMIN";
  if (!isAdmin) {
    if (m.senderId !== viewer.id) throw new ChatError("مينفعش تمسح رسالة حد تاني", 403);
    if (Date.now() - m.createdAt.getTime() > (await editWindowMs())) throw new ChatError("وقت الحذف خلص");
  }
  const conv = await loadConversation(m.conversationId);
  if (!isAdmin) assertMember(viewer, conv);
  await db.message.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
  if (m.senderId !== viewer.id) await audit(viewer.id, "chat.message.delete", { type: "Message", id: m.id }, { conversationId: conv.id, senderId: m.senderId });
  // الموظفين بيوصلهم حذف، والأدمن بيوصله تحديث (عشان يشوف الأصل متعلّم عليه)
  for (const mem of conv.members) {
    if (mem.user.role === "ADMIN") {
      const full = await db.message.findUniqueOrThrow({ where: { id: m.id }, include: { ...messageInclude, edits: true } });
      publish([mem.userId], { type: "message.updated", message: toChatMessage(full, { id: mem.userId, role: "ADMIN", name: mem.user.name }) });
    } else {
      publish([mem.userId], { type: "message.deleted", conversationId: conv.id, messageId: m.id });
    }
  }
}

/** قرا المحادثة لحد دلوقتي */
export async function markRead(viewer: Viewer, conversationId: string) {
  const conv = await loadConversation(conversationId);
  const me = memberOf(conv, viewer.id);
  if (!me) return; // الأدمن من المراقبة: مفيش علامة قراءة
  const now = new Date();
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: viewer.id } }, data: { lastReadAt: now } });
  publish(memberIdsOf(conv), { type: "read", conversationId, userId: viewer.id, lastReadAt: now.toISOString() });
}

const lastTyping = new Map<string, number>();
/** "بيكتب دلوقتي" — مش بيتخزن. العميل يبعته كل ~3 ثواني وهو بيكتب، والعرض يختفي بعد ~5 ثواني */
export async function setTyping(viewer: Viewer, conversationId: string) {
  const key = `${viewer.id}:${conversationId}`;
  const now = Date.now();
  if (now - (lastTyping.get(key) ?? 0) < 2000) return;
  lastTyping.set(key, now);
  const conv = await loadConversation(conversationId);
  assertMember(viewer, conv);
  publish(
    memberIdsOf(conv).filter((id) => id !== viewer.id),
    { type: "typing", conversationId, userId: viewer.id, name: viewer.name },
  );
}

/** بحث في الرسايل. الموظف: في محادثاته بس. الأدمن: all=true يدوّر في كل المحادثات */
export async function searchMessages(
  viewer: Viewer,
  query: string,
  opts: { conversationId?: string; all?: boolean } = {},
): Promise<{ message: ChatMessage; conversationTitle: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const all = opts.all && viewer.role === "ADMIN";
  if (all) await audit(viewer.id, "chat.monitor.search", undefined, { q: q.slice(0, 100) });
  // الأدمن يقدر يقرا أي محادثة، فيقدر يدوّر جوه أي محادثة (القراءة نفسها بتتسجل في getMessages)
  const anyConversation = all || (viewer.role === "ADMIN" && Boolean(opts.conversationId));
  const rows = await db.message.findMany({
    where: {
      body: { contains: q, mode: "insensitive" },
      ...(viewer.role === "ADMIN" ? {} : { deletedAt: null }),
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      ...(anyConversation ? {} : { conversation: { members: { some: { userId: viewer.id } } } }),
    },
    include: { ...messageInclude, conversation: { include: { members: { include: { user: { select: userSelect } } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({ message: toChatMessage(r, viewer), conversationTitle: titleFor(r.conversation as LoadedConversation, viewer) }));
}

/** إجمالي الرسايل غير المقروءة (لعلامة القائمة الجانبية) */
export async function unreadTotal(userId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
    WHERE m."senderId" <> ${userId}
      AND m."deletedAt" IS NULL
      AND m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")`;
  return Number(row?.count ?? 0);
}

/** هل المستخدم يقدر يشوف المرفق ده؟ (للعرض والتحميل) */
export async function canViewAttachment(viewer: Viewer, attachmentId: string) {
  const a = await db.attachment.findUnique({
    where: { id: attachmentId },
    include: { message: { select: { deletedAt: true, conversation: { select: { members: { where: { userId: viewer.id }, select: { userId: true } } } } } } },
  });
  if (!a) return null;
  if (viewer.role === "ADMIN") return a;
  if (!a.message) return a.uploaderId === viewer.id ? a : null; // لسه ما اتبعتش
  if (a.message.deletedAt) return null;
  return a.message.conversation.members.length > 0 ? a : null;
}
