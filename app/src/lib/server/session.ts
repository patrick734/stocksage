import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, type Address } from "viem";
import { brand } from "../brand";
import { settings } from "./env";
import { store } from "./store";
import { publicClient } from "./chain";

// Wallet sign-in: the server hands out a one-time nonce, the wallet signs a plain-text message containing it, and
// the server checks the signature (EOA or smart-contract wallet) and sets an HMAC-signed, httpOnly cookie.

const COOKIE = "sage_session";
const SESSION_SECONDS = 7 * 86400;
const NONCE_SECONDS = 600;

function sign(payload: string) {
  return createHmac("sha256", settings.sessionSecret()).update(payload).digest("base64url");
}

export function signInMessage(address: Address, nonce: string, issuedAt: string) {
  return [
    `Sign in to ${brand.name}`,
    "",
    "This only proves you own this wallet. It costs nothing and sends no transaction.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}

export async function createNonce(address: string) {
  if (!isAddress(address)) throw new Error("invalid address");
  const a = getAddress(address);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  await store.set(`nonce:${nonce}`, JSON.stringify({ a, issuedAt }), { ex: NONCE_SECONDS });
  return { nonce, message: signInMessage(a, nonce, issuedAt) };
}

export async function verifySignIn(address: string, nonce: string, signature: `0x${string}`): Promise<Address | null> {
  if (!isAddress(address) || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  const saved = await store.getdel(`nonce:${nonce}`);
  if (!saved) return null;
  const { a, issuedAt } = JSON.parse(saved) as { a: Address; issuedAt: string };
  if (a !== getAddress(address)) return null;
  const ok = await publicClient().verifyMessage({ address: a, message: signInMessage(a, nonce, issuedAt), signature }).catch(() => false);
  if (!ok) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${a}.${exp}`;
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, secure: settings.isProd, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return a;
}

export function sessionAddress(): Address | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [addr, exp, mac] = raw.split(".");
  if (!addr || !exp || !mac || !isAddress(addr)) return null;
  const want = Buffer.from(sign(`${addr}.${exp}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return getAddress(addr);
}

export function signOut() {
  cookies().delete(COOKIE);
}
