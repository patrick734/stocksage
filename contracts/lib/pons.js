// Spot price of a Pons pool (native ETH / token) on the Uniswap v4 PoolManager, read with extsload.
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");

const POOLS_SLOT = 6n; // Uniswap v4 StateLibrary

function poolId(token) {
  const key = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [ethers.ZeroAddress, token, config.pons.poolFee, config.pons.poolTickSpacing, config.pons.hook]
  );
  return ethers.keccak256(key);
}

/** Token wei per 1 ETH at the pool's current price, or null when the pool does not exist. */
async function tokenPerEth(provider, token) {
  const pm = new ethers.Contract(config.uniswap.poolManager, ["function extsload(bytes32) view returns (bytes32)"], provider);
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [poolId(token), POOLS_SLOT]));
  const word = BigInt(await pm.extsload(slot));
  const sqrtPriceX96 = word & ((1n << 160n) - 1n);
  if (sqrtPriceX96 === 0n) return null;
  return (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) >> 192n;
}

module.exports = { poolId, tokenPerEth };
