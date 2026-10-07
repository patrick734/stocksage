import { configBytes } from "@/lib/server/configs";
import { fail, route } from "@/lib/server/http";

/** The exact stored bytes: keccak256 of this response body is the agent's on-chain configHash. */
export const GET = route(async (_req: Request, { params }: { params: { hash: string } }) => {
  const bytes = await configBytes(params.hash);
  if (!bytes) return fail("No config with this hash", 404);
  return new Response(bytes, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" } });
});
