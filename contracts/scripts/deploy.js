// Deploys StockSage: SageOracle, AgentRegistry and AgentMarket, then deploys the seed agents from the dev wallet
// (free, because $SAGE is not set yet). The dev wallet owns all three contracts (two-step transfer). The treasury is
// TREASURY_ADDRESS, or the dev wallet when unset. $SAGE and its rate are set afterwards with ./set-token.sh.
//
//   Local demo (mock $SAGE):  npx hardhat run scripts/deploy.js
//   Fork dry run:             FORK=1 DEPLOY_LIVE=1 npx hardhat run scripts/deploy.js
//   Robinhood Chain:          node ../tools/with-key.js <wallet> -- npx hardhat run scripts/deploy.js --network robinhood
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const config = require("../config/robinhood.json");
const agents = require("../lib/agents");
const { checkDeployment } = require("./verify");

const LIVE = network.name === "robinhood" || process.env.DEPLOY_LIVE === "1";
const m = config.protocol;
const SOURCES = [];

async function deploy(name, args = []) {
  const c = await ethers.deployContract(name, args);
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log(`  ${name.padEnd(20)} ${address}`);
  SOURCES.push({ contract: name, address });
  return c;
}

async function main() {
  if (network.name === "hardhat" && process.env.FORK) await network.provider.send("hardhat_mine", ["0x1"]);
  const [deployer, ...rest] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS ? ethers.getAddress(process.env.TREASURY_ADDRESS) : deployer.address;

  console.log(`Deploying StockSage to ${network.name} from ${deployer.address}`);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const out = { network: network.name, chainId, deployer: deployer.address, owner: deployer.address, treasury, startBlock: await ethers.provider.getBlockNumber() };

  const oracle = await deploy("SageOracle", [deployer.address, ethers.parseEther(m.initialSagePerEth)]);
  out.oracle = await oracle.getAddress();
  const registry = await deploy("AgentRegistry", [deployer.address, out.oracle, treasury]);
  out.registry = await registry.getAddress();
  const market = await deploy("AgentMarket", [deployer.address, out.registry, out.oracle, treasury]);
  out.market = await market.getAddress();
  out.token = null;
  out.deployBlock = out.startBlock;

  const fee = ethers.parseEther(m.deploymentFeeEth);
  if ((await registry.deploymentFeeWei()) !== fee) await (await registry.setDeploymentFee(fee, await registry.deploymentBurnBps())).wait();

  const seeds = agents.seeds();
  for (const s of seeds) {
    await (await registry.deployAgent(s.name, s.metadataURI, s.configHash, s.pricePerUseWei, 0)).wait();
    console.log(`  agent ${String(await registry.agentCount()).padEnd(3)} ${s.name}`);
  }

  if (!LIVE) await seedLocal(out, rest, registry, market);
  out.sources = SOURCES;

  const label = network.name === "robinhood" ? "robinhood" : LIVE ? "fork" : network.name;
  const file = path.join(__dirname, "..", "deployments", `${label}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${path.relative(process.cwd(), file)}\n`);

  const failures = await checkDeployment(ethers, out);
  if (failures) {
    console.error(`\n${failures} check(s) failed. Do not announce this deployment.`);
    process.exitCode = 1;
  }
}

/** Local demo only: a mock $SAGE, set in the registry and the market. */
async function seedLocal(out, rest, registry, market) {
  const token = await deploy("MockSage", [rest[3].address, ethers.parseEther("1000000000")]);
  await (await registry.setSage(token)).wait();
  await (await market.setSage(token)).wait();
  out.token = await token.getAddress();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
