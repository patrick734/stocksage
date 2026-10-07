// Timelock actions. Read-only unless GOVERN_SEND is set (by ./set-token.sh or ./govern.sh with
// --schedule or --execute). For a Safe admin it writes Safe Transaction Builder files to safe-txs/ instead.
//
//   node scripts/govern.js set-token <address>    set $SAGE (once) and its first price from the Pons pool
//   node scripts/govern.js set-price <$SAGE/ETH>  reset the oracle price, without the keeper's step limit
//   node scripts/govern.js set-deploy-fee <eth>   change the agent deployment fee (0 to 1 ETH, paid in $SAGE)
//   node scripts/govern.js status                 scheduled timelock actions and whether they can execute
//
// A scheduled action is saved in safe-txs/<name>-op.json, so --execute sends exactly what --schedule scheduled.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const pons = require("../lib/pons");

const RPC = process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
const OUT = path.join(__dirname, "..", "..", "safe-txs");
const DEPLOYMENT = process.env.DEPLOYMENT || path.join(__dirname, "..", "deployments", "robinhood.json");
const LOG_CHUNK = 400_000;

const TIMELOCK_ABI = [
  "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)",
  "function getMinDelay() view returns (uint256)",
  "function hashOperationBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) view returns (bytes32)",
  "function isOperationPending(bytes32 id) view returns (bool)",
  "function isOperationReady(bytes32 id) view returns (bool)",
  "function isOperationDone(bytes32 id) view returns (bool)",
  "function getTimestamp(bytes32 id) view returns (uint256)",
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
];
const REGISTRY_ABI = [
  "function token() view returns (address)",
  "function setToken(address token)",
  "function deploymentFeeWei() view returns (uint256)",
  "function setDeploymentFee(uint256 feeWei)",
];
const ORACLE_ABI = ["function price() view returns (uint256)", "function setPrice(uint256 next)"];
const KNOWN = new ethers.Interface([
  ...REGISTRY_ABI.filter((s) => !s.includes("view")),
  "function setPrice(uint256 next)",
  "function setBounds(uint32 minInterval, uint16 maxStepBps, uint32 maxAge)",
  "function unfreeze()",
  "function unpause()",
  "function unblockAgent(uint256 agentId)",
  "function updateAgent(uint256 agentId, bytes32 configHash, string metadataURI)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function transfer(address to, uint256 amount)",
]);

function load() {
  if (!fs.existsSync(DEPLOYMENT)) throw new Error("No contracts/deployments/robinhood.json. Deploy first with ./launch.sh.");
  const d = JSON.parse(fs.readFileSync(DEPLOYMENT, "utf8"));
  const provider = new ethers.JsonRpcProvider(RPC);
  return { d, provider, timelock: new ethers.Contract(d.timelock, TIMELOCK_ABI, provider) };
}

function write(file, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, file);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return path.relative(path.join(__dirname, "..", ".."), p);
}

function safeBatch(name, admin, to, data) {
  return {
    version: "1.0",
    chainId: String(config.network.chainId),
    createdAt: Date.now(),
    meta: { name, description: "Agent market timelock", txBuilderVersion: "1.17.1", createdFromSafeAddress: admin, createdFromOwnerAddress: "" },
    transactions: [{ to, value: "0", data, contractMethod: null, contractInputsValues: null }],
  };
}

/**
 * One timelock batch. `build` returns { calls: [{to, data}], salt }; it is only called when nothing is saved yet,
 * so a pending action keeps the exact calls it was scheduled with.
 */
async function prepare(ctx, slug, title, build) {
  const { d, timelock } = ctx;
  const opFile = path.join(OUT, `${slug}-op.json`);
  let op = fs.existsSync(opFile) ? JSON.parse(fs.readFileSync(opFile, "utf8")) : null;
  const idOf = (o) => timelock.hashOperationBatch(o.calls.map((c) => c.to), o.calls.map(() => 0), o.calls.map((c) => c.data), ethers.ZeroHash, o.salt);
  if (op) {
    const id = await idOf(op);
    if (await timelock.isOperationDone(id)) {
      fs.rmSync(opFile);
      op = null;
    } else if (!(await timelock.isOperationPending(id))) op = null;
  }
  if (!op) {
    op = await build();
    if (!op) return;
  }
  const id = await idOf(op);
  if (await timelock.isOperationDone(id)) return console.log(`"${title}" was already executed. Nothing to do.`);
  const pending = await timelock.isOperationPending(id);
  const delay = await timelock.getMinDelay();
  const tl = new ethers.Interface(TIMELOCK_ABI);
  const args = [op.calls.map((c) => c.to), op.calls.map(() => 0), op.calls.map((c) => c.data), ethers.ZeroHash, op.salt];
  const schedule = tl.encodeFunctionData("scheduleBatch", [...args, delay]);
  const execute = tl.encodeFunctionData("executeBatch", args);
  write(`${slug}-op.json`, op);
  const a = write(`${slug}-1-schedule.json`, safeBatch(`${title}: schedule`, d.roles.admin, d.timelock, schedule));
  const b = write(`${slug}-2-execute.json`, safeBatch(`${title}: execute`, d.roles.admin, d.timelock, execute));
  console.log(`\nTimelock operation ${id}`);
  if (pending) {
    const ts = Number(await timelock.getTimestamp(id));
    console.log((await timelock.isOperationReady(id)) ? "Scheduled and READY to execute." : `Scheduled; executable after ${new Date(ts * 1000).toISOString()}.`);
  }
  if (process.env.GOVERN_SEND) return send(ctx, process.env.GOVERN_SEND, { schedule, execute, pending, id });
  if ((await ctx.provider.getCode(d.roles.admin)) === "0x") {
    console.log(`\nThe admin ${d.roles.admin} is a plain wallet. Send it from there with:`);
    console.log(`  1. Now:            ${ctx.cmd} --schedule`);
    console.log(`  2. After ${Number(delay) / 3600} hours:  ${ctx.cmd} --execute   (check with: ./govern.sh status)`);
    return;
  }
  console.log(`\nIn the admin Safe ${d.roles.admin} on app.safe.global:`);
  console.log(`  1. Now:            Apps > Transaction Builder > drag in ${a} > Create batch > sign with the owners`);
  console.log(`  2. After ${Number(delay) / 3600} hours:  same with ${b}`);
}

async function send(ctx, mode, { schedule, execute, pending, id }) {
  const { d, provider, timelock } = ctx;
  if (!process.env.ADMIN_PRIVATE_KEY) throw new Error("no admin key: run this through ./set-token.sh or ./govern.sh with --schedule or --execute");
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  if (wallet.address.toLowerCase() !== d.roles.admin.toLowerCase()) throw new Error(`ADMIN_ACCOUNT is ${wallet.address}, but the timelock's admin is ${d.roles.admin}.`);
  if (mode === "schedule" && pending) return console.log("\nAlready scheduled. Run the same command with --execute once it is ready.");
  if (mode === "execute") {
    if (!pending) throw new Error("not scheduled yet. Run the same command with --schedule first.");
    if (!(await timelock.isOperationReady(id))) throw new Error(`not ready yet: executable after ${new Date(Number(await timelock.getTimestamp(id)) * 1000).toISOString()}.`);
  }
  if (mode !== "schedule" && mode !== "execute") throw new Error(`unknown mode ${mode}`);
  const tx = await wallet.sendTransaction({ to: d.timelock, data: mode === "schedule" ? schedule : execute });
  console.log(`\n${mode} sent: ${config.network.explorer}/tx/${tx.hash}`);
  const r = await tx.wait();
  if (r.status !== 1) throw new Error("the transaction reverted");
  console.log(mode === "schedule" ? "Scheduled. Run the same command with --execute after the delay." : "Executed.");
}

async function setToken(ctx, address) {
  if (!address || !ethers.isAddress(address)) throw new Error("usage: ./set-token.sh <token address>");
  const { d, provider } = ctx;
  const token = ethers.getAddress(address);
  const registry = new ethers.Contract(d.registry, REGISTRY_ABI, provider);
  const oracle = new ethers.Contract(d.oracle, ORACLE_ABI, provider);
  const current = await registry.token();
  if (current !== ethers.ZeroAddress) {
    if (current.toLowerCase() === token.toLowerCase()) return console.log("$SAGE is already set to this token. Nothing to do.");
    throw new Error(`$SAGE is already set to ${current}; it can only be set once.`);
  }
  ctx.cmd = `./set-token.sh ${token}`;
  await prepare(ctx, "set-token", "Set $SAGE and its first price", async () => {
    if ((await provider.getCode(token)) === "0x") throw new Error(`No contract at ${token} on Robinhood Chain.`);
    const t = new ethers.Contract(token, ["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"], provider);
    const [symbol, decimals, supply] = await Promise.all([t.symbol(), t.decimals(), t.totalSupply()]);
    if (decimals !== 18n) throw new Error(`${symbol} has ${decimals} decimals; the contracts expect 18.`);
    const price = await pons.tokenPerEth(provider, token);
    if (!price) throw new Error(`No Pons pool (ETH / ${symbol}, fee ${config.pons.poolFee}, tick spacing ${config.pons.poolTickSpacing}) found for ${token}.`);
    console.log(`$SAGE candidate: ${symbol} at ${token}, supply ${ethers.formatEther(supply)}`);
    console.log(`First price from its Pons pool: 1 ETH = ${ethers.formatEther(price)} ${symbol}`);
    return {
      calls: [
        { to: d.registry, data: registry.interface.encodeFunctionData("setToken", [token]) },
        { to: d.oracle, data: oracle.interface.encodeFunctionData("setPrice", [price]) },
      ],
      salt: ethers.id(`agents:set-token:${token.toLowerCase()}`),
    };
  });
  console.log("\nOnce it executes, deploying agents and buying uses work, and the keeper keeps the price current.");
}

async function setPrice(ctx, arg) {
  const n = Number(arg);
  if (!arg || !(n > 0)) throw new Error("usage: ./govern.sh set-price <$SAGE per 1 ETH>   (for example 25000000)");
  const price = ethers.parseEther(arg);
  const { d, provider } = ctx;
  const oracle = new ethers.Contract(d.oracle, ORACLE_ABI, provider);
  console.log(`Oracle price: 1 ETH = ${ethers.formatEther(await oracle.price())} $SAGE now; ${arg} after the timelock`);
  ctx.cmd = `./govern.sh set-price ${arg}`;
  await prepare(ctx, `set-price-${arg}`, `Set the price to ${arg} per ETH`, async () => ({
    calls: [{ to: d.oracle, data: oracle.interface.encodeFunctionData("setPrice", [price]) }],
    salt: ethers.id(`agents:set-price:${price}:${Date.now()}`),
  }));
}

async function setDeployFee(ctx, arg) {
  if (!arg || !(Number(arg) >= 0) || Number(arg) > 1) throw new Error("usage: ./govern.sh set-deploy-fee <ETH, 0 to 1>   (launch value 0.001)");
  const fee = ethers.parseEther(arg);
  const { d, provider } = ctx;
  const registry = new ethers.Contract(d.registry, REGISTRY_ABI, provider);
  const current = await registry.deploymentFeeWei();
  if (current === fee) return console.log(`The deployment fee is already ${arg} ETH. Nothing to do.`);
  console.log(`Deployment fee: ${ethers.formatEther(current)} ETH now; ${arg} ETH after the timelock`);
  ctx.cmd = `./govern.sh set-deploy-fee ${arg}`;
  await prepare(ctx, `set-deploy-fee-${arg}`, `Set the deployment fee to ${arg} ETH`, async () => ({
    calls: [{ to: d.registry, data: registry.interface.encodeFunctionData("setDeploymentFee", [fee]) }],
    salt: ethers.id(`agents:set-deploy-fee:${fee}:${Date.now()}`),
  }));
}

async function status({ d, provider, timelock }) {
  const head = await provider.getBlockNumber();
  const scan = async (tl) => {
    const out = [];
    for (let from = d.startBlock ?? 0; from <= head; from += LOG_CHUNK) out.push(...(await tl.queryFilter(tl.filters.CallScheduled(), from, Math.min(from + LOG_CHUNK - 1, head))));
    return out;
  };
  let events;
  try {
    events = await scan(timelock);
  } catch {
    const pub = new ethers.JsonRpcProvider(config.network.rpcUrl, config.network.chainId, { staticNetwork: true });
    events = await scan(new ethers.Contract(d.timelock, TIMELOCK_ABI, pub));
  }
  if (!events.length) return console.log("No timelock actions have ever been scheduled.");
  const names = { [d.registry.toLowerCase()]: "AgentRegistry", [d.oracle.toLowerCase()]: "TokenOracle", [d.market.toLowerCase()]: "AgentMarket", [d.timelock.toLowerCase()]: "Timelock" };
  for (const e of events) {
    const { id, target, data } = e.args;
    let call = data.slice(0, 10);
    try {
      const p = KNOWN.parseTransaction({ data });
      call = `${p.name}(${p.args.map(String).join(", ")})`;
    } catch {}
    const [done, ready, pending] = await Promise.all([timelock.isOperationDone(id), timelock.isOperationReady(id), timelock.isOperationPending(id)]);
    const ts = Number(await timelock.getTimestamp(id));
    const state = done ? "EXECUTED" : ready ? "READY to execute" : pending ? `waiting until ${new Date(ts * 1000).toISOString()}` : "cancelled";
    console.log(`${state.padEnd(36)} ${names[target.toLowerCase()] ?? target}.${call}`);
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const ctx = load();
  const chainId = Number((await ctx.provider.getNetwork()).chainId);
  if (chainId !== config.network.chainId && process.env.LOCAL_TEST !== "1") {
    throw new Error(`the RPC is on chain ${chainId}, not Robinhood Chain (${config.network.chainId}). Check ROBINHOOD_RPC_URL in launch.env.`);
  }
  if (cmd === "set-token") return setToken(ctx, arg);
  if (cmd === "set-price") return setPrice(ctx, arg);
  if (cmd === "set-deploy-fee") return setDeployFee(ctx, arg);
  if (cmd === "status") return status(ctx);
  throw new Error("usage: node scripts/govern.js set-token <address> | set-price <per ETH> | set-deploy-fee <eth> | status");
}

main().catch((e) => {
  console.error(`STOPPED: ${e.shortMessage || e.message}`);
  process.exit(1);
});
