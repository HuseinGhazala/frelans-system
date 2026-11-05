import { z } from "zod";
import { createGroup } from "@/lib/chat/service";
import { chatRoute, idListSchema, readBody } from "../_lib/handler";

const schema = z.object({ name: z.string().max(200), memberIds: idListSchema });

/** جروب جديد — اللي عمله بيبقى صاحبه */
export async function POST(request: Request) {
  return chatRoute(request, async (viewer) => {
    const input = await readBody(request, schema);
    return { conversation: await createGroup(viewer, input) };
  });
}
