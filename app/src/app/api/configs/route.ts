import { saveConfig } from "@/lib/server/configs";
import { settings } from "@/lib/server/env";
import { sessionAddress } from "@/lib/server/session";
import { store } from "@/lib/server/store";
import { fail, json, route } from "@/lib/server/http";

/** Stores an agent config before it is deployed, and returns the hash and URL to deploy it with. */
export const POST = route(async (req: Request) => {
  const user = sessionAddress();
  if (!user) return fail("Sign in with your wallet first.", 401);
  if ((await store.incr(`cfgs:${user}:${new Date().toISOString().slice(0, 10)}`, 1, 2 * 86400)) > 30) return fail("Too many agent drafts today. Try again tomorrow.", 429);
  const body = await req.json().catch(() => null);
  const r = await saveConfig(body?.config);
  if (!r.ok) return fail(r.error);
  return json({ hash: r.hash, metadataURI: `${settings.siteUrl()}/api/configs/${r.hash}` });
});
