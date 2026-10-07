// Read-only launch checks. Sends nothing and never needs a private key.
// Env: ADMIN_MULTISIG, GUARDIAN_MULTISIG, KEEPER_ADDRESS, DEPLOYER_ADDRESS, ROBINHOOD_RPC_URL (optional).
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const agents = require("../lib/agents");

const RPC = process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
const MIN_DEPLOYER_ETH = ethers.parseEther(process.env.MIN_DEPLOYER_ETH || "0.005");

let failed = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => {
  failed++;
  console.log(`  FAIL  ${m}`);
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, config.network.chainId, { staticNetwork: true });
  console.log("Network");
  const chainId = BigInt(await provider.send("eth_chainId", []));
  chainId === BigInt(config.network.chainId) ? ok(`chainId ${chainId} (Robinhood Chain)`) : fail(`chainId ${chainId}, expected ${config.network.chainId}`);

  console.log("Roles");
  const roles = {};
  for (const name of ["ADMIN_MULTISIG", "GUARDIAN_MULTISIG", "KEEPER_ADDRESS"]) {
    const v = process.env[name];
    if (!v || !ethers.isAddress(v)) {
      fail(`${name} is not set to an address`);
      continue;
    }
    roles[name] = ethers.getAddress(v);
    const isContract = (await provider.getCode(v)) !== "0x";
    const wantsContract = name !== "KEEPER_ADDRESS";
    if (wantsContract && !isContract && process.env.ALLOW_PLAIN_WALLETS === "1") ok(`${name} ${roles[name]} (plain wallet, allowed by ALLOW_PLAIN_WALLETS=1)`);
    else if (wantsContract && !isContract) fail(`${name} ${roles[name]} is a plain wallet; it must be a multisig (or set ALLOW_PLAIN_WALLETS=1)`);
    else ok(`${name} ${roles[name]}`);
  }
  if (new Set(Object.values(roles)).size !== Object.values(roles).length) fail("admin, guardian and keeper must be three different addresses");
  if (process.env.DEPLOYER_ADDRESS) {
    console.log("Deployer");
    const d = ethers.getAddress(process.env.DEPLOYER_ADDRESS);
    const bal = await provider.getBalance(d);
    bal >= MIN_DEPLOYER_ETH ? ok(`${d} holds ${ethers.formatEther(bal)} ETH`) : fail(`${d} holds ${ethers.formatEther(bal)} ETH, needs ${ethers.formatEther(MIN_DEPLOYER_ETH)}`);
    if (Object.values(roles).includes(d)) fail("the deployer is also one of the role addresses; deploy from a fresh wallet");
  }

  console.log("Uniswap and Pons");
  for (const [label, a] of [
    ["Uniswap v4 PoolManager", config.uniswap.poolManager],
    ["Pons hook", config.pons.hook],
  ]) {
    (await provider.getCode(a)) !== "0x" ? ok(`${label} ${ethers.getAddress(a)}`) : fail(`${label}: no contract at ${a}`);
  }

  console.log("Seed agents");
  for (const s of agents.seeds()) ok(`${s.name}: ${s.pricePerUseWei ? `${ethers.formatEther(s.pricePerUseWei)} ETH per use` : "free"}, config ${s.configHash.slice(0, 10)}…`);

  console.log(failed ? `\n${failed} check(s) failed. Fix them before deploying.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Preflight could not finish:", e.shortMessage || e.message);
  process.exit(1);
});
