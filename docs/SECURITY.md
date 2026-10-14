# StockSage trust model

## On-chain

| Role | Holder | Can | Cannot |
|---|---|---|---|
| Owner | The dev wallet (two-step transfer) | set $SAGE once per contract, set the rate, the deployment fee and its burn share, the purchase split, the treasury and the oracle; pause and unpause; deploy agents for free before $SAGE is set | move a creator's earnings or anyone's tokens, edit someone else's agent |
| Creator | Whoever deployed an agent | change that agent's price, configuration and on/off switch | anything else |

- Changes take effect at once: there is no timelock. The owner wallet is the main trust assumption.
- Every purchase and deployment pays out in the same transaction, straight from the payer: creator share to the
  creator, burn share to `0x…dEaD`, the rest to the treasury. The contracts never hold funds and have no withdraw
  function.
- The rate (`SageOracle.sagePerEth`) is set by hand. Buyers pass a maximum cost and creators a maximum fee, so a rate
  change between the quote and the transaction can never charge more than they approved.

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

`contracts/src/SageOracle.sol`, `SageQuote.sol`, `AgentRegistry.sol`, `AgentMarket.sol`.
