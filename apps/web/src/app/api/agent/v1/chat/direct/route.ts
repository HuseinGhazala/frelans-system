import { z } from "zod";
import { openDirect } from "@/lib/chat/service";
import { chatRoute, idSchema, readBody } from "../_lib/handler";

const schema = z.object({ userId: idSchema });

/** يفتح المحادثة الخاصة مع شخص (أو يعملها) */
export async function POST(request: Request) {
  return chatRoute(request, async (viewer) => {
    const { userId } = await readBody(request, schema);
    return { conversation: await openDirect(viewer, userId) };
  });
}
