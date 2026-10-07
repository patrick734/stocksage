import { keccak256, toBytes, type Address } from "viem";
import { marketAbi, oracleAbi, registryAbi } from "@/generated/abis";
import { deployment, publicClient, readAll } from "@/lib/server/chain";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const ADMIN = "0x0000000000000000000000000000000000000000000000000000000000000000";
const role = (s: string) => keccak256(toBytes(s));

/** The live checks behind the Safety page, read from the chain on every request. */
export const GET = route(async () => {
  const d = deployment();
  if (!d) return json({ live: false, checks: [] });
  const c = publicClient();
  const has = (address: Address, r: `0x${string}`, who: Address) => c.readContract({ address, abi: timelockAbi, functionName: "hasRole", args: [r, who] });
  const [delay, ...flags] = await Promise.all([
    c.readContract({ address: d.timelock, abi: timelockAbi, functionName: "getMinDelay" }),
    ...[ADMIN, role("PROPOSER_ROLE"), role("EXECUTOR_ROLE"), role("CANCELLER_ROLE")].map((r) => has(d.timelock, r as `0x${string}`, d.deployer)),
    ...[d.registry, d.market, d.oracle].map((a) => has(a, ADMIN, d.timelock)),
    ...[d.registry, d.market, d.oracle].map((a) => has(a, ADMIN, d.deployer)),
  ]);
  const deployerOnTimelock = flags.slice(0, 4).some(Boolean);
  const timelockAdmin = flags.slice(4, 7).every(Boolean);
  const deployerAdmin = flags.slice(7, 10).some(Boolean);
  const r = await readAll([
      { address: d.market, abi: marketAbi, functionName: "CREATOR_BPS" },
      { address: d.market, abi: marketAbi, functionName: "BURN_BPS" },
      { address: d.market, abi: marketAbi, functionName: "TREASURY_BPS" },
      { address: d.registry, abi: registryAbi, functionName: "DEPLOY_BURN_BPS" },
      { address: d.registry, abi: registryAbi, functionName: "treasury" },
      { address: d.registry, abi: registryAbi, functionName: "token" },
      { address: d.registry, abi: registryAbi, functionName: "paused" },
      { address: d.market, abi: marketAbi, functionName: "paused" },
      { address: d.oracle, abi: oracleAbi, functionName: "maxStepBps" },
      { address: d.oracle, abi: oracleAbi, functionName: "minInterval" },
      { address: d.oracle, abi: oracleAbi, functionName: "maxAge" },
      { address: d.oracle, abi: oracleAbi, functionName: "isFresh" },
      { address: d.oracle, abi: oracleAbi, functionName: "frozen" },
  ]);
  const [cb, bb, tb, db, treasury, token, regPaused, mktPaused, step, interval, maxAge, fresh, frozen] = r as [number, number, number, number, Address, Address, boolean, boolean, number, number, number, boolean, boolean];
  const checks = [
    { ok: delay >= 172800n, label: `Every change waits ${Number(delay) / 3600} hours in public`, detail: "OpenZeppelin TimelockController is the admin of all three contracts." },
    { ok: timelockAdmin && !deployerAdmin && !deployerOnTimelock, label: "The deployer holds no power", detail: "No admin role on any contract, and no proposer, executor or canceller role on the timelock." },
    { ok: cb === 6000 && bb === 3000 && tb === 1000, label: "Every payment: 60% creator, 30% burned, 10% treasury", detail: "Constants in AgentMarket: no function can change them." },
    { ok: db === 8000, label: "Agent deployment fee: 80% burned, 20% treasury", detail: "Constant in AgentRegistry." },
    { ok: treasury.toLowerCase() === d.timelock.toLowerCase(), label: "The treasury is the timelock", detail: "Treasury funds move only by a public proposal that waits 48 hours." },
    { ok: step <= 5000 && interval >= 60, label: `The keeper moves the price at most ${step / 100}% every ${interval / 60} minutes`, detail: `Sales stop if the price is older than ${maxAge / 3600} hours${frozen ? " (frozen by the guardian now)" : fresh ? "" : " (no fresh price right now)"}.` },
    { ok: !regPaused && !mktPaused, label: "Deploying and buying are open", detail: "The guardian can pause; only the timelock can unpause." },
  ];
  return json({ live: true, token: token === "0x0000000000000000000000000000000000000000" ? null : token, checks, addresses: { registry: d.registry, market: d.market, oracle: d.oracle, timelock: d.timelock, deployer: d.deployer } });
});
