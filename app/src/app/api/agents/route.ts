import { snapshot } from "@/lib/server/chain";
import { loadConfig } from "@/lib/server/configs";
import { isFreeTier } from "@/lib/server/usage";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const snap = await snapshot();
  const agents = await Promise.all(
    snap.agents.map(async (a) => ({ ...a, free: isFreeTier(a), config: await loadConfig(a.configHash).catch(() => null) }))
  );
  return json({ ...snap, agents });
});
