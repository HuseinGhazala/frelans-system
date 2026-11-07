import { getSettings } from "@/lib/settings";
import { chatRoute } from "../_lib/handler";

/** إعدادات الشات اللي البرنامج محتاجها (مدة التعديل والحذف بالدقايق) */
export async function GET(request: Request) {
  return chatRoute(request, async () => ({ editWindowMin: (await getSettings()).chat.editWindowMin }));
}
