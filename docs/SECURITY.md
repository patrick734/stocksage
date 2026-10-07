# StockSage trust model

## On-chain

| Role | Holder | Can | Cannot |
|---|---|---|---|
| Admin | OpenZeppelin `TimelockController`, 48h delay, proposer/executor = the admin wallet | set $SAGE once, set the deploy fee (≤ 1 ETH), set or reset the oracle price, tune oracle bounds within hard limits, unpause, unblock, unfreeze | change the 60/30/10 or 80/20 splits, move a creator's earnings, edit someone else's agent |
| Guardian | Separate wallet | pause deploys and sales, freeze the price, block an agent from sale | unpause, unfreeze, unblock, move funds |
| Keeper | Hot wallet (key only in GitHub secrets) | push the price, ±10% per push, once per 10 minutes | anything else |
| Deployer | Dev wallet | nothing after deployment | anything |

The treasury is the timelock itself, so treasury funds move only by a public proposal that waits 48 hours.

### Oracle

A pool's spot price can be moved for free inside one transaction, so purchases never read it. The keeper reads
the Pons pool three times 15 seconds apart, takes the median and pushes it, bounded by the contract's step limit.
A compromised keeper can move the price at most 10% per 10 minutes, and the guardian can freeze it. Buyers always
pass a maximum cost, so a price change between quote and transaction cannot overcharge them.

## Off-chain

- Payment is on-chain; serving replies is not. If the servers stop, purchased uses cannot be used until they are
  back. Uses are tracked per wallet in Redis and never expire.
- Agent configurations are stored by the backend. Their hashes are on-chain, so a swapped configuration is
  detectable by anyone ("Verify" on each agent page).
- Creator instructions are treated as untrusted: StockSage's rules come first in every system prompt.
- Sign-in is a signed message with a single-use nonce (10 minutes); sessions are HMAC-signed httpOnly cookies.

## Not yet done

The contracts have not had an independent audit. Keep the deploy fee and prices modest until they have.

## Audit scope

`contracts/src/AgentRegistry.sol`, `AgentMarket.sol`, `TokenOracle.sol`, `libraries/TokenBurn.sol`,
`governance/GovernanceChecks.sol`.
