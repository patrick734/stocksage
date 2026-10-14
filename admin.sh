#!/usr/bin/env bash
# Owner actions from the dev wallet.
#   ./admin.sh status                    read-only overview
#   ./admin.sh set-fee 0.005 80          agent deployment fee in ETH (paid in $SAGE) and the % burned
#   ./admin.sh set-split 60 30           purchase split: % to the creator, % burned (the treasury gets the rest)
#   ./admin.sh set-treasury 0xADDRESS
#   ./admin.sh pause | unpause
set -euo pipefail
cd "$(dirname "$0")"
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
cd contracts
if [[ "${1:-status}" == "status" ]]; then
  node scripts/admin.js status
else
  SEND=1 node ../tools/with-key.js "$DEPLOYER_ACCOUNT" -- node scripts/admin.js "$@"
fi
