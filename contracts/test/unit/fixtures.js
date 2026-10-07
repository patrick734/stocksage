const { ethers, network } = require("hardhat");

const DAY = 86400;
const ETH = ethers.parseEther("1");
// 1 ETH buys 1,000,000 tokens.
const PRICE = ethers.parseEther("1000000");
const BOUNDS = { minInterval: 600, maxStepBps: 1000, maxAge: DAY };
const SEEDS = [
  { name: "Sage", metadataURI: "", configHash: ethers.id("sage"), pricePerUseWei: 0n },
  { name: "Stock Analyst", metadataURI: "ipfs://analyst", configHash: ethers.id("analyst"), pricePerUseWei: ethers.parseEther("0.0001") },
];

async function impersonate(address) {
  await network.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]);
  return ethers.getImpersonatedSigner(address);
}

async function deployAll({ plainToken = false, setToken = true, setPrice = true } = {}) {
  const [deployer, admin, guardian, keeper, alice, bob, carol] = await ethers.getSigners();
  const timelock = await ethers.deployContract("TimelockController", [2 * DAY, [admin.address], [admin.address], ethers.ZeroAddress]);
  const oracle = await ethers.deployContract("TokenOracle", [timelock, guardian, keeper, BOUNDS.minInterval, BOUNDS.maxStepBps, BOUNDS.maxAge]);
  const registry = await ethers.deployContract("AgentRegistry", [timelock, guardian, oracle, timelock, ethers.parseEther("0.001"), SEEDS]);
  const market = await ethers.deployContract("AgentMarket", [timelock, guardian, registry]);
  const token = await ethers.deployContract(plainToken ? "MockPlainToken" : "MockBurnableToken", [alice.address, ethers.parseEther("1000000000")]);
  const tl = await impersonate(await timelock.getAddress());
  if (setToken) await registry.connect(tl).setToken(token);
  if (setPrice) await oracle.connect(tl).setPrice(PRICE);
  for (const u of [bob, carol]) await token.connect(alice).transfer(u, ethers.parseEther("10000000"));
  return { deployer, admin, guardian, keeper, alice, bob, carol, timelock, tl, oracle, registry, market, token };
}

module.exports = { DAY, ETH, PRICE, BOUNDS, SEEDS, deployAll, impersonate };
