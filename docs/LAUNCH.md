# Launching StockSage

Run everything from the repo folder on your Mac. Keys never go in chat or in files: each wallet is a
password-encrypted keystore in `~/.stocksage/keystores`, and the keeper key lives only in GitHub secrets.

## 1. Wallets

| Role | What it can do | What to use |
|---|---|---|
| Dev wallet | Deploys, then holds nothing. Launches $SAGE on Pons. | Your own MetaMask wallet |
| Admin | Proposes changes to the 48h timelock | A second MetaMask wallet (or a Safe) |
| Guardian | Pause, freeze the price, block an agent | A third MetaMask wallet (or a Safe) |
| Keeper | Pushes the $SAGE price, bounded | Created for you, key stored only in GitHub |

```
git clone https://github.com/patrick734/stocksage.git ~/stocksage && cd ~/stocksage
```
```
cd contracts && npm ci && cd ..
```
```
node tools/import-key.js stocksage-dev
```
```
node tools/import-key.js stocksage-admin
```
```
cp -n launch.env.example launch.env
```
```
node tools/wallet.js keeper-secret
```
```
open -e launch.env
```

In `launch.env` set `ADMIN_MULTISIG` (admin address), `GUARDIAN_MULTISIG` (guardian address),
`ALLOW_PLAIN_WALLETS=1` and `ADMIN_ACCOUNT=stocksage-admin`. `KEEPER_ADDRESS` is already filled in.

Send the dev wallet about 0.005 ETH on Robinhood Chain for deploy gas, plus what you want for the Pons launch.
Send the keeper 0.005 ETH for gas.

## 2. Deploy the contracts

```
./launch.sh --rehearsal
```
```
./launch.sh
```
```
./verify.sh
```
```
git add -A && git commit -m "Mainnet deployment" && git push
```

## 3. Put the site live on Vercel

1. vercel.com > Add New > Project > import `patrick734/stocksage`, Root Directory `app`.
2. Storage (or Marketplace) > Upstash > Redis > create and connect it to the project. It adds the Redis variables.
3. Pick the AI that runs the agents. **Free option (no card):** create a free API key with one provider:
   - Google Gemini: aistudio.google.com > Get API key. Base URL `https://generativelanguage.googleapis.com/v1beta/openai`
   - Groq: console.groq.com > API Keys. Base URL `https://api.groq.com/openai/v1`
   - OpenRouter: openrouter.ai > Keys. Base URL `https://openrouter.ai/api/v1` (free models end in `:free`)

   Copy a model name from that provider's model list. Free tiers have daily limits; check them when you sign up.
4. Settings > Environment Variables, add:
   - `LLM_BASE_URL`: the base URL above
   - `LLM_API_KEY`: your key from that provider
   - `AGENT_MODEL`: the model name
   - `SESSION_SECRET`: output of `openssl rand -hex 32`
   - `NEXT_PUBLIC_SITE_URL`: `https://stocksage.fun` (your domain)
   - `NEXT_PUBLIC_X_URL`: your X profile link

   To use Claude instead (paid, adds web search): leave `LLM_BASE_URL` empty and set `ANTHROPIC_API_KEY`.
5. Deploy, then Settings > Domains > add your domain.

With a free provider, keep the free daily caps modest (`FREE_GLOBAL_PER_DAY`, default 500) so busy days don't hit the
provider's limit. When a provider is rate-limited, the reply fails and the user's use is not charged.

## 4. Launch $SAGE on Pons

From the dev wallet, on ponsfamily.com/launchpad, or from here:

```
./launch-token.sh
```
```
./launch-token.sh --launch
```

## 5. Hand $SAGE to the contracts (48h timelock)

```
./set-token.sh 0xTOKEN --schedule
```

48 hours later:

```
./set-token.sh 0xTOKEN --execute
```

This sets $SAGE once and gives the oracle its first price, read from the Pons pool when scheduled. Check with
`./govern.sh status`. Then in GitHub: Settings > Secrets and variables > Actions > Variables > `KEEPER_LIVE` = `1`,
and Actions > Keeper > Run workflow. From then on the keeper keeps the price current every 15 minutes.

## Other timelock actions

```
./govern.sh set-price 25000000 --schedule
```
```
./govern.sh set-deploy-fee 0.002 --schedule
```

Run the same command with `--execute` after 48 hours.
