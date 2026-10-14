import type { Address } from "viem";
import { marketAbi, oracleAbi, registryAbi } from "@/generated/abis";
import { deployment, readAll } from "@/lib/server/chain";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";
const pct = (bps: number) => `${bps / 100}%`;

/** The live facts behind the Safety page, read from the chain on every request. */
export const GET = route(async () => {
  const d = deployment();
  if (!d) return json({ live: false, checks: [] });
  const r = (await readAll([
    { address: d.market, abi: marketAbi, functionName: "creatorBps" },
    { address: d.market, abi: marketAbi, functionName: "burnBps" },
    { address: d.registry, abi: registryAbi, functionName: "deploymentBurnBps" },
    { address: d.registry, abi: registryAbi, functionName: "deploymentFeeWei" },
    { address: d.registry, abi: registryAbi, functionName: "treasury" },
    { address: d.registry, abi: registryAbi, functionName: "sage" },
    { address: d.registry, abi: registryAbi, functionName: "paused" },
    { address: d.market, abi: marketAbi, functionName: "paused" },
    { address: d.registry, abi: registryAbi, functionName: "owner" },
    { address: d.oracle, abi: oracleAbi, functionName: "sagePerEth" },
  ])) as [number, number, number, bigint, Address, Address, boolean, boolean, Address, bigint];
  const [cb, bb, db, fee, treasury, sage, regPaused, mktPaused, owner, rate] = r;
  const checks = [
    { ok: cb + bb <= 10000, label: `Every purchase: ${pct(cb)} to the creator, ${pct(bb)} burned, ${pct(10000 - cb - bb)} to the treasury`, detail: "Paid out in the same transaction, straight from the buyer. The market never holds funds. Burns go to 0x…dEaD." },
    { ok: db <= 10000, label: `Every new agent's fee (${Number(fee) / 1e18} ETH in $SAGE): ${pct(db)} burned, ${pct(10000 - db)} to the treasury`, detail: "Set in the registry contract." },
    { ok: true, label: "No withdraw function", detail: "Neither the registry nor the market has any function that moves someone else's tokens." },
    { ok: true, label: `One owner wallet: ${owner}`, detail: "It can set the $SAGE rate, the deployment fee and its burn share, the purchase split, the treasury and the oracle, and pause new agents and purchases. Changes take effect immediately: there is no timelock." },
    { ok: rate > 0n, label: `The rate is set by the owner: 1 ETH = ${(Number(rate) / 1e18).toLocaleString()} $SAGE`, detail: "Set by hand. Your maximum cost on every purchase and deployment protects you if it changes." },
    { ok: !regPaused && !mktPaused, label: regPaused || mktPaused ? "Paused by the owner" : "Deploying and buying are open", detail: `Treasury: ${treasury}` },
  ];
  return json({ live: true, token: sage === ZERO ? null : sage, checks, addresses: { registry: d.registry, market: d.market, oracle: d.oracle, owner: d.owner, treasury } });
});
