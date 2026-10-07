// End-to-end check against a local chain and a running app (see app/README.md):
// sign in, free chat, paid chat after buying uses on-chain, refund on a declined reply, create an agent.
//   node scripts/e2e-local.mjs http://localhost:3100
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const BASE = process.argv[2] || "http://localhost:3100";
const d = JSON.parse(readFileSync(new URL("../../contracts/deployments/localhost.json", import.meta.url)));
const reg = JSON.parse(readFileSync(new URL("../../abis/AgentRegistry.json", import.meta.url)));
const mkt = JSON.parse(readFileSync(new URL("../../abis/AgentMarket.json", import.meta.url)));
// Hardhat account #4: holds the local demo token.
const account = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
const pub = createPublicClient({ chain: hardhat, transport: http() });
const wallet = createWalletClient({ account, chain: hardhat, transport: http() });

let cookie = "";
async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body && JSON.stringify(body) });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}
async function jsonCall(path, opts) {
  const res = await call(path, opts);
  return { status: res.status, body: await res.json() };
}
async function chat(agentId, text) {
  const res = await call("/api/chat", { method: "POST", body: { agentId, messages: [{ role: "user", content: text }] } });
  if (!res.ok) return { status: res.status, error: (await res.json()).error };
  const raw = await res.text();
  const [reply, status] = raw.split("\u0000");
  return { status: res.status, reply, ...JSON.parse(status) };
}
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${msg}`);
  if (!ok) failed++;
};
const tx = async (args) => pub.waitForTransactionReceipt({ hash: await wallet.writeContract(args) });

const market = (await jsonCall("/api/agents")).body;
check(market.live && market.agents.length === 5 && market.token, `market lists ${market.agents.length} live agents, token set`);
check(market.agents[0].config?.name === "Sage" && market.agents[0].free, "seed agent 1 is Sage, free tier, config loaded from its hash");

check((await chat(1, "hi")).status === 401, "chat refuses without sign-in");
const { body: n } = await jsonCall("/api/auth/nonce", { method: "POST", body: { address: account.address } });
const signature = await account.signMessage({ message: n.message });
check((await jsonCall("/api/auth", { method: "POST", body: { address: account.address, nonce: n.nonce, signature: "0x" + "11".repeat(65) } })).status === 401, "a wrong signature is refused");
const n2 = (await jsonCall("/api/auth/nonce", { method: "POST", body: { address: account.address } })).body;
const sig2 = await account.signMessage({ message: n2.message });
check((await jsonCall("/api/auth", { method: "POST", body: { address: account.address, nonce: n2.nonce, signature: sig2 } })).status === 200, "wallet sign-in works");
check((await jsonCall("/api/auth", { method: "POST", body: { address: account.address, nonce: n.nonce, signature } })).status === 401, "a used or replaced nonce is refused");

const free = await chat(1, "What is a tokenized stock?");
check(free.reply === "Hello from the mock." && free.refunded === false && free.remaining === 9, `free chat streams (${JSON.stringify(free.reply)}), ${free.remaining} free left`);

const unpaid = await chat(2, "Analyse NVDA");
check(unpaid.status === 402, `paid agent without uses: ${unpaid.status} ${unpaid.error}`);

const cost = await pub.readContract({ address: d.market, abi: mkt, functionName: "quoteUses", args: [2n, 3n] });
await tx({ address: d.token, abi: erc20Abi, functionName: "approve", args: [d.market, cost] });
const r = await tx({ address: d.market, abi: mkt, functionName: "purchaseUses", args: [2n, 3n, cost] });
check(r.status === "success", `bought 3 uses of agent 2 for ${cost} token wei`);
const me = (await jsonCall("/api/me")).body;
check(me.quotas["2"].purchased === 3 && me.quotas["2"].remaining === 3, "/api/me shows 3 uses bought");

const paid = await chat(2, "Analyse NVDA");
check(paid.reply && paid.remaining === 2, `paid chat works, ${paid.remaining} uses left`);
const refused = await chat(2, "REFUSE this");
check(refused.refunded === true && refused.remaining === 2 && /not charged/.test(refused.notice), `declined reply refunded: "${refused.notice}"`);
check((await jsonCall("/api/me")).body.quotas["2"].used === 1, "only the answered reply counted as used");

const bad = await jsonCall("/api/configs", { method: "POST", body: { config: { name: "", description: "x" } } });
check(bad.status === 400, `invalid config refused: ${bad.body.error}`);
const cfg = { name: "E2E Desk", description: "Test agent.", specialization: "", personality: "", instructions: "Answer briefly.", category: "Research", webSearch: false };
const saved = (await jsonCall("/api/configs", { method: "POST", body: { config: cfg } })).body;
const served = await (await call(`/api/configs/${saved.hash}`)).text();
check(saved.hash && JSON.parse(served).name === "E2E Desk", `config stored at ${saved.metadataURI}`);
const fee = await pub.readContract({ address: d.registry, abi: reg, functionName: "deploymentFeeToken" });
await tx({ address: d.token, abi: erc20Abi, functionName: "approve", args: [d.registry, fee] });
const dep = await tx({ address: d.registry, abi: reg, functionName: "deployAgent", args: ["E2E Desk", saved.metadataURI, saved.hash, parseEther("0.0001"), fee] });
const ev = parseEventLogs({ abi: reg, logs: dep.logs, eventName: "AgentDeployed" })[0];
check(Number(ev.args.agentId) === 6, `deployed agent #${ev.args.agentId}`);
let mine;
for (let i = 0; i < 20 && !mine; i++) {
  mine = (await jsonCall("/api/agents")).body.agents.find((a) => a.id === 6);
  if (!mine) await new Promise((res) => setTimeout(res, 2_000));
}
check(mine?.config?.instructions === "Answer briefly.", "new agent listed with its config");
const act = (await jsonCall("/api/activity")).body;
check(act.items.some((i) => i.kind === "deployed" && i.agentId === 6) && act.items.some((i) => i.kind === "purchased"), `activity shows ${act.items.length} events`);
const safety = (await jsonCall("/api/safety")).body;
check(safety.checks.length === 7 && safety.checks.every((c) => c.ok), `safety: ${safety.checks.filter((c) => c.ok).length}/${safety.checks.length} checks pass`);
const log = readFileSync(process.env.MOCK_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const first = log[0];
check(first.model === "test-model" && first.output_config?.effort === "low" && first.fallbacks === "default", "request uses AGENT_MODEL, low effort, server-side fallbacks");
check(first.tools?.[0]?.type === "web_search_20260209" && first.system.includes("never personal investment advice"), "web search tool and StockSage rules sent");
console.log(failed ? `\n${failed} check(s) failed` : "\nAll end-to-end checks passed.");
process.exit(failed ? 1 : 0);
