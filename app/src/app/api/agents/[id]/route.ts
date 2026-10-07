import { agentById } from "@/lib/server/chain";
import { loadConfig } from "@/lib/server/configs";
import { isFreeTier } from "@/lib/server/usage";
import { fail, json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const a = await agentById(Number(params.id));
  if (!a) return fail("No such agent", 404);
  return json({ agent: { ...a, free: isFreeTier(a), config: await loadConfig(a.configHash).catch(() => null) } });
});
