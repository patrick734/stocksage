import { snapshot } from "@/lib/server/chain";
import { sessionAddress } from "@/lib/server/session";
import { quotas } from "@/lib/server/usage";
import { fail, json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** What the signed-in wallet can use: remaining paid uses per agent, and today's free messages. */
export const GET = route(async () => {
  const address = sessionAddress();
  if (!address) return fail("Sign in with your wallet first.", 401);
  const { agents } = await snapshot();
  const q = await quotas(address, agents);
  return json({ address, quotas: Object.fromEntries(q) });
});
