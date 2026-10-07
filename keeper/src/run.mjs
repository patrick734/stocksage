#!/usr/bin/env node
// One keeper run: read the $SAGE Pons pool a few times, take the median, and push a bounded update to TokenOracle.
// Sends only when KEEPER_LIVE=1; otherwise it logs what it would do.
//   env: KEEPER_PRIVATE_KEY, RPC_URL, KEEPER_LIVE
import { readFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, formatEther, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { median, plan } from "./plan.mjs";

const root = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("contracts/config/robinhood.json", root)));
const depFile = new URL("contracts/deployments/robinhood.json", root);
if (!existsSync(depFile)) {
  console.log("Not deployed yet: nothing to keep.");
  process.exit(0);
}
const d = JSON.parse(readFileSync(depFile));
const LIVE = process.env.KEEPER_LIVE === "1";
const chain = defineChain({ id: config.network.chainId, name: config.network.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.RPC_URL || config.network.rpcUrl] } } });
const client = createPublicClient({ chain, transport: http() });

const oracleAbi = [
  ...["price", "updatedAt", "minInterval", "maxAge", "maxStepBps", "frozen"].map((name) => ({
    type: "function", name, stateMutability: "view", inputs: [], outputs: [{ type: name === "frozen" ? "bool" : name === "maxStepBps" ? "uint16" : name === "price" ? "uint256" : name === "updatedAt" ? "uint64" : "uint32" }],
  })),
  { type: "function", name: "update", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
];
const registryAbi = [{ type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const pmAbi = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }] }];

/** $SAGE wei per 1 ETH from the Pons pool's current sqrtPrice (Uniswap v4 StateLibrary slot 6). */
async function poolPrice(token) {
  const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], ["0x0000000000000000000000000000000000000000", token, config.pons.poolFee, config.pons.poolTickSpacing, config.pons.hook]));
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
  const word = BigInt(await client.readContract({ address: config.uniswap.poolManager, abi: pmAbi, functionName: "extsload", args: [slot] }));
  const sqrt = word & ((1n << 160n) - 1n);
  return sqrt === 0n ? null : (sqrt * sqrt * 10n ** 18n) >> 192n;
}

async function main() {
  const token = await client.readContract({ address: d.registry, abi: registryAbi, functionName: "token" });
  if (/^0x0{40}$/i.test(token)) return console.log("$SAGE is not set yet: nothing to price.");
  const read = (functionName) => client.readContract({ address: d.oracle, abi: oracleAbi, functionName });
  const [price, updatedAt, minInterval, maxAge, maxStepBps, frozen] = await Promise.all(["price", "updatedAt", "minInterval", "maxAge", "maxStepBps", "frozen"].map(read));
  // Three reads 15 seconds apart, so one swap at the moment of reading cannot set the price.
  const samples = [];
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 15_000));
    const p = await poolPrice(token);
    if (p) samples.push(p);
  }
  const target = samples.length ? median(samples) : null;
  const now = Math.floor(Date.now() / 1000);
  const o = { price, updatedAt: Number(updatedAt), minInterval: Number(minInterval), maxAge: Number(maxAge), maxStepBps: Number(maxStepBps), frozen };
  console.log(`oracle: 1 ETH = ${formatEther(price)} $SAGE, ${now - o.updatedAt}s old · pool: ${target ? formatEther(target) : "none"}`);
  const p = plan(o, target, now);
  if (p.action === "skip") return console.log(`skip: ${p.reason}`);
  console.log(`${LIVE ? "update" : "would update (dry run)"}: ${formatEther(p.next)} $SAGE per ETH (${p.reason}${p.partial ? ", capped by the step limit" : ""})`);
  if (!LIVE) return;
  const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain, transport: http() });
  await client.simulateContract({ account, address: d.oracle, abi: oracleAbi, functionName: "update", args: [p.next] });
  const hash = await wallet.writeContract({ address: d.oracle, abi: oracleAbi, functionName: "update", args: [p.next] });
  const r = await client.waitForTransactionReceipt({ hash });
  console.log(`${r.status}: ${config.network.explorer}/tx/${hash}`);
  if (r.status !== "success") process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exit(1);
});
