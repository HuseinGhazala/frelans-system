/**
 * روابط صفحة الشات — client-safe (بيستخدمها الإشعارات والإيميل وواجهة الشات).
 * الموظف: /me/chat، الأدمن: /admin/chat. المحادثة بتتفتح بـ ?c=<id>.
 */
export function chatUrlFor(role: "ADMIN" | "EMPLOYEE", conversationId?: string | null): string {
  const base = role === "ADMIN" ? "/admin/chat" : "/me/chat";
  return conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base;
}
