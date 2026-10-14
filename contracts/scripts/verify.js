// Publishes the source of every StockSage contract on Sourcify (sourcify.dev), which the Robinhood Chain explorer
// reads, so anyone can read the code. Then checks the deployment on-chain. Read-only: no key, no gas.
//   npx hardhat run scripts/verify.js --network robinhood        (or ../verify.sh)
// Anything Sourcify cannot take gets a browser upload file in ../verify-files/.
const fs = require("fs");
const os = require("os");
const path = require("path");
const agents = require("../lib/agents");

const SOURCIFY = (process.env.VERIFY_SOURCIFY_URL || "https://sourcify.dev/server").replace(/\/$/, "");
const FILE = process.env.VERIFY_DEPLOYMENT || path.join(__dirname, "..", "deployments", "robinhood.json");
const MANUAL = path.join(__dirname, "..", "..", "verify-files");
const SOLC = "0.8.28+commit.7893614a";
const CHAIN = 4663;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sjson(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 120) };
  }
}

async function match(address) {
  const res = await fetch(`${SOURCIFY}/v2/contract/${CHAIN}/${address}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  const j = await sjson(res);
  return res.ok ? j.match || null : null;
}

async function submit(c) {
  const res = await fetch(`${SOURCIFY}/v2/verify/${CHAIN}/${c.address}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ stdJsonInput: c.input, compilerVersion: SOLC, contractIdentifier: c.fqn }),
  });
  const j = await sjson(res);
  if (res.status === 409 || j.customCode === "already_verified") return "already verified";
  if (!res.ok || !j.verificationId) throw new Error(j.message || j._raw || `Sourcify ${res.status}`);
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const s = await sjson(await fetch(`${SOURCIFY}/v2/verify/${j.verificationId}`, { headers: { accept: "application/json" } }));
    if (!s.isJobCompleted) continue;
    if (s.error) throw new Error(s.error.message || s.error.customCode || "verification failed");
    const m = s.contract && (s.contract.match || s.contract.runtimeMatch || s.contract.creationMatch);
    if (m) return m === "exact_match" ? "verified (exact match)" : "verified";
    throw new Error("no match");
  }
  throw new Error("still in Sourcify's queue; run again in a few minutes");
}

async function input(name) {
  const hre = require("hardhat");
  const a = await hre.artifacts.readArtifact(name);
  const fqn = `${a.sourceName}:${a.contractName}`;
  const bi = await hre.artifacts.getBuildInfo(fqn);
  const meta = JSON.parse(bi.output.contracts[a.sourceName][a.contractName].metadata);
  const sources = Object.fromEntries(Object.keys(meta.sources).map((k) => [k, bi.input.sources[k]]));
  return { fqn, input: { language: "Solidity", sources, settings: bi.input.settings } };
}

/** On-chain checks: ownership, wiring, money flows and the seed agents. Returns the number of failures. */
async function checkDeployment(ethers, d) {
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`);
    if (!ok) failures++;
  };
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const oracle = await ethers.getContractAt("SageOracle", d.oracle);
  const registry = await ethers.getContractAt("AgentRegistry", d.registry);
  const market = await ethers.getContractAt("AgentMarket", d.market);

  console.log("Owner");
  check(same(await oracle.owner(), d.owner), `SageOracle owner is ${d.owner}`);
  for (const [n, c] of [["AgentRegistry", registry], ["AgentMarket", market]]) {
    check(same(await c.owner(), d.owner), `${n} owner is ${d.owner}`);
    check((await c.pendingOwner()) === ethers.ZeroAddress, `${n} has no pending ownership transfer`);
  }
  console.log("Wiring");
  for (const [n, c] of [["registry", registry], ["market", market]]) {
    check(same(await c.oracle(), d.oracle), `${n} prices with this SageOracle`);
    check(same(await c.treasury(), d.treasury), `${n} treasury is ${d.treasury}`);
    const sage = await c.sage();
    check(d.token ? same(sage, d.token) : true, `${n} $SAGE is ${sage === ethers.ZeroAddress ? "not set yet" : sage}`);
  }
  check(same(await market.registry(), d.registry), "market sells the agents of this registry");
  check((await oracle.sagePerEth()) > 0n, `rate: 1 ETH = ${ethers.formatEther(await oracle.sagePerEth())} $SAGE`);
  console.log("Money flows");
  const [c, b, fb] = await Promise.all([market.creatorBps(), market.burnBps(), registry.deploymentBurnBps()]);
  check(c + b <= 10000n, `every purchase: ${Number(c) / 100}% creator, ${Number(b) / 100}% burned, ${Number(10000n - c - b) / 100}% treasury`);
  check(fb <= 10000n, `every deployment fee (${ethers.formatEther(await registry.deploymentFeeWei())} ETH in $SAGE): ${Number(fb) / 100}% burned, ${Number(10000n - fb) / 100}% treasury`);
  check(same(await market.BURN_ADDRESS(), "0x000000000000000000000000000000000000dEaD"), "burns go to 0x…dEaD");
  for (const [n, ct] of [["registry", registry], ["market", market]]) {
    const names = ct.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    check(!names.some((x) => /withdraw|sweep|rescue|drain/i.test(x)), `${n} has no withdraw function`);
  }
  console.log("Seed agents");
  const seeds = agents.seeds();
  check(Number(await registry.agentCount()) >= seeds.length, `${seeds.length} seed agents deployed`);
  for (let i = 0; i < seeds.length; i++) {
    const a = await registry.getAgent(i + 1);
    check(a.configHash === seeds[i].configHash && a.name === seeds[i].name && same(a.creator, d.owner), `agent ${i + 1} ${seeds[i].name}: config hash matches the published config`);
  }
  return failures;
}

async function main() {
  const hre = require("hardhat");
  if (!fs.existsSync(FILE)) throw new Error(`No deployment at ${FILE}`);
  const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
  console.log("Sourcify");
  const failed = [];
  for (const s of d.sources || []) {
    if (s.contract.startsWith("Mock")) continue;
    process.stdout.write(`  ${s.contract.padEnd(14)} ${s.address}  `);
    const c = { address: s.address, ...(await input(s.contract)) };
    const home = os.homedir();
    if (home.length > 3 && JSON.stringify(c.input).includes(home)) throw new Error(`compiler input for ${s.contract} contains a local path`);
    try {
      const m = await match(s.address);
      console.log(m ? `already verified (${m})` : await submit(c));
    } catch (e) {
      console.log(`not verified: ${String(e.message).split("\n")[0].slice(0, 140)}`);
      failed.push(c);
    }
  }
  fs.rmSync(MANUAL, { recursive: true, force: true });
  if (failed.length) {
    fs.mkdirSync(MANUAL, { recursive: true });
    const lines = ["Verify each contract in the browser: open the link, tab Contract, 'Verify & publish',", "Solidity (Standard JSON input), compiler v" + SOLC + ", upload the file.", ""];
    failed.forEach((c, i) => {
      const f = `${String(i + 1).padStart(2, "0")}-${c.fqn.split(":")[1]}.json`;
      fs.writeFileSync(path.join(MANUAL, f), JSON.stringify(c.input));
      lines.push(`${c.fqn.split(":")[1]}  https://robinhoodchain.blockscout.com/address/${c.address}?tab=contract  file: ${f}`);
    });
    fs.writeFileSync(path.join(MANUAL, "README.txt"), lines.join("\n") + "\n");
  }
  console.log("\nOn-chain checks");
  const bad = await checkDeployment(hre.ethers, d);
  console.log(`\n${failed.length ? `${failed.length} not verified yet (browser files in verify-files/). ` : "All sources published. "}${bad ? `${bad} check(s) FAILED.` : "All checks passed."}`);
  if (failed.length || bad) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { checkDeployment };
