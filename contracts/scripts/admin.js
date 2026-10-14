// Owner actions, sent straight from the owner wallet (the dev wallet that deployed). Read-only without SEND=1.
//   node scripts/admin.js status
//   node scripts/admin.js set-token <address>        set $SAGE (once) in the registry and the market, and the rate from its Pons pool
//   node scripts/admin.js set-rate pool              set the rate to the Pons pool's current price
//   node scripts/admin.js set-rate <SAGE per ETH>    set the rate by hand, e.g. 1000000
//   node scripts/admin.js set-fee <eth> [burn %]     agent deployment fee (paid in $SAGE) and its burned share (default 80)
//   node scripts/admin.js set-split <creator %> <burn %>   purchase split; the treasury gets the rest
//   node scripts/admin.js set-treasury <address>
//   node scripts/admin.js pause | unpause            stop or resume new agents and purchases
// SEND=1 and DEPLOYER_PRIVATE_KEY (set by tools/with-key.js) send the transactions.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const pons = require("../lib/pons");

const RPC = process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
const FILE = process.env.DEPLOYMENT || path.join(__dirname, "..", "deployments", "robinhood.json");
const SEND = process.env.SEND === "1";
const abi = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "abis", `${name}.json`), "utf8"));
const bps = (pct) => {
  if (!/^\d+(\.\d+)?$/.test(String(pct))) throw new Error(`not a percentage: ${pct}`);
  return Math.round(Number(pct) * 100);
};

async function main() {
  const [cmd, arg, arg2] = process.argv.slice(2);
  if (!fs.existsSync(FILE)) throw new Error(`No deployment at ${FILE}: deploy first (./launch.sh)`);
  const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: false });
  const signer = SEND ? new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider) : null;
  const runner = signer || provider;
  const registry = new ethers.Contract(d.registry, abi("AgentRegistry"), runner);
  const market = new ethers.Contract(d.market, abi("AgentMarket"), runner);
  const oracle = new ethers.Contract(d.oracle, abi("SageOracle"), runner);

  if (signer && (await registry.owner()).toLowerCase() !== signer.address.toLowerCase()) throw new Error(`${signer.address} is not the owner`);
  const send = async (label, fn) => {
    if (!SEND) return console.log(`would send: ${label} (run the .sh script to send)`);
    const tx = await fn();
    console.log(`${label}: ${tx.hash}`);
    await tx.wait();
    console.log("  confirmed");
  };

  if (cmd === "status" || !cmd) {
    const [sageR, sageM, fee, burnFee, treasury, rate, rp, mp, burned, count, cBps, bBps] = await Promise.all([
      registry.sage(), market.sage(), registry.deploymentFeeWei(), registry.deploymentBurnBps(), registry.treasury(), oracle.sagePerEth(),
      registry.paused(), market.paused(), market.totalBurned(), registry.agentCount(), market.creatorBps(), market.burnBps(),
    ]);
    console.log(`owner      ${await registry.owner()}`);
    console.log(`$SAGE      registry ${sageR === ethers.ZeroAddress ? "not set" : sageR}, market ${sageM === ethers.ZeroAddress ? "not set" : sageM}`);
    console.log(`rate       1 ETH = ${ethers.formatEther(rate)} $SAGE`);
    if (sageR !== ethers.ZeroAddress) {
      const p = await pons.tokenPerEth(provider, sageR).catch(() => null);
      console.log(`pool       ${p ? `1 ETH = ${ethers.formatEther(p)} $SAGE on Pons` : "no Pons pool price"}`);
    }
    console.log(`fee        ${ethers.formatEther(fee)} ETH per new agent, ${Number(burnFee) / 100}% burned`);
    console.log(`split      ${Number(cBps) / 100}% creator, ${Number(bBps) / 100}% burned, ${(10000 - Number(cBps) - Number(bBps)) / 100}% treasury`);
    console.log(`treasury   ${treasury}`);
    console.log(`paused     registry ${rp}, market ${mp}`);
    console.log(`agents     ${count}; burned by purchases ${ethers.formatEther(burned)} $SAGE`);
    return;
  }

  if (cmd === "set-token") {
    if (!ethers.isAddress(arg)) throw new Error("usage: set-token <$SAGE address>");
    const t = new ethers.Contract(arg, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], provider);
    const [sym, dec] = await Promise.all([t.symbol(), t.decimals()]);
    if (dec !== 18n) throw new Error(`token has ${dec} decimals, expected 18`);
    console.log(`token ${arg} (${sym})`);
    for (const [n, c] of [["registry", registry], ["market", market]]) {
      const cur = await c.sage();
      if (cur === ethers.ZeroAddress) await send(`${n}.setSage(${arg})`, () => c.setSage(arg));
      else console.log(`${n}: $SAGE already set to ${cur}`);
    }
    const p = await pons.tokenPerEth(provider, arg);
    if (!p) return console.log("No Pons pool price yet: set the rate later with ./set-rate.sh pool");
    console.log(`Pons pool: 1 ETH = ${ethers.formatEther(p)} ${sym}`);
    return send(`setRate(${ethers.formatEther(p)} per ETH)`, () => oracle.setRate(p));
  }

  if (cmd === "set-rate") {
    let rate;
    if (arg === "pool") {
      const token = await registry.sage();
      if (token === ethers.ZeroAddress) throw new Error("$SAGE is not set yet: ./set-token.sh first");
      rate = await pons.tokenPerEth(provider, token);
      if (!rate) throw new Error("no Pons pool price for $SAGE");
    } else {
      if (!arg || !/^\d+(\.\d+)?$/.test(arg)) throw new Error("usage: set-rate pool | set-rate <SAGE per ETH>");
      rate = ethers.parseEther(arg);
    }
    console.log(`rate now ${ethers.formatEther(await oracle.sagePerEth())}, new ${ethers.formatEther(rate)} $SAGE per ETH`);
    return send(`setRate(${ethers.formatEther(rate)})`, () => oracle.setRate(rate));
  }

  if (cmd === "set-fee") {
    if (!arg) throw new Error("usage: set-fee <eth> [burn %]");
    const burn = arg2 === undefined ? await registry.deploymentBurnBps() : bps(arg2);
    return send(`setDeploymentFee(${arg} ETH, ${Number(burn) / 100}% burned)`, () => registry.setDeploymentFee(ethers.parseEther(arg), burn));
  }

  if (cmd === "set-split") {
    if (arg === undefined || arg2 === undefined) throw new Error("usage: set-split <creator %> <burn %>");
    const [c, b] = [bps(arg), bps(arg2)];
    if (c + b > 10000) throw new Error("creator + burn is over 100%");
    return send(`setSplit(${c / 100}% creator, ${b / 100}% burned, ${(10000 - c - b) / 100}% treasury)`, () => market.setSplit(c, b));
  }

  if (cmd === "set-treasury") {
    if (!ethers.isAddress(arg)) throw new Error("usage: set-treasury <address>");
    await send(`registry.setTreasury(${arg})`, () => registry.setTreasury(arg));
    return send(`market.setTreasury(${arg})`, () => market.setTreasury(arg));
  }

  if (cmd === "pause" || cmd === "unpause") {
    await send(`registry.${cmd}()`, () => registry[cmd]());
    return send(`market.${cmd}()`, () => market[cmd]());
  }

  throw new Error(`unknown command ${cmd}`);
}

main().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exit(1);
});
