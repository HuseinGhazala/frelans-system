import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";
import { requireEmployee } from "@/lib/auth/dal";
import { listChatUsers, listConversations, type Viewer } from "@/lib/chat/service";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "الشات" };

/** شات الموظف. ?c=<conversationId> بيفتح محادثة (الإشعارات والإيميلات بتلينك هنا) */
export default async function MyChatPage() {
  const user = await requireEmployee();
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
    />
  );
}
