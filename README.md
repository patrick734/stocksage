# StockSage

An open market for AI agents on Robinhood Chain, paid in **$SAGE**.

1. **Creators deploy agents.** An agent is a purpose, a personality and instructions. On-chain it is its creator,
   its price per use (set in ETH) and the hash of its configuration. Deploying costs a fee in $SAGE (0.001 ETH worth
   at launch): **80% burned**, 20% to the treasury.
2. **Users pay per use** in $SAGE, at the creator's ETH price converted at the oracle price. One use is one reply.
3. **Every payment is split on-chain, in the same transaction: 60% to the creator, 30% burned, 10% to the
   treasury.** The split is a constant in the contract.

Sage, the flagship agent, is free for a few messages a day.

## Layout

```
contracts/   AgentRegistry, AgentMarket, TokenOracle + 48h timelock (Hardhat, 19 unit tests)
app/         Next.js site and backend: marketplace, agent chat, create, dashboard, activity, safety
keeper/      Pushes the $SAGE price to TokenOracle from the Pons pool (GitHub Actions, every 15 min)
launch/      Launches $SAGE on the Pons launchpad from the dev wallet
tools/       Encrypted wallet keystores, keeper secret, launch.env loader
brand/       X profile photo and banner
abis/        ABIs and, after deploying, the mainnet addresses
```

## Contracts

| Contract | What it does | Who controls what |
|---|---|---|
| `AgentRegistry` | Agents: `deployAgent`, `updateAgent`, `setPrice`, `setActive`, `setName`, `getAgent`, `quoteToken` | Only an agent's creator changes it. The timelock sets $SAGE once and the deploy fee (cap 1 ETH). The guardian can pause deploys and block an agent from sale. |
| `AgentMarket` | `purchaseUses(agentId, uses, maxTokenCost)`, `usesPurchased(user, agentId)`, per-agent sold / earned / burned | The guardian can pause sales; only the timelock unpauses. No function moves anyone's funds. |
| `TokenOracle` | `tokenPerEth()`: $SAGE per 1 ETH | The keeper pushes the price, at most 10% per push, once per 10 minutes. Older than 24h means no sales. The guardian can freeze it; the timelock sets the first price. |
| `TimelockController` | Admin of everything, and the treasury | OpenZeppelin, 48h delay. |

- Every contract checks in its constructor that its admin is a 48h timelock the deployer cannot use. All settings
  are constructor arguments, so the dev wallet that deploys never holds a role. `./verify.sh` proves it on-chain.
- The oracle never reads the pool price at purchase time, because that can be moved inside one transaction. The
  keeper pushes a bounded median instead, and buyers pass a maximum cost.
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

If `binaries.soliditylang.org` is unreachable, install `solc@0.8.26` from npm and set `SOLCJS_PATH` to its
`soljson.js`.

## License

MIT.
