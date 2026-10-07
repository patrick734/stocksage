// Deploys StockSage. Every contract is configured in its constructor and governed by the 48h timelock from its
// first block: the deployer wallet ends with no role, no ownership and nothing pending. The timelock is also the
// treasury, so the treasury share can only move by a public 48h proposal.
//
//   Local demo (mock token, price set):  npx hardhat run scripts/deploy.js
//   Fork dry run:                        FORK=1 DEPLOY_LIVE=1 npx hardhat run scripts/deploy.js
//   Robinhood Chain:                     npx hardhat run scripts/deploy.js --network robinhood
//
// Live deploys read from env: ADMIN_MULTISIG, GUARDIAN_MULTISIG, KEEPER_ADDRESS (ALLOW_PLAIN_WALLETS=1 allows plain
// wallets for admin and guardian). $SAGE and its first price are set after the Pons launch with ./set-token.sh.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const config = require("../config/robinhood.json");
const agents = require("../lib/agents");
const { verifyDeployment } = require("./verify");

const LIVE = network.name === "robinhood" || process.env.DEPLOY_LIVE === "1";
const REAL_ROLES = network.name === "robinhood" || (LIVE && Boolean(process.env.ADMIN_MULTISIG));
const m = config.protocol;

async function deploy(name, args = []) {
  const c = await ethers.deployContract(name, args);
  await c.waitForDeployment();
  console.log(`  ${name.padEnd(20)} ${await c.getAddress()}`);
  return c;
}

async function main() {
  if (network.name === "hardhat" && process.env.FORK) await network.provider.send("hardhat_mine", ["0x1"]);
  const [deployer, ...rest] = await ethers.getSigners();
  const roles = REAL_ROLES
    ? { admin: required("ADMIN_MULTISIG"), guardian: required("GUARDIAN_MULTISIG"), keeper: required("KEEPER_ADDRESS") }
    : { admin: rest[0].address, guardian: rest[1].address, keeper: rest[2].address };
  await checkRoles(roles, deployer.address);

  console.log(`Deploying StockSage to ${network.name} from ${deployer.address}`);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const out = { network: network.name, chainId, deployer: deployer.address, roles, startBlock: await ethers.provider.getBlockNumber() };

  const timelock = await deploy("TimelockController", [m.timelockDelaySeconds, [roles.admin], [roles.admin], ethers.ZeroAddress]);
  out.timelock = await timelock.getAddress();
  out.treasury = out.timelock;

  const o = m.oracle;
  const oracle = await deploy("TokenOracle", [out.timelock, roles.guardian, roles.keeper, o.minIntervalSeconds, o.maxStepBps, o.maxAgeSeconds]);
  out.oracle = await oracle.getAddress();

  const seeds = agents.seeds();
  const registry = await deploy("AgentRegistry", [out.timelock, roles.guardian, out.oracle, out.treasury, ethers.parseEther(m.deploymentFeeEth), seeds]);
  out.registry = await registry.getAddress();

  const market = await deploy("AgentMarket", [out.timelock, roles.guardian, out.registry]);
  out.market = await market.getAddress();
  out.token = null;
  out.deployBlock = out.startBlock;
  console.log(`  ${seeds.length} seed agents: ${seeds.map((s) => s.name).join(", ")}`);

  if (!LIVE) await seedLocal(out, rest);

  const label = network.name === "robinhood" ? "robinhood" : LIVE ? "fork" : network.name;
  const file = path.join(__dirname, "..", "deployments", `${label}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${path.relative(process.cwd(), file)}\n`);

  let failures;
  try {
    failures = await verifyDeployment(ethers, out, { requireMultisigs: REAL_ROLES && process.env.ALLOW_PLAIN_WALLETS !== "1" });
  } catch (e) {
    console.error(`\nThe contracts ARE deployed (${path.relative(process.cwd(), file)}), but verification could not finish:`);
    console.error(`  ${e.shortMessage || e.message}`);
    console.error("Do NOT deploy again. Run ./verify.sh to finish the checks.");
    process.exit(3);
  }
  if (failures) {
    console.error(`\n${failures} verification check(s) failed. Do not announce this deployment.`);
    process.exitCode = 1;
  }
}

async function checkRoles(roles, deployer) {
  const all = [roles.admin, roles.guardian, roles.keeper].map((a) => a.toLowerCase());
  if (new Set(all).size !== all.length) throw new Error("admin, guardian and keeper must be three different addresses");
  if (all.includes(deployer.toLowerCase())) throw new Error("the deployer must not hold any role: use a fresh wallet for deploying");
  if (REAL_ROLES && process.env.ALLOW_PLAIN_WALLETS !== "1") {
    for (const name of ["admin", "guardian"]) {
      if ((await ethers.provider.getCode(roles[name])) === "0x") throw new Error(`${name} ${roles[name]} must be a multisig contract, not a plain wallet`);
    }
  }
}

function required(name) {
  const v = process.env[name];
  if (!v || !ethers.isAddress(v)) throw new Error(`${name} must be set to an address for live deploys`);
  return ethers.getAddress(v);
}

/** Local demo only: a mock token and its first price, set through the impersonated timelock (48h on mainnet). */
async function seedLocal(out, rest) {
  const token = await deploy("MockBurnableToken", [rest[3].address, ethers.parseEther("1000000000")]);
  await network.provider.send("hardhat_setBalance", [out.timelock, "0x56BC75E2D63100000"]);
  const tl = await ethers.getImpersonatedSigner(out.timelock);
  await (await (await ethers.getContractAt("AgentRegistry", out.registry, tl)).setToken(token)).wait();
  await (await (await ethers.getContractAt("TokenOracle", out.oracle, tl)).setPrice(ethers.parseEther("1000000"))).wait();
  out.token = await token.getAddress();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
