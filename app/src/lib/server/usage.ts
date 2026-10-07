import "server-only";
import type { Address } from "viem";
import { settings } from "./env";
import { store } from "./store";
import { purchasedUses, type AgentView } from "./chain";

// One reply = one use. Paid agents: uses bought on-chain (AgentMarket.usesPurchased) minus uses served here.
// Agents priced below MIN_PAID_PRICE_WEI (the free flagship among them) draw on a free daily quota instead, per
// wallet and overall, because their price would not cover what a reply costs to run.

const day = () => new Date().toISOString().slice(0, 10);
const minute = () => Math.floor(Date.now() / 60_000);

export function isFreeTier(agent: Pick<AgentView, "pricePerUseWei">) {
  return BigInt(agent.pricePerUseWei) < settings.minPaidPriceWei();
}

export type Quota =
  | { kind: "paid"; purchased: number; used: number; remaining: number }
  | { kind: "free"; usedToday: number; limit: number; remaining: number };

export async function quotas(user: Address, agents: AgentView[]): Promise<Map<number, Quota>> {
  const out = new Map<number, Quota>();
  const paid = agents.filter((a) => !isFreeTier(a));
  const [bought, used, free] = await Promise.all([
    purchasedUses(user, paid.map((a) => a.id)),
    store.getMany(paid.map((a) => `used:${a.id}:${user}`)),
    store.get(`free:${user}:${day()}`),
  ]);
  paid.forEach((a, i) => {
    const purchased = bought.get(a.id) ?? 0;
    const u = Number(used[i] ?? 0);
    out.set(a.id, { kind: "paid", purchased, used: u, remaining: Math.max(0, purchased - u) });
  });
  const usedToday = Number(free ?? 0);
  const limit = settings.freePerAddressPerDay();
  for (const a of agents.filter(isFreeTier)) out.set(a.id, { kind: "free", usedToday, limit, remaining: Math.max(0, limit - usedToday) });
  return out;
}

export type Reservation = { ok: true; release: () => Promise<void>; remaining: number } | { ok: false; status: number; error: string };

/** Takes one use before the reply runs. `release` gives it back if the reply fails or is declined. */
export async function reserve(user: Address, agent: AgentView): Promise<Reservation> {
  const rl = `rl:${user}:${minute()}`;
  if ((await store.incr(rl, 1, 90)) > settings.repliesPerMinute()) return { ok: false, status: 429, error: "Too many messages. Wait a minute and try again." };

  if (isFreeTier(agent)) {
    const mine = `free:${user}:${day()}`;
    const all = `free:all:${day()}`;
    const n = await store.incr(mine, 1, 2 * 86400);
    if (n > settings.freePerAddressPerDay()) {
      await store.incr(mine, -1);
      return { ok: false, status: 402, error: `You've used today's ${settings.freePerAddressPerDay()} free messages. They reset at 00:00 UTC.` };
    }
    if ((await store.incr(all, 1, 2 * 86400)) > settings.freeGlobalPerDay()) {
      await Promise.all([store.incr(mine, -1), store.incr(all, -1)]);
      return { ok: false, status: 503, error: "Free messages are used up for today across StockSage. They reset at 00:00 UTC." };
    }
    return { ok: true, remaining: settings.freePerAddressPerDay() - n, release: async () => void (await Promise.all([store.incr(mine, -1), store.incr(all, -1)])) };
  }

  const purchased = (await purchasedUses(user, [agent.id])).get(agent.id) ?? 0;
  const key = `used:${agent.id}:${user}`;
  const used = await store.incr(key, 1);
  if (used > purchased) {
    await store.incr(key, -1);
    return { ok: false, status: 402, error: purchased ? "You've used all the uses you bought. Buy more to keep going." : "Buy uses of this agent to chat with it." };
  }
  return { ok: true, remaining: purchased - used, release: async () => void (await store.incr(key, -1)) };
}
