import { test } from "node:test";
import assert from "node:assert/strict";
import { median, plan } from "../src/plan.mjs";

const E = 10n ** 18n;
const base = { price: 1_000_000n * E, updatedAt: 1000, minInterval: 600, maxAge: 86400, maxStepBps: 1000, frozen: false };

test("median", () => {
  assert.equal(median([3n, 1n, 2n]), 2n);
  assert.equal(median([4n, 1n, 3n, 2n]), 2n);
});

test("skips when frozen, unset, too soon or unchanged", () => {
  assert.equal(plan({ ...base, frozen: true }, base.price, 5000).action, "skip");
  assert.equal(plan({ ...base, price: 0n }, base.price, 5000).action, "skip");
  assert.equal(plan(base, base.price * 2n, 1300).action, "skip");
  assert.equal(plan(base, (base.price * 1005n) / 1000n, 5000).action, "skip");
});

test("follows a small move exactly", () => {
  const t = (base.price * 105n) / 100n;
  assert.deepEqual(plan(base, t, 5000), { action: "update", next: t, partial: false, reason: "pool price moved" });
});

test("caps a big move inside the contract's step limit", () => {
  const p = plan(base, base.price * 2n, 5000);
  assert.equal(p.partial, true);
  assert.equal(p.next, base.price + (base.price * 98n) / 1000n);
  const down = plan(base, base.price / 2n, 5000);
  assert.equal(down.next, base.price - (base.price * 98n) / 1000n);
});

test("refreshes an ageing price even when the pool is flat", () => {
  assert.equal(plan(base, base.price, 1000 + 43200).action, "update");
});
