#!/usr/bin/env bash
# Publishes every StockSage contract's source on the explorer (Sourcify) and checks the deployment on-chain.
# No key, no gas. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")"
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
cd contracts
npx hardhat run scripts/verify.js --network robinhood
