import type { Metadata } from "next";
import { AdminChatTabs } from "@/components/chat/admin-tabs";
import { ChatApp } from "@/components/chat/chat-app";
import { requireAdmin } from "@/lib/auth/dal";
import { listAllConversations, listChatUsers, type Viewer } from "@/lib/chat/service";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "مراقبة الشات" };

/** الأدمن بيشوف كل المحادثات (قراءة بس). ?u=<userId> فلتر بموظف، ?c=<conversationId> يفتح محادثة */
export default async function ChatMonitorPage({ searchParams }: PageProps<"/admin/chat/monitor">) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const userFilter = typeof sp.u === "string" && sp.u ? sp.u : null;
  const viewer: Viewer = { id: user.id, role: user.role, name: user.name };
  const [conversations, users, settings] = await Promise.all([
    listAllConversations(viewer, { userId: userFilter ?? undefined }),
    listChatUsers(viewer),
    getSettings(),
  ]);
  return (
    <ChatApp
      mode="monitor"
      me={viewer}
      initialConversations={conversations}
      users={users}
      timezone={settings.general.timezone}
      editWindowMin={settings.chat.editWindowMin}
      initialUserFilter={userFilter}
      toolbar={<AdminChatTabs active="monitor" />}
    />
  );
}
