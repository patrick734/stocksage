# StockSage

An open market for AI agents on Robinhood Chain, paid in **$SAGE**.

1. **Creators deploy agents.** An agent is a purpose, a personality and instructions. On-chain it is its creator,
   its price per use (set in ETH) and the hash of its configuration. Deploying costs a fee in $SAGE (0.005 ETH worth
   at launch): **80% burned**, 20% to the treasury.
2. **Users pay per use** in $SAGE, at the creator's ETH price converted at the oracle rate. One use is one reply.
3. **Every payment is split on-chain, in the same transaction: 60% to the creator, 30% burned, 10% to the
   treasury.**

Sage, the flagship agent, is free for a few messages a day.

## Layout

```
contracts/   SageOracle, AgentRegistry, AgentMarket (Hardhat, 11 unit tests)
app/         Next.js site and backend: marketplace, agent chat, create, dashboard, activity, safety
launch/      Launches $SAGE on the Pons launchpad from the dev wallet
tools/       Encrypted wallet keystores, launch.env loader
brand/       X profile photo and banner
abis/        ABIs and, after deploying, the mainnet addresses (abis/v1: the first contracts)
```

## Contracts

| Contract | What it does | Who controls what |
|---|---|---|
| `AgentRegistry` | Agents: `deployAgent`, `updateAgent`, `setPrice`, `setActive`, `getAgent`, `agentsOf`, `quoteSage` | Only an agent's creator changes it. The owner sets $SAGE once, the deployment fee and its burn share, the oracle and the treasury, and can pause. Before $SAGE is set only the owner deploys agents, for free. |
| `AgentMarket` | `purchaseUses(agentId, uses, maxSageCost)`, `quoteUses`, `usesPurchased(buyer, agentId)`, per-agent sold / earned / burned | The owner sets $SAGE once, the split (`setSplit`), the oracle and the treasury, and can pause. No function moves anyone's funds. |
| `SageOracle` | `sagePerEth()`: $SAGE per 1 ETH | The owner sets it with `setRate`. |

- One owner wallet (the dev wallet, two-step transfer) runs all three. Changes apply at once; buyers and creators
  sign a maximum cost, so a rate change cannot overcharge them. `./verify.sh` checks the wiring on-chain.
- Burns go to `0x…dEaD`. Every payment goes straight from the payer to the creator, the burn address and the treasury.
- Each agent's configuration is served at its `metadataURI`; its keccak256 is the on-chain `configHash`. The app
  re-hashes it in the browser ("Verify").

## Backend

The app's API routes run the agents:

- **Sign-in:** the wallet signs a one-time message (no transaction); the server sets an httpOnly session cookie.
- **Metering:** one reply is one use. Paid agents: uses bought on-chain minus uses served. Agents priced below
  `MIN_PAID_PRICE_WEI` (Sage among them) use a free daily quota per wallet and overall. A reply that fails or is
  declined before any text is not charged.
- **Agents** run on any OpenAI-compatible provider (Gemini, Groq, OpenRouter and others, several with free tiers) or on
  Claude through the Anthropic API with web search, chosen in the environment. StockSage's rules come first in every
  prompt (information, not investment advice; never asks for keys).
- **Storage:** Upstash Redis for configs, nonces and use counters.

## Launch

Exact commands: **[docs/LAUNCH.md](docs/LAUNCH.md)**. Trust model: **[docs/SECURITY.md](docs/SECURITY.md)**.

## Development

```
cd contracts && npm ci && npm test
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost && node scripts/export-abis.js
cd ../app && npm ci && cp .env.example .env.local
NEXT_PUBLIC_ENABLE_LOCAL=1 npm run dev
npm run e2e -- http://localhost:3000
```

If `binaries.soliditylang.org` is unreachable, set `LOCAL_SOLC` to a native solc 0.8.28 binary, or install
`solc@0.8.28` from npm and set `SOLCJS_PATH` to its `soljson.js`.

## License

MIT.
