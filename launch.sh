#!/usr/bin/env bash
# StockSage launch.
#   ./launch.sh --rehearsal   full deploy on a local copy of Robinhood Chain: free, sends nothing
#   ./launch.sh               real deploy from the dev wallet named in launch.env
# Settings come from launch.env (copy launch.env.example). Keys never go in that file: the dev wallet is a
# password-encrypted keystore made with `node tools/import-key.js <name>`.
set -euo pipefail
cd "$(dirname "$0")"

step() { printf '\n== %s\n' "$1"; }
stop() { printf 'STOPPED: %s\n' "$1" >&2; exit 1; }

REHEARSAL=0
[[ "${1:-}" == "--rehearsal" ]] && REHEARSAL=1

command -v node >/dev/null || stop "Node.js is not installed. Get version 22 from https://nodejs.org"
[[ -f launch.env ]] || stop "launch.env is missing. Run: cp launch.env.example launch.env, then fill it in."

step "Settings"
[[ -d contracts/node_modules ]] || (cd contracts && npm ci --no-audit --no-fund)
eval "$(node tools/env.js)"
[[ -n "${DEPLOYER_ACCOUNT:-}" ]] || stop "DEPLOYER_ACCOUNT is not set in launch.env"
DEPLOYER_ADDRESS=$(node tools/wallet.js address "$DEPLOYER_ACCOUNT")
export DEPLOYER_ADDRESS TREASURY_ADDRESS
echo "Dev wallet: $DEPLOYER_ADDRESS ($DEPLOYER_ACCOUNT) deploys and owns the contracts"
echo "Treasury:   ${TREASURY_ADDRESS:-$DEPLOYER_ADDRESS}"
echo "\$SAGE:      set after the Pons launch with ./set-token.sh"

if [[ $REHEARSAL == 0 && -f contracts/deployments/robinhood.json && "${FORCE:-}" != "1" ]]; then
  stop "contracts/deployments/robinhood.json exists, so StockSage is already deployed. Use FORCE=1 only for a second, separate deployment."
fi

cd contracts
step "Compiling"
npx hardhat compile --quiet

step "Preflight checks"
[[ $REHEARSAL == 1 ]] && export MIN_DEPLOYER_ETH=0
node scripts/preflight.js || stop "Preflight failed. Fix the FAIL lines above and run again."

if [[ $REHEARSAL == 1 ]]; then
  step "Rehearsal deploy on a local copy of Robinhood Chain"
  rm -f deployments/fork.json
  if ! FORK=1 DEPLOY_LIVE=1 npx hardhat run scripts/deploy.js; then
    rm -f deployments/fork.json
    stop "The rehearsal failed (see above). A dropped connection shows up here too: set ROBINHOOD_RPC_URL to a private RPC and run again."
  fi
  rm -f deployments/fork.json deployments/hardhat.json
  printf '\nREHEARSAL PASSED. Nothing was sent. Deploy for real with: ./launch.sh\n'
  exit 0
fi

step "Real deploy"
echo "This deploys StockSage to Robinhood Chain mainnet, paying gas from $DEPLOYER_ADDRESS."
read -r -p "Type DEPLOY to continue: " answer </dev/tty
[[ "$answer" == "DEPLOY" ]] || stop "Cancelled. Nothing was sent."
if ! node ../tools/with-key.js "$DEPLOYER_ACCOUNT" -- npx hardhat run scripts/deploy.js --network robinhood; then
  if [[ -f deployments/robinhood.json ]]; then
    node scripts/export-abis.js
    stop "StockSage IS deployed (deployments/robinhood.json); only the checks after it failed. Do not deploy again: run ./verify.sh."
  fi
  stop "The deploy did not finish (see above). Fix the cause and run ./launch.sh again."
fi

step "Publishing addresses to the app"
node scripts/export-abis.js

step "Publishing source on the explorer (Sourcify)"
sleep 15
npx hardhat run scripts/verify.js --network robinhood || echo "Not everything is verified yet: run ./verify.sh in a few minutes."

step "Deployed"
cat <<'EOT'
Addresses: contracts/deployments/robinhood.json

Next:
  1. git add -A && git commit -m "Mainnet deployment" && git push
  2. Vercel: import the repo, Root Directory "app", add Upstash Redis and the variables in docs/LAUNCH.md
  3. Launch $SAGE on Pons from the dev wallet (./launch-token.sh or ponsfamily.com), then: ./set-token.sh <token address>
EOT
