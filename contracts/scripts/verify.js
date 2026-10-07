// Checks an stocksage deployment on-chain. Read-only, needs no key, and anyone can run it:
//   npx hardhat run scripts/verify.js --network robinhood        (reads deployments/robinhood.json)
// Exits 1 if any check fails. deploy.js runs the same checks right after deploying.
const fs = require("fs");
const path = require("path");
const agents = require("../lib/agents");

const MIN_DELAY = 48n * 3600n;

/**
 * Role events for several contracts in one sweep. Free RPC plans cap eth_getLogs ranges (Alchemy free: 10
 * blocks), so: one request on the given RPC, then one on the public Robinhood RPC, then 10-block chunks.
 */
async function roleLogs(ethers, addresses, fromBlock) {
  const iface = new ethers.Interface([
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ]);
  const topics = [[iface.getEvent("RoleGranted").topicHash, iface.getEvent("RoleRevoked").topicHash]];
  const toBlock = await ethers.provider.getBlockNumber();
  const filter = (from, to) => ({ address: addresses, topics, fromBlock: from, toBlock: to });
  const parse = (logs) => logs.map((l) => ({ address: l.address.toLowerCase(), ...iface.parseLog(l) }));
  try {
    return parse(await ethers.provider.getLogs(filter(fromBlock, toBlock)));
  } catch {}
  const config = require("../config/robinhood.json");
  if (config.network.chainId === Number((await ethers.provider.getNetwork()).chainId)) {
    const pub = new ethers.JsonRpcProvider(config.network.rpcUrl, config.network.chainId, { staticNetwork: true });
    for (let i = 0; i < 2; i++) {
      try {
        return parse(await pub.getLogs(filter(fromBlock, toBlock)));
      } catch {}
    }
  }
  const out = [];
  for (let from = fromBlock; from <= toBlock; from += 10) {
    const to = Math.min(from + 9, toBlock);
    for (let tries = 0; ; tries++) {
      try {
        out.push(...(await ethers.provider.getLogs(filter(from, to))));
        break;
      } catch (e) {
        if (tries >= 3) throw e;
        await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
      }
    }
  }
  return parse(out);
}

async function verifyDeployment(ethers, d, { requireMultisigs = false } = {}) {
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${msg}`);
    if (!ok) failures++;
  };
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const fromBlock = d.startBlock ?? 0;

  console.log("Timelock (admin and treasury)");
  const tl = await ethers.getContractAt("TimelockController", d.timelock);
  const artifact = await require("hardhat").artifacts.readArtifact("TimelockController");
  const code = await ethers.provider.getCode(d.timelock);
  check(ethers.keccak256(code) === ethers.keccak256(artifact.deployedBytecode), "bytecode is the unmodified OpenZeppelin TimelockController");
  const delay = await tl.getMinDelay();
  check(delay >= MIN_DELAY, `minimum delay ${delay / 3600n}h (at least 48h)`);
  const R = { admin: await tl.DEFAULT_ADMIN_ROLE(), proposer: await tl.PROPOSER_ROLE(), executor: await tl.EXECUTOR_ROLE(), canceller: await tl.CANCELLER_ROLE() };
  for (const [name, role] of Object.entries(R)) {
    check(!(await tl.hasRole(role, d.deployer)), `deployer is not a timelock ${name}`);
  }
  check(await tl.hasRole(R.proposer, d.roles.admin), "admin can propose");
  check(!(await tl.hasRole(R.admin, d.roles.admin)), "admin cannot bypass the timelock's own role management");

  const accessControlled = [
    ["TokenOracle", d.oracle, ["admin", "guardian", "keeper"]],
    ["AgentRegistry", d.registry, ["admin", "guardian"]],
    ["AgentMarket", d.market, ["admin", "guardian"]],
  ];
  const logs = await roleLogs(ethers, [d.timelock, ...accessControlled.map(([, a]) => a)], fromBlock);
  const tlGrants = logs.filter((l) => l.address === d.timelock.toLowerCase() && l.name === "RoleGranted" && l.args.role === R.admin);
  check(tlGrants.every((e) => same(e.args.account, d.timelock)), "only the timelock administers itself");

  if (requireMultisigs) {
    console.log("Multisigs");
    for (const name of ["admin", "guardian"]) {
      check((await ethers.provider.getCode(d.roles[name])) !== "0x", `${name} ${d.roles[name]} is a contract`);
    }
  }

  console.log("Role holders");
  for (const [label, address, names] of accessControlled) {
    const c = await ethers.getContractAt("TokenOracle", address); // same AccessControl ABI
    const roleIds = {
      admin: [await c.DEFAULT_ADMIN_ROLE(), d.timelock],
      guardian: [ethers.id("GUARDIAN_ROLE"), d.roles.guardian],
      keeper: [ethers.id("KEEPER_ROLE"), d.roles.keeper],
    };
    const expected = Object.fromEntries(names.map((n) => roleIds[n]));
    const holders = new Map();
    for (const e of logs.filter((l) => l.address === address.toLowerCase())) {
      const k = `${e.args.role}:${e.args.account.toLowerCase()}`;
      if (e.name === "RoleGranted") holders.set(k, [e.args.role, e.args.account]);
      else holders.delete(k);
    }
    const unexpected = [...holders.values()].filter(([role, account]) => !same(expected[role], account));
    check(unexpected.length === 0 && holders.size === names.length, `${label}: exactly ${names.map((n) => (n === "admin" ? "timelock admin" : n)).join(", ")}`);
    check(!(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), d.deployer)), `${label}: deployer has no admin role`);
  }

  console.log("Wiring");
  const oracle = await ethers.getContractAt("TokenOracle", d.oracle);
  const registry = await ethers.getContractAt("AgentRegistry", d.registry);
  const market = await ethers.getContractAt("AgentMarket", d.market);
  check(same(await registry.oracle(), d.oracle), "registry prices with this TokenOracle");
  check(same(await registry.treasury(), d.timelock), "treasury share goes to the timelock: it moves only by a public 48h proposal");
  check(same(await market.registry(), d.registry), "market sells the agents of this registry");

  console.log("Money flows (fixed in code)");
  const [c, b, t] = await Promise.all([market.CREATOR_BPS(), market.BURN_BPS(), market.TREASURY_BPS()]);
  check(c === 6000n && b === 3000n && t === 1000n, "every payment: 60% creator, 30% burned, 10% treasury");
  check((await registry.DEPLOY_BURN_BPS()) === 8000n, "deployment fee: 80% burned, 20% treasury");
  const fee = await registry.deploymentFeeWei();
  check(fee <= ethers.parseEther("1"), `deployment fee ${ethers.formatEther(fee)} ETH in $SAGE (code cap 1 ETH)`);
  for (const [label, contract] of [["AgentMarket", market], ["AgentRegistry", registry]]) {
    const fns = contract.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    check(!fns.some((n) => /withdraw|sweep|rescue|transfer/i.test(n)), `${label} has no withdraw or transfer function`);
  }

  console.log("Oracle");
  const [minInterval, maxStep, maxAge] = await Promise.all([oracle.minInterval(), oracle.maxStepBps(), oracle.maxAge()]);
  check(maxStep <= 5000n && minInterval >= 60n, `keeper moves the price at most ${Number(maxStep) / 100}% every ${Number(minInterval) / 60} min; refused after ${Number(maxAge) / 3600}h without update`);
  const price = await oracle.price();
  if (price === 0n) console.log("  info  no price yet: set with $SAGE by ./set-token.sh after the Pons launch");
  else console.log(`  info  1 ETH = ${ethers.formatEther(price)} $SAGE${(await oracle.isFresh()) ? "" : " (stale or frozen: sales wait for a fresh price)"}`);

  console.log("Agents");
  const expected = agents.seeds();
  const count = await registry.agentCount();
  check(count >= BigInt(expected.length), `${count} agents (${expected.length} seeded at deployment)`);
  for (let i = 0; i < expected.length && i < Number(count); i++) {
    const a = await registry.getAgent(i + 1);
    const s = expected[i];
    if (a.version > 1n) console.log(`  info  #${i + 1} ${a.name}: updated by the treasury (version ${a.version})`);
    else check(a.configHash === s.configHash && same(a.creator, d.timelock), `#${i + 1} ${a.name}: config hash matches contracts/config/${require("../config/robinhood.json").protocol.seeds[i].file}, owned by the treasury`);
  }

  console.log("$SAGE");
  const token = await registry.token();
  if (d.token) check(same(token, d.token), `$SAGE ${d.token}`);
  else if (same(token, ethers.ZeroAddress)) console.log("  info  $SAGE not set yet: the timelock sets it once, after the Pons launch (./set-token.sh)");
  else console.log(`  info  $SAGE set on-chain to ${token}`);
  check(!(await registry.paused()) && !(await market.paused()), "not paused");

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed: the deployer holds no power over StockSage.");
  return failures;
}

async function main() {
  const hre = require("hardhat");
  const file = process.env.DEPLOYMENT || path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`Verifying ${path.relative(process.cwd(), file)} on ${hre.network.name}\n`);
  const failures = await verifyDeployment(hre.ethers, d, { requireMultisigs: hre.network.name === "robinhood" && process.env.ALLOW_PLAIN_WALLETS !== "1" });
  if (failures) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { verifyDeployment };
