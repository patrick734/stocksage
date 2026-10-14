// Read-only launch checks. Sends nothing and never needs a private key.
// Env: DEPLOYER_ADDRESS, TREASURY_ADDRESS (optional), ROBINHOOD_RPC_URL (optional).
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const agents = require("../lib/agents");

const RPC = process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
const MIN_DEPLOYER_ETH = ethers.parseEther(process.env.MIN_DEPLOYER_ETH || "0.003");

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

  console.log("Wallets");
  if (!process.env.DEPLOYER_ADDRESS) fail("DEPLOYER_ADDRESS is not set");
  else {
    const d = ethers.getAddress(process.env.DEPLOYER_ADDRESS);
    const bal = await provider.getBalance(d);
    bal >= MIN_DEPLOYER_ETH ? ok(`dev wallet ${d} holds ${ethers.formatEther(bal)} ETH (it will own all three contracts)`) : fail(`dev wallet ${d} holds ${ethers.formatEther(bal)} ETH, needs ${ethers.formatEther(MIN_DEPLOYER_ETH)}`);
  }
  if (process.env.TREASURY_ADDRESS) {
    ethers.isAddress(process.env.TREASURY_ADDRESS) ? ok(`treasury ${ethers.getAddress(process.env.TREASURY_ADDRESS)}`) : fail("TREASURY_ADDRESS is not an address");
  } else ok("treasury: the dev wallet (set TREASURY_ADDRESS for a separate one)");

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
