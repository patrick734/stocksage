#!/usr/bin/env bash
# Timelock actions (read-only unless --schedule/--execute is given).
#   ./govern.sh status                           what is scheduled, ready or executed
#   ./govern.sh set-price 25000000               reset the oracle price ($SAGE per 1 ETH), without the keeper's step limit
#   ./govern.sh set-deploy-fee 0.002             change the agent deployment fee (ETH, paid in $SAGE; launch value 0.001)
#   add --schedule (now) or --execute (after 48 hours) to send it from a plain-wallet admin (ADMIN_ACCOUNT)
set -euo pipefail
cd "$(dirname "$0")"
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
CMD="${1:-status}"
ARG=""
if [[ "$CMD" == "set-price" || "$CMD" == "set-deploy-fee" ]]; then ARG="${2:-}"; MODE="${3:-}"; else MODE="${2:-}"; fi
cd contracts
if [[ "$MODE" == "--schedule" || "$MODE" == "--execute" ]]; then
  [[ -n "${ADMIN_ACCOUNT:-}" ]] || { echo "STOPPED: set ADMIN_ACCOUNT in launch.env to the admin wallet's name (node tools/import-key.js <name>)" >&2; exit 1; }
  GOVERN_SEND="${MODE#--}" KEY_ENV=ADMIN_PRIVATE_KEY node ../tools/with-key.js "$ADMIN_ACCOUNT" -- node scripts/govern.js "$CMD" $ARG
else
  node scripts/govern.js "$CMD" $ARG
fi
