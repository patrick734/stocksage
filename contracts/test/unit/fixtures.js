const { ethers } = require("hardhat");

// 1 ETH buys 1,000,000 $SAGE.
const RATE = ethers.parseEther("1000000");
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function deployAll({ setSage = true } = {}) {
  const [owner, treasury, alice, bob, carol] = await ethers.getSigners();
  const oracle = await ethers.deployContract("SageOracle", [owner, RATE]);
  const registry = await ethers.deployContract("AgentRegistry", [owner, oracle, treasury]);
  const market = await ethers.deployContract("AgentMarket", [owner, registry, oracle, treasury]);
  const sage = await ethers.deployContract("MockSage", [alice.address, ethers.parseEther("1000000000")]);
  for (const u of [bob, carol]) await sage.connect(alice).transfer(u, ethers.parseEther("10000000"));
  if (setSage) {
    await registry.setSage(sage);
    await market.setSage(sage);
  }
  return { owner, treasury, alice, bob, carol, oracle, registry, market, sage };
}

module.exports = { RATE, DEAD, deployAll };
