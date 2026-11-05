import { getCurrentUser } from "@/lib/auth/dal";
import { chatEventStream } from "@/lib/chat/sse";

/** أحداث الشات اللحظية للموقع (EventSource). الإرسال نفسه عن طريق Server Actions */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return chatEventStream(request, user.id);
}
