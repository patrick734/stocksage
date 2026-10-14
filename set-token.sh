#!/usr/bin/env bash
# After launching $SAGE on Pons: sets it (once) in AgentRegistry and AgentMarket and sets the rate from its Pons pool. Sends from the
# dev wallet (the owner).
#   ./set-token.sh 0xTOKEN
set -euo pipefail
cd "$(dirname "$0")"
[[ "${1:-}" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "usage: ./set-token.sh <\$SAGE token address>" >&2; exit 1; }
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
[[ -n "${DEPLOYER_ACCOUNT:-}" ]] || { echo "STOPPED: DEPLOYER_ACCOUNT is not set in launch.env" >&2; exit 1; }
cd contracts
SEND=1 node ../tools/with-key.js "$DEPLOYER_ACCOUNT" -- node scripts/admin.js set-token "$1"
node scripts/export-abis.js
echo "Next: git add -A && git commit -m \"Plug in SAGE\" && git push"
