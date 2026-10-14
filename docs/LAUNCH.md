# Launching StockSage

Run everything from the repo folder on your Mac. Keys never go in chat or in files: the dev wallet is a
password-encrypted keystore in `~/.stocksage/keystores`.

| Role | Who | Power |
|---|---|---|
| Dev wallet (owner) | a new MetaMask account, keystore `stocksage-dev2` | deploys and owns all three contracts: sets the $SAGE rate, the fees, the splits and the treasury, can pause |
| Treasury | the dev wallet, or `TREASURY_ADDRESS` | receives the treasury share of purchases and deployment fees |

The first StockSage contracts (timelock model) stay on-chain untouched; their record is
`contracts/deployments/v1-robinhood.json`. The site switches to the new contracts once they are deployed.

## 1. Code and the new dev wallet

Create a new account in MetaMask, copy its private key, then:

```
cd ~/stocksage && git pull
```
```
(cd contracts && npm ci) && (cd app && npm ci) && (cd launch && npm ci)
```
```
node tools/import-key.js stocksage-dev2
```
```
cp launch.env.example launch.env
```
```
open -e launch.env
```

`import-key.js` reads the key from the clipboard, clears the clipboard and saves an encrypted keystore. In
`launch.env`, `DEPLOYER_ACCOUNT=stocksage-dev2` is already set. Optional: `TREASURY_ADDRESS` for a separate treasury.

## 2. Fund

Send the new dev wallet about 0.01 ETH on Robinhood Chain (deploy, the five seed agents, set-token).

## 3. Rehearse (free), then deploy

```
./launch.sh --rehearsal
```
```
./launch.sh
```

This deploys SageOracle, AgentRegistry and AgentMarket, deploys the five seed agents from the dev wallet (free,
because $SAGE is not set yet), writes the addresses into the app and publishes the source on the explorer.

## 4. Publish

```
git add -A && git commit -m "Mainnet deployment" && git push
```
```
./verify.sh
```

Vercel rebuilds the site from the push.

## 5. $SAGE

Either keep the $SAGE already trading, or launch a new one from the new dev wallet:

```
./launch-token.sh
```
```
./launch-token.sh --launch
```

Then hand it to both contracts and take the first rate from its Pons pool:

```
./set-token.sh 0xTOKEN
```
```
git add -A && git commit -m "Plug in SAGE" && git push
```

## Owner actions

```
./admin.sh status
```
```
./set-rate.sh pool
```
```
./admin.sh set-fee 0.005 80
```
```
./admin.sh set-split 60 30
```
```
./admin.sh pause
```

The rate is set by hand: run `./set-rate.sh pool` when the $SAGE price moves. Every buyer and creator signs a
maximum cost, so a rate change never charges more than they approved.
