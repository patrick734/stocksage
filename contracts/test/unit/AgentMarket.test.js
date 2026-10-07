const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { DAY, PRICE, BOUNDS, SEEDS, deployAll } = require("./fixtures");

const DEAD = "0x000000000000000000000000000000000000dEaD";
const e = (n) => ethers.parseEther(String(n));
const toTokens = (wei) => (wei * PRICE + e(1) - 1n) / e(1);

describe("Governance at deployment", () => {
  it("refuses an admin that is not a 48h timelock, or roles the deployer holds", async () => {
    const [deployer, admin, guardian, keeper] = await ethers.getSigners();
    const short = await ethers.deployContract("TimelockController", [DAY, [admin.address], [admin.address], ethers.ZeroAddress]);
    const good = await ethers.deployContract("TimelockController", [2 * DAY, [admin.address], [admin.address], ethers.ZeroAddress]);
    const mine = await ethers.deployContract("TimelockController", [2 * DAY, [deployer.address], [admin.address], ethers.ZeroAddress]);
    const O = await ethers.getContractFactory("TokenOracle");
    await expect(O.deploy(admin, guardian, keeper, 600, 1000, DAY)).to.be.revertedWithCustomError(O, "AdminNotTimelock");
    await expect(O.deploy(short, guardian, keeper, 600, 1000, DAY)).to.be.revertedWithCustomError(O, "TimelockDelayTooShort");
    await expect(O.deploy(mine, guardian, keeper, 600, 1000, DAY)).to.be.revertedWithCustomError(O, "DeployerControlsTimelock");
    await expect(O.deploy(good, deployer, keeper, 600, 1000, DAY)).to.be.revertedWithCustomError(O, "RoleCollision");
    await expect(O.deploy(good, guardian, deployer, 600, 1000, DAY)).to.be.revertedWithCustomError(O, "RoleCollision");
    const oracle = await O.deploy(good, guardian, keeper, 600, 1000, DAY);
    const R = await ethers.getContractFactory("AgentRegistry");
    await expect(R.deploy(good, deployer, oracle, good, 0, [])).to.be.revertedWithCustomError(R, "RoleCollision");
    await expect(R.deploy(admin, guardian, oracle, good, 0, [])).to.be.revertedWithCustomError(R, "AdminNotTimelock");
    const registry = await R.deploy(good, guardian, oracle, good, 0, []);
    const M = await ethers.getContractFactory("AgentMarket");
    await expect(M.deploy(good, deployer, registry)).to.be.revertedWithCustomError(M, "RoleCollision");
  });

  it("leaves the deployer with no role anywhere", async () => {
    const { deployer, oracle, registry, market, timelock } = await deployAll();
    for (const c of [oracle, registry, market]) {
      expect(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), deployer)).to.equal(false);
      expect(await c.hasRole(ethers.id("GUARDIAN_ROLE"), deployer)).to.equal(false);
      expect(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), timelock)).to.equal(true);
    }
    expect(await oracle.hasRole(ethers.id("KEEPER_ROLE"), deployer)).to.equal(false);
  });
});

describe("TokenOracle", () => {
  it("has no price until the admin sets one, and the keeper cannot set the first", async () => {
    const { oracle, keeper, tl } = await deployAll({ setPrice: false });
    await expect(oracle.tokenPerEth()).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await expect(oracle.connect(keeper).update(PRICE)).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await oracle.connect(tl).setPrice(PRICE);
    expect(await oracle.tokenPerEth()).to.equal(PRICE);
  });

  it("bounds keeper pushes in size and frequency", async () => {
    const { oracle, keeper, alice } = await deployAll();
    await expect(oracle.connect(alice).update(PRICE)).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    await expect(oracle.connect(keeper).update(PRICE)).to.be.revertedWithCustomError(oracle, "TooSoon");
    await time.increase(BOUNDS.minInterval);
    await expect(oracle.connect(keeper).update((PRICE * 111n) / 100n)).to.be.revertedWithCustomError(oracle, "StepTooLarge");
    await expect(oracle.connect(keeper).update((PRICE * 89n) / 100n)).to.be.revertedWithCustomError(oracle, "StepTooLarge");
    await oracle.connect(keeper).update((PRICE * 110n) / 100n);
    expect(await oracle.tokenPerEth()).to.equal((PRICE * 110n) / 100n);
    await expect(oracle.connect(keeper).update(PRICE)).to.be.revertedWithCustomError(oracle, "TooSoon");
    await expect(oracle.connect(keeper).update(0)).to.be.revertedWithCustomError(oracle, "InvalidPrice");
  });

  it("refuses a stale price, and the guardian can freeze it but only the admin unfreezes", async () => {
    const { oracle, guardian, tl, keeper } = await deployAll();
    await oracle.connect(guardian).freeze();
    await expect(oracle.tokenPerEth()).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await expect(oracle.connect(guardian).unfreeze()).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    await oracle.connect(tl).unfreeze();
    expect(await oracle.tokenPerEth()).to.equal(PRICE);
    await time.increase(DAY + 1);
    expect(await oracle.isFresh()).to.equal(false);
    await expect(oracle.tokenPerEth()).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await oracle.connect(keeper).update(PRICE);
    expect(await oracle.isFresh()).to.equal(true);
  });

  it("keeps bounds within hard limits", async () => {
    const { oracle, tl, keeper } = await deployAll();
    await expect(oracle.connect(tl).setBounds(30, 1000, DAY)).to.be.revertedWithCustomError(oracle, "InvalidConfig");
    await expect(oracle.connect(tl).setBounds(600, 50, DAY)).to.be.revertedWithCustomError(oracle, "InvalidConfig");
    await expect(oracle.connect(tl).setBounds(600, 6000, DAY)).to.be.revertedWithCustomError(oracle, "InvalidConfig");
    await expect(oracle.connect(tl).setBounds(600, 1000, 8 * DAY)).to.be.revertedWithCustomError(oracle, "InvalidConfig");
    await expect(oracle.connect(keeper).setBounds(600, 1000, DAY)).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    await oracle.connect(tl).setBounds(300, 2000, 2 * DAY);
    expect(await oracle.maxStepBps()).to.equal(2000);
  });
});

describe("AgentRegistry", () => {
  it("writes the seed agents in at deployment, owned by the treasury", async () => {
    const { registry, timelock } = await deployAll();
    expect(await registry.agentCount()).to.equal(SEEDS.length);
    const a = await registry.getAgent(1);
    expect(a.creator).to.equal(await timelock.getAddress());
    expect(a.name).to.equal("Sage");
    expect(a.version).to.equal(1);
    expect(a.active).to.equal(true);
    expect((await registry.getAgent(2)).pricePerUseWei).to.equal(e("0.0001"));
    await expect(registry.getAgent(0)).to.be.revertedWithCustomError(registry, "UnknownAgent");
    await expect(registry.getAgent(3)).to.be.revertedWithCustomError(registry, "UnknownAgent");
  });

  it("charges the deployment fee in the token: 80% burned, 20% to the treasury", async () => {
    const { registry, token, bob, timelock } = await deployAll();
    const fee = toTokens(e("0.001"));
    expect(await registry.deploymentFeeToken()).to.equal(fee);
    await token.connect(bob).approve(registry, fee);
    await expect(registry.connect(bob).deployAgent("Vector", "ipfs://v", ethers.id("v"), e("0.00005"), fee - 1n)).to.be.revertedWithCustomError(registry, "FeeAboveMax");
    const supply = await token.totalSupply();
    await expect(registry.connect(bob).deployAgent("Vector", "ipfs://v", ethers.id("v"), e("0.00005"), fee))
      .to.emit(registry, "AgentDeployed")
      .withArgs(3, bob.address, "Vector", e("0.00005"), ethers.id("v"), "ipfs://v", fee, (fee * 8000n) / 10000n);
    expect(supply - (await token.totalSupply())).to.equal((fee * 8000n) / 10000n);
    expect(await token.balanceOf(timelock)).to.equal(fee - (fee * 8000n) / 10000n);
    expect(await token.balanceOf(registry)).to.equal(0);
    expect(await registry.totalBurned()).to.equal((fee * 8000n) / 10000n);
    expect((await registry.getAgent(3)).creator).to.equal(bob.address);
  });

  it("needs the token and a fresh price when there is a fee, and neither when the fee is zero", async () => {
    const { registry, bob, tl, oracle } = await deployAll({ setToken: false, setPrice: false });
    await expect(registry.connect(bob).deployAgent("A", "", ethers.ZeroHash, 0, e(1))).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await oracle.connect(tl).setPrice(PRICE);
    await expect(registry.connect(bob).deployAgent("A", "", ethers.ZeroHash, 0, e(10000))).to.be.revertedWithCustomError(registry, "TokenUnset");
    await registry.connect(tl).setDeploymentFee(0);
    await registry.connect(bob).deployAgent("A", "", ethers.ZeroHash, 0, 0);
    expect(await registry.agentCount()).to.equal(SEEDS.length + 1);
  });

  it("checks names, URIs and prices", async () => {
    const { registry, tl, bob } = await deployAll();
    await registry.connect(tl).setDeploymentFee(0);
    await expect(registry.connect(bob).deployAgent("", "", ethers.ZeroHash, 0, 0)).to.be.revertedWithCustomError(registry, "BadName");
    await expect(registry.connect(bob).deployAgent("x".repeat(65), "", ethers.ZeroHash, 0, 0)).to.be.revertedWithCustomError(registry, "BadName");
    await expect(registry.connect(bob).deployAgent("A", "u".repeat(513), ethers.ZeroHash, 0, 0)).to.be.revertedWithCustomError(registry, "BadURI");
    await expect(registry.connect(bob).deployAgent("A", "", ethers.ZeroHash, e("1.01"), 0)).to.be.revertedWithCustomError(registry, "PriceTooHigh");
    await expect(registry.connect(tl).setDeploymentFee(e("1.01"))).to.be.revertedWithCustomError(registry, "InvalidConfig");
  });

  it("lets only the creator update, reprice or switch off an agent", async () => {
    const { registry, tl, bob, carol } = await deployAll();
    await registry.connect(tl).setDeploymentFee(0);
    await registry.connect(bob).deployAgent("A", "u1", ethers.id("1"), 0, 0);
    await expect(registry.connect(carol).updateAgent(3, ethers.id("2"), "u2")).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(registry.connect(carol).setPrice(3, 1)).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(registry.connect(carol).setActive(3, false)).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(registry.connect(bob).updateAgent(3, ethers.id("2"), "u2")).to.emit(registry, "AgentUpdated").withArgs(3, 2, ethers.id("2"), "u2");
    await registry.connect(bob).setPrice(3, e("0.0002"));
    await registry.connect(bob).setActive(3, false);
    const a = await registry.getAgent(3);
    expect([a.version, a.configHash, a.metadataURI, a.pricePerUseWei, a.active]).to.deep.equal([2n, ethers.id("2"), "u2", e("0.0002"), false]);
    expect(await registry.isPurchasable(3)).to.equal(false);
    await expect(registry.connect(bob).setPrice(3, e(2))).to.be.revertedWithCustomError(registry, "PriceTooHigh");
    await expect(registry.connect(carol).setName(3, "B")).to.be.revertedWithCustomError(registry, "NotCreator");
    await expect(registry.connect(bob).setName(3, "")).to.be.revertedWithCustomError(registry, "BadName");
    await expect(registry.connect(bob).setName(3, "Renamed")).to.emit(registry, "NameSet").withArgs(3, "Renamed");
    expect((await registry.getAgent(3)).name).to.equal("Renamed");
  });

  it("lets the treasury rename a seed agent, through the timelock", async () => {
    const { registry, tl } = await deployAll();
    await registry.connect(tl).setName(1, "New Brand");
    expect((await registry.getAgent(1)).name).to.equal("New Brand");
  });

  it("sets the token once, by the admin only", async () => {
    const { registry, tl, alice, token } = await deployAll({ setToken: false });
    await expect(registry.connect(alice).setToken(token)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.connect(tl).setToken(alice.address)).to.be.revertedWithCustomError(registry, "InvalidConfig");
    await registry.connect(tl).setToken(token);
    await expect(registry.connect(tl).setToken(token)).to.be.revertedWithCustomError(registry, "TokenAlreadySet");
  });

  it("guardian blocks and pauses; only the admin undoes it", async () => {
    const { registry, guardian, tl, bob } = await deployAll();
    await registry.connect(guardian).blockAgent(2);
    expect(await registry.isPurchasable(2)).to.equal(false);
    await expect(registry.connect(guardian).unblockAgent(2)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await registry.connect(tl).unblockAgent(2);
    expect(await registry.isPurchasable(2)).to.equal(true);
    await expect(registry.connect(guardian).blockAgent(9)).to.be.revertedWithCustomError(registry, "UnknownAgent");
    await registry.connect(guardian).pause();
    await expect(registry.connect(bob).deployAgent("A", "", ethers.ZeroHash, 0, e(1))).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await expect(registry.connect(guardian).unpause()).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await registry.connect(tl).unpause();
  });
});

describe("AgentMarket", () => {
  it("splits every payment 60% creator, 30% burned, 10% treasury, in the same transaction", async () => {
    const { registry, market, token, tl, bob, carol, timelock } = await deployAll();
    await registry.connect(tl).setDeploymentFee(0);
    await registry.connect(bob).deployAgent("Vector", "", ethers.ZeroHash, e("0.00005"), 0);
    const cost = toTokens(e("0.00005") * 7n);
    expect(await market.quoteUses(3, 7)).to.equal(cost);
    await token.connect(carol).approve(market, cost);
    await expect(market.connect(carol).purchaseUses(3, 7, cost - 1n)).to.be.revertedWithCustomError(market, "CostAboveMax");
    const [bob0, tl0, supply0] = [await token.balanceOf(bob), await token.balanceOf(timelock), await token.totalSupply()];
    const burned = (cost * 3000n) / 10000n;
    const toTreasury = cost / 10n;
    const toCreator = cost - burned - toTreasury;
    await expect(market.connect(carol).purchaseUses(3, 7, cost)).to.emit(market, "UsesPurchased").withArgs(carol.address, 3, 7, cost, toCreator, burned, toTreasury);
    expect((await token.balanceOf(bob)) - bob0).to.equal(toCreator);
    expect((await token.balanceOf(timelock)) - tl0).to.equal(toTreasury);
    expect(supply0 - (await token.totalSupply())).to.equal(burned);
    expect(await token.balanceOf(market)).to.equal(0);
    expect(await market.usesPurchased(carol, 3)).to.equal(7);
    expect(await market.agentUsesSold(3)).to.equal(7);
    expect(await market.agentCreatorEarned(3)).to.equal(toCreator);
    expect(await market.agentBurned(3)).to.equal(burned);
    expect(await market.totalBurned()).to.equal(burned);
  });

  it("records free uses with no transfer", async () => {
    const { market, token, carol } = await deployAll();
    const before = await token.balanceOf(carol);
    await market.connect(carol).purchaseUses(1, 5, 0);
    expect(await market.usesPurchased(carol, 1)).to.equal(5);
    expect(await token.balanceOf(carol)).to.equal(before);
  });

  it("burns by sending to the dead address when the token has no burn()", async () => {
    const { market, token, carol } = await deployAll({ plainToken: true });
    const cost = await market.quoteUses(2, 3);
    await token.connect(carol).approve(market, cost);
    await market.connect(carol).purchaseUses(2, 3, cost);
    expect(await token.balanceOf(DEAD)).to.equal((cost * 3000n) / 10000n);
    expect(await token.balanceOf(market)).to.equal(0);
  });

  it("refuses agents not for sale, bad amounts, stale prices and a pause", async () => {
    const { market, registry, guardian, tl, carol, oracle, token } = await deployAll();
    await token.connect(carol).approve(market, e(1000000));
    await expect(market.connect(carol).purchaseUses(9, 1, e(1))).to.be.revertedWithCustomError(market, "NotForSale");
    await registry.connect(guardian).blockAgent(2);
    await expect(market.connect(carol).purchaseUses(2, 1, e(1000))).to.be.revertedWithCustomError(market, "NotForSale");
    await registry.connect(tl).unblockAgent(2);
    await expect(market.connect(carol).purchaseUses(2, 0, e(1000))).to.be.revertedWithCustomError(market, "BadUses");
    await expect(market.connect(carol).purchaseUses(2, 10001, e(1000000))).to.be.revertedWithCustomError(market, "BadUses");
    await time.increase(DAY + 1);
    await expect(market.connect(carol).purchaseUses(2, 1, e(1000))).to.be.revertedWithCustomError(oracle, "PriceUnavailable");
    await oracle.connect(tl).setPrice(PRICE);
    await market.connect(guardian).pause();
    await expect(market.connect(carol).purchaseUses(2, 1, e(1000))).to.be.revertedWithCustomError(market, "EnforcedPause");
    await market.connect(tl).unpause();
    await market.connect(carol).purchaseUses(2, 1, e(1000));
  });

  it("has no function that moves anyone's tokens except the buyer's own purchase", async () => {
    const { market, registry } = await deployAll();
    for (const c of [market, registry]) {
      const names = c.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names.filter((n) => /withdraw|sweep|rescue|transfer/i.test(n))).to.deep.equal([]);
    }
  });
});
