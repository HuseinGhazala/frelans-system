import type { Metadata } from "next";
import { AdminChatTabs } from "@/components/chat/admin-tabs";
import { ChatApp } from "@/components/chat/chat-app";
import { requireAdmin } from "@/lib/auth/dal";
import { listChatUsers, listConversations, type Viewer } from "@/lib/chat/service";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "الشات" };

/** محادثات الأدمن نفسه. ?c=<conversationId> بيفتح محادثة */
export default async function AdminChatPage() {
  const user = await requireAdmin();
  const viewer: Viewer = { id: user.id, role: user.role, name: user.name };
  const [conversations, users, settings] = await Promise.all([listConversations(viewer), listChatUsers(viewer), getSettings()]);
  return (
    <ChatApp
      mode="chat"
      me={viewer}
      initialConversations={conversations}
      users={users}
      timezone={settings.general.timezone}
      editWindowMin={settings.chat.editWindowMin}
      toolbar={<AdminChatTabs active="chat" />}
    />
  );
}
