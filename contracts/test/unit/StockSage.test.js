const { expect } = require("chai");
const { ethers } = require("hardhat");
const { RATE, DEAD, deployAll } = require("./fixtures");

const E = ethers.parseEther;
const MAX = ethers.MaxUint256;
const quote = (wei) => (wei * RATE) / E("1");

async function deployAgent(f, who, price = E("0.0001"), name = "Analyst") {
  await f.sage.connect(who).approve(f.registry, MAX);
  const tx = await f.registry.connect(who).deployAgent(name, "ipfs://a", ethers.id(name), price, MAX);
  const r = await tx.wait();
  return f.registry.interface.parseLog(r.logs.find((l) => l.address === f.registry.target)).args.agentId;
}

describe("SageOracle", () => {
  it("starts at the constructor rate and only the owner can change it", async () => {
    const f = await deployAll();
    expect(await f.oracle.sagePerEth()).to.equal(RATE);
    await expect(f.oracle.setRate(5n)).to.emit(f.oracle, "RateUpdated").withArgs(5n);
    await expect(f.oracle.setRate(0n)).to.be.revertedWithCustomError(f.oracle, "ZeroRate");
    await expect(f.oracle.connect(f.alice).setRate(1n)).to.be.revertedWithCustomError(f.oracle, "OwnableUnauthorizedAccount");
  });
});

describe("AgentRegistry", () => {
  it("has the starting fee, burn share and burn address", async () => {
    const f = await deployAll();
    expect(await f.registry.deploymentFeeWei()).to.equal(E("0.005"));
    expect(await f.registry.deploymentBurnBps()).to.equal(8000);
    expect(await f.registry.BURN_ADDRESS()).to.equal(DEAD);
    expect(await f.registry.quoteSage(0)).to.equal(0);
    expect(await f.registry.quoteSage(E("0.005"))).to.equal(quote(E("0.005")));
  });

  it("before $SAGE is set, only the owner can deploy agents, for free", async () => {
    const f = await deployAll({ setSage: false });
    await expect(f.registry.connect(f.alice).deployAgent("x", "", ethers.ZeroHash, 0, 0)).to.be.revertedWithCustomError(f.registry, "TokenNotSet");
    await expect(f.registry.deployAgent("Sage", "", ethers.id("sage"), 0, 0))
      .to.emit(f.registry, "AgentDeployed")
      .withArgs(1, f.owner.address, "Sage", 0, ethers.id("sage"), "", 0, 0);
    const a = await f.registry.getAgent(1);
    expect(a.creator).to.equal(f.owner.address);
    expect(a.version).to.equal(1);
    expect(a.active).to.equal(true);
    expect(await f.registry.agentsOf(f.owner)).to.deep.equal([1n]);
  });

  it("charges the fee in $SAGE: 80% to the burn address, 20% to the treasury", async () => {
    const f = await deployAll();
    const fee = quote(E("0.005"));
    const burn = (fee * 8000n) / 10000n;
    await f.sage.connect(f.alice).approve(f.registry, MAX);
    await expect(f.registry.connect(f.alice).deployAgent("A", "u", ethers.id("a"), E("0.001"), fee))
      .to.emit(f.registry, "AgentDeployed")
      .withArgs(1, f.alice.address, "A", E("0.001"), ethers.id("a"), "u", fee, burn);
    expect(await f.sage.balanceOf(DEAD)).to.equal(burn);
    expect(await f.sage.balanceOf(f.treasury)).to.equal(fee - burn);
    expect(await f.registry.agentCount()).to.equal(1);
  });

  it("checks the name, the max fee and the pause", async () => {
    const f = await deployAll();
    await f.sage.connect(f.alice).approve(f.registry, MAX);
    await expect(f.registry.connect(f.alice).deployAgent("", "", ethers.ZeroHash, 0, MAX)).to.be.revertedWithCustomError(f.registry, "EmptyName");
    const fee = quote(E("0.005"));
    await expect(f.registry.connect(f.alice).deployAgent("A", "", ethers.ZeroHash, 0, fee - 1n))
      .to.be.revertedWithCustomError(f.registry, "CostExceedsMax")
      .withArgs(fee, fee - 1n);
    await f.registry.pause();
    await expect(f.registry.connect(f.alice).deployAgent("A", "", ethers.ZeroHash, 0, MAX)).to.be.revertedWithCustomError(f.registry, "EnforcedPause");
    await f.registry.unpause();
    await f.registry.setDeploymentFee(0, 8000);
    await expect(f.registry.connect(f.bob).deployAgent("Free", "", ethers.ZeroHash, 0, 0)).to.emit(f.registry, "AgentDeployed");
  });

  it("only the creator changes an agent", async () => {
    const f = await deployAll();
    const id = await deployAgent(f, f.alice);
    await expect(f.registry.connect(f.bob).setPrice(id, 1)).to.be.revertedWithCustomError(f.registry, "NotCreator");
    await expect(f.registry.connect(f.alice).setPrice(99, 1)).to.be.revertedWithCustomError(f.registry, "UnknownAgent");
    await expect(f.registry.connect(f.alice).setPrice(id, 7)).to.emit(f.registry, "AgentPriceUpdated").withArgs(id, 7);
    await expect(f.registry.connect(f.alice).setActive(id, false)).to.emit(f.registry, "AgentActiveSet").withArgs(id, false);
    await expect(f.registry.connect(f.alice).updateAgent(id, ethers.id("v2"), "ipfs://b"))
      .to.emit(f.registry, "AgentUpdated")
      .withArgs(id, 2, ethers.id("v2"), "ipfs://b");
    const a = await f.registry.getAgent(id);
    expect([a.pricePerUseWei, a.active, a.version, a.configHash, a.metadataURI]).to.deep.equal([7n, false, 2n, ethers.id("v2"), "ipfs://b"]);
  });

  it("owner settings", async () => {
    const f = await deployAll({ setSage: false });
    await expect(f.registry.setSage(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.registry, "ZeroAddress");
    await expect(f.registry.setSage(f.bob)).to.be.revertedWithCustomError(f.registry, "NotAToken");
    await expect(f.registry.setSage(f.oracle)).to.be.revertedWithCustomError(f.registry, "NotAToken");
    const six = await ethers.deployContract("MockSixDecimals");
    await expect(f.registry.setSage(six)).to.be.revertedWithCustomError(f.registry, "UnsupportedDecimals").withArgs(6);
    await expect(f.registry.connect(f.alice).setSage(f.sage)).to.be.revertedWithCustomError(f.registry, "OwnableUnauthorizedAccount");
    await expect(f.registry.setSage(f.sage)).to.emit(f.registry, "SageSet").withArgs(f.sage.target);
    await expect(f.registry.setSage(f.sage)).to.be.revertedWithCustomError(f.registry, "TokenAlreadySet");
    await expect(f.registry.setDeploymentFee(1, 10001)).to.be.revertedWithCustomError(f.registry, "InvalidSplit");
    await expect(f.registry.setDeploymentFee(1, 5000)).to.emit(f.registry, "DeploymentFeeUpdated").withArgs(1, 5000);
    await expect(f.registry.setOracle(ethers.ZeroAddress)).to.be.revertedWithCustomError(f.registry, "ZeroAddress");
    await expect(f.registry.setOracle(f.bob)).to.emit(f.registry, "OracleUpdated").withArgs(f.bob.address);
    await expect(f.registry.setTreasury(f.bob)).to.emit(f.registry, "TreasuryUpdated").withArgs(f.bob.address);
    await expect(f.registry.transferOwnership(f.bob)).to.emit(f.registry, "OwnershipTransferStarted");
    expect(await f.registry.owner()).to.equal(f.owner.address);
    await f.registry.connect(f.bob).acceptOwnership();
    expect(await f.registry.owner()).to.equal(f.bob.address);
  });

  it("reverts a quote when the oracle call fails", async () => {
    const f = await deployAll();
    const zero = await ethers.deployContract("MockSixDecimals");
    await f.registry.setOracle(zero); // no sagePerEth(): the call fails
    await expect(f.registry.quoteSage(1)).to.be.reverted;
  });
});

describe("AgentMarket", () => {
  it("splits every purchase 60 / 30 / 10 and records it", async () => {
    const f = await deployAll();
    const id = await deployAgent(f, f.alice, E("0.0001"));
    const cost = quote(E("0.0001") * 5n);
    expect(await f.market.quoteUses(id, 5)).to.equal(cost);
    const toCreator = (cost * 6000n) / 10000n;
    const burned = (cost * 3000n) / 10000n;
    const toTreasury = cost - toCreator - burned;
    const before = [await f.sage.balanceOf(f.alice), await f.sage.balanceOf(DEAD), await f.sage.balanceOf(f.treasury)];
    await f.sage.connect(f.bob).approve(f.market, MAX);
    await expect(f.market.connect(f.bob).purchaseUses(id, 5, cost))
      .to.emit(f.market, "UsesPurchased")
      .withArgs(f.bob.address, id, 5, cost, toCreator, burned, toTreasury);
    expect((await f.sage.balanceOf(f.alice)) - before[0]).to.equal(toCreator);
    expect((await f.sage.balanceOf(DEAD)) - before[1]).to.equal(burned);
    expect((await f.sage.balanceOf(f.treasury)) - before[2]).to.equal(toTreasury);
    expect(await f.market.usesPurchased(f.bob, id)).to.equal(5);
    expect(await f.market.agentUsesSold(id)).to.equal(5);
    expect(await f.market.agentCreatorEarned(id)).to.equal(toCreator);
    expect(await f.market.agentBurned(id)).to.equal(burned);
    expect(await f.market.totalBurned()).to.equal(burned);
  });

  it("refuses free, inactive, unknown agents, zero uses, a high cost and the pause", async () => {
    const f = await deployAll();
    const paid = await deployAgent(f, f.alice, E("0.0001"), "Paid");
    const free = await deployAgent(f, f.alice, 0n, "Free");
    await f.sage.connect(f.bob).approve(f.market, MAX);
    await expect(f.market.connect(f.bob).purchaseUses(free, 1, MAX)).to.be.revertedWithCustomError(f.market, "AgentIsFree");
    await expect(f.market.connect(f.bob).purchaseUses(99, 1, MAX)).to.be.revertedWithCustomError(f.market, "AgentInactive");
    await expect(f.market.connect(f.bob).purchaseUses(paid, 0, MAX)).to.be.revertedWithCustomError(f.market, "ZeroUses");
    const cost = quote(E("0.0001"));
    await expect(f.market.connect(f.bob).purchaseUses(paid, 1, cost - 1n))
      .to.be.revertedWithCustomError(f.market, "CostExceedsMax")
      .withArgs(cost, cost - 1n);
    await f.registry.connect(f.alice).setActive(paid, false);
    await expect(f.market.connect(f.bob).purchaseUses(paid, 1, MAX)).to.be.revertedWithCustomError(f.market, "AgentInactive");
    await f.registry.connect(f.alice).setActive(paid, true);
    await f.market.pause();
    await expect(f.market.connect(f.bob).purchaseUses(paid, 1, MAX)).to.be.revertedWithCustomError(f.market, "EnforcedPause");
  });

  it("needs $SAGE set, and the owner can change the split", async () => {
    const f = await deployAll({ setSage: false });
    await expect(f.market.purchaseUses(1, 1, MAX)).to.be.revertedWithCustomError(f.market, "TokenNotSet");
    expect(await f.market.creatorBps()).to.equal(6000);
    expect(await f.market.burnBps()).to.equal(3000);
    expect(await f.market.registry()).to.equal(f.registry.target);
    await expect(f.market.setSplit(6000, 4001)).to.be.revertedWithCustomError(f.market, "InvalidSplit");
    await expect(f.market.setSplit(7000, 3000)).to.emit(f.market, "SplitUpdated").withArgs(7000, 3000);
    await expect(f.market.connect(f.bob).setSplit(1, 1)).to.be.revertedWithCustomError(f.market, "OwnableUnauthorizedAccount");
  });
});
