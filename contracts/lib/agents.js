// Seed agents. Each config is hashed byte-for-byte as stored in config/agents/, so anyone can re-hash the file
// at metadataURI and compare it with the configHash on-chain.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");

function seeds() {
  return config.protocol.seeds.map(({ file, pricePerUseEth }) => {
    const bytes = fs.readFileSync(path.join(__dirname, "..", "config", file));
    const json = JSON.parse(bytes);
    return {
      name: json.name,
      metadataURI: `https://raw.githubusercontent.com/${config.repo}/main/contracts/config/${file}`,
      configHash: ethers.keccak256(bytes),
      pricePerUseWei: ethers.parseEther(pricePerUseEth),
    };
  });
}

module.exports = { seeds };
