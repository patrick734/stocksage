import { createNonce } from "@/lib/server/session";
import { fail, json, route } from "@/lib/server/http";

export const POST = route(async (req: Request) => {
  const body = await req.json().catch(() => null);
  try {
    return json(await createNonce(String(body?.address ?? "")));
  } catch {
    return fail("Invalid wallet address");
  }
});
