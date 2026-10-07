// Pure decision logic for one keeper run, so it can be tested without a chain.

/** Median of a non-empty list of bigints. */
export function median(xs) {
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2n;
}

/**
 * What to push to the oracle, or why not.
 *   o: { price, updatedAt, minInterval, maxStepBps, maxAge, frozen } as read from TokenOracle (bigint / number / bool)
 *   target: pool price (token wei per 1 ETH), now: unix seconds
 * Updates when the pool has moved more than `moveBps` or the price is past half its max age. A move bigger than
 * the contract allows is pushed as far as allowed (with 2% headroom), and the rest follows on the next runs.
 */
export function plan(o, target, now, { moveBps = 100n } = {}) {
  if (o.frozen) return { action: "skip", reason: "the guardian froze the price" };
  if (o.price === 0n) return { action: "skip", reason: "no first price yet: the timelock sets it with $SAGE (set-token.sh)" };
  if (!target || target <= 0n) return { action: "skip", reason: "no pool price" };
  const age = now - Number(o.updatedAt);
  if (age < o.minInterval) return { action: "skip", reason: `last update ${age}s ago; the contract allows one every ${o.minInterval}s` };
  const diff = target > o.price ? target - o.price : o.price - target;
  const moved = diff * 10_000n > o.price * moveBps;
  const ageing = age * 2 >= o.maxAge;
  if (!moved && !ageing) return { action: "skip", reason: `pool within ${Number(moveBps) / 100}% of the oracle and the price is fresh` };
  const step = (o.price * BigInt(o.maxStepBps) * 98n) / 1_000_000n;
  let next = target;
  if (target > o.price + step) next = o.price + step;
  if (target < o.price - step) next = o.price - step;
  return { action: "update", next, partial: next !== target, reason: moved ? "pool price moved" : "refreshing an ageing price" };
}
