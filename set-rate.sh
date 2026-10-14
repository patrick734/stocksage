#!/usr/bin/env bash
# Sets how much $SAGE one ETH buys, which prices every agent and the deployment fee. Sends from the dev wallet.
#   ./set-rate.sh pool          use the Pons pool's current price
#   ./set-rate.sh 1000000       set it by hand ($SAGE per ETH)
set -euo pipefail
cd "$(dirname "$0")"
[[ -n "${1:-}" ]] || { echo "usage: ./set-rate.sh pool | ./set-rate.sh <SAGE per ETH>" >&2; exit 1; }
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
cd contracts
SEND=1 node ../tools/with-key.js "$DEPLOYER_ACCOUNT" -- node scripts/admin.js set-rate "$1"
