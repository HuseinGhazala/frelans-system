"use server";

import * as z from "zod";
import { requireUser } from "@/lib/auth/dal";
import * as chat from "@/lib/chat/service";
import { ChatError, type Viewer } from "@/lib/chat/service";
import type { ChatMessage, ChatUser, ConversationSummary } from "@/lib/chat/types";

/** نتيجة أي أكشن في الشات: البيانات، أو رسالة خطأ بالعربي تتعرض للمستخدم */
export type ChatResult<T> = { ok: true; data: T } | { ok: false; error: string };

const id = z.string().trim().min(1).max(64);
const ids = z.array(id).max(500);

async function viewer(): Promise<Viewer> {
  // برا الـ try عشان redirect لصفحة الدخول يشتغل
  const u = await requireUser();
  return { id: u.id, role: u.role, name: u.name };
}

async function run<T>(fn: (v: Viewer) => Promise<T>): Promise<ChatResult<T>> {
  const v = await viewer();
  try {
    return { ok: true, data: await fn(v) };
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "البيانات مش صحيحة" };
    console.error("chat action failed", err);
    return { ok: false, error: "حصلت مشكلة، جرب تاني" };
  }
}

export async function listConversationsAction(): Promise<ChatResult<ConversationSummary[]>> {
  return run((v) => chat.listConversations(v));
}

/** للأدمن: كل المحادثات (صفحة المراقبة) */
export async function listAllConversationsAction(userId?: string | null): Promise<ChatResult<ConversationSummary[]>> {
  return run((v) => chat.listAllConversations(v, { userId: userId ? id.parse(userId) : undefined }));
}

export async function getConversationAction(conversationId: string): Promise<ChatResult<ConversationSummary>> {
  return run((v) => chat.getConversation(v, id.parse(conversationId)));
}

export async function listChatUsersAction(): Promise<ChatResult<ChatUser[]>> {
  return run((v) => chat.listChatUsers(v));
}

export async function openDirectAction(userId: string): Promise<ChatResult<ConversationSummary>> {
  return run((v) => chat.openDirect(v, id.parse(userId)));
}

export async function createGroupAction(input: { name: string; memberIds: string[] }): Promise<ChatResult<ConversationSummary>> {
  return run((v) => {
    const data = z.object({ name: z.string().max(200), memberIds: ids }).parse(input);
    return chat.createGroup(v, data);
  });
}

export async function renameGroupAction(conversationId: string, name: string): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.renameGroup(v, id.parse(conversationId), z.string().max(200).parse(name));
    return null;
  });
}

export async function addMembersAction(conversationId: string, userIds: string[]): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.addMembers(v, id.parse(conversationId), ids.parse(userIds));
    return null;
  });
}

/** شيل عضو، أو userId = نفسك عشان تخرج من الجروب */
export async function removeMemberAction(conversationId: string, userId: string): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.removeMember(v, id.parse(conversationId), id.parse(userId));
    return null;
  });
}

export async function getMessagesAction(conversationId: string, before?: string | null): Promise<ChatResult<{ messages: ChatMessage[]; hasMore: boolean }>> {
  return run((v) => chat.getMessages(v, id.parse(conversationId), { before: before ? id.parse(before) : undefined }));
}

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
  replyToId?: string | null;
  attachmentIds?: string[];
}): Promise<ChatResult<ChatMessage>> {
  return run((v) => {
    const data = z
      .object({ conversationId: id, body: z.string().max(20_000), replyToId: id.nullish(), attachmentIds: z.array(id).max(50).optional() })
      .parse(input);
    return chat.sendMessage(v, data);
  });
}

export async function editMessageAction(messageId: string, body: string): Promise<ChatResult<ChatMessage>> {
  return run((v) => chat.editMessage(v, id.parse(messageId), z.string().max(20_000).parse(body)));
}

export async function deleteMessageAction(messageId: string): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.deleteMessage(v, id.parse(messageId));
    return null;
  });
}

export async function markReadAction(conversationId: string): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.markRead(v, id.parse(conversationId));
    return null;
  });
}

export async function setTypingAction(conversationId: string): Promise<ChatResult<null>> {
  return run(async (v) => {
    await chat.setTyping(v, id.parse(conversationId));
    return null;
  });
}

/** بحث: في محادثة معينة، أو في كل محادثاتي، أو (للأدمن) all = كل المحادثات */
export async function searchMessagesAction(
  query: string,
  opts: { conversationId?: string | null; all?: boolean } = {},
): Promise<ChatResult<{ message: ChatMessage; conversationTitle: string }[]>> {
  return run((v) =>
    chat.searchMessages(v, z.string().max(200).parse(query), {
      conversationId: opts.conversationId ? id.parse(opts.conversationId) : undefined,
      all: Boolean(opts.all),
    }),
  );
}

export async function unreadTotalAction(): Promise<ChatResult<number>> {
  return run((v) => chat.unreadTotal(v.id));
}
