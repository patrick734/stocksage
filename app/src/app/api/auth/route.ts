import { sessionAddress, signOut, verifySignIn } from "@/lib/server/session";
import { fail, json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ address: sessionAddress() }));

export const POST = route(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const sig = String(body?.signature ?? "");
  if (!/^0x[0-9a-fA-F]+$/.test(sig)) return fail("Missing signature");
  const address = await verifySignIn(String(body?.address ?? ""), String(body?.nonce ?? ""), sig as `0x${string}`);
  if (!address) return fail("The signature did not check out, or the sign-in request expired. Try again.", 401);
  return json({ address });
});

export const DELETE = route(async () => {
  signOut();
  return json({ address: null });
});
